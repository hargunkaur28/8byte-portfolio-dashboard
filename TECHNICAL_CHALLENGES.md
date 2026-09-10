# Technical Challenges & Architecture Decisions

This document details the engineering challenges, tradeoffs, data quality observations, and architectural decisions made while building the Dynamic Portfolio Dashboard for the Octa Byte AI technical assignment.

---

## 1. Unofficial Financial Data Sources

### The Challenge
The assignment requires Current Market Price (CMP) to be sourced from **Yahoo Finance** and P/E Ratio and Latest Earnings (EPS) to be sourced from **Google Finance**. Neither provider offers official, documented, public REST APIs for free consumption without enterprise licensing or developer keys.

### The Solution
Instead of integrating heavy third-party scraping libraries (such as Puppeteer, Playwright, or Cheerio) which inflate bundle size and slow down serverless cold starts, we implemented lightweight, native `fetch` requests directly inside Next.js route handlers:

1. **Yahoo Finance for CMP:**
   - We query the public v8 chart endpoint:
     `https://query1.finance.yahoo.com/v8/finance/chart/<SYMBOL>.NS` (or `.BO`)
   - This endpoint returns clean, structured JSON containing the `regularMarketPrice` field, responding within 150–300ms.
2. **Google Finance for P/E Ratio and Latest Earnings:**
   - We fetch the public quote page:
     `https://www.google.com/finance/quote/<SYMBOL>:NSE` (or `<BSE_CODE>:BOM`)
   - Google Finance server-renders fundamental data into the initial HTML. We parse `P/E ratio` and `Earnings per share` using targeted regular expressions matching the semantic label and its adjacent value container.
3. **Why Native Fetch over Scraping Libraries:**
   - Zero additional dependencies added to `package.json`.
   - Native integration with Node.js built-in `AbortSignal.timeout(5000)` to strictly bound network latency.
   - Low memory footprint and instant startup on platforms like Vercel and Netlify.

---

## 2. Excel Data Quality & Formula Anomalies

### The Challenge
The supplied Excel workbook (`F9001561_ADDBA737E8_B72562937A.xlsx`) is authoritative for portfolio holdings and fallback data. Inspecting the raw spreadsheet XML revealed that while the core portfolio rows (names, sectors, purchase prices, and quantities) are consistent, several fundamental formula cells in the workbook contain copy-paste discrepancies:

1. **Fine Organic (Row 32) & Gravita (Row 33):**
   - Both rows contained formulas copy-pasted from Row 31 (Deepak Nitrite), hardcoded to Google Finance for `"524200"` (Vinati Organics):
     ```xml
     <c r="M32"><f>IFERROR(__xludf.DUMMYFUNCTION("GOOGLEFINANCE(""524200"",""PE"")"),41.86)</f><v>41.86</v></c>
     <c r="N32"><f>IFERROR(__xludf.DUMMYFUNCTION("GOOGLEFINANCE(""524200"",""EPS"")"),37.26)</f><v>37.26</v></c>
     ```
   - As a result, the cached values in the workbook for Fine Organic and Gravita were frozen at `41.86` (P/E) and `37.26` (EPS), identical to Deepak Nitrite.
2. **SBI Life (Row 34):**
   - Column G specifies BSE code `540719` (SBI Life Insurance), but the formulas in M34 and N34 queried `"540768"` (Reliance Nippon Life Asset Management), producing `#N/A` for P/E and a negative EPS of `-5.82`.
3. **Tata Consumer Products (Row 18):**
   - Column G specifies code `532540` (TCS). The Col H CMP formula correctly overrides this with `"500800"` (Tata Consumer), but Col M and N formulas query `"532540"`, fetching TCS's P/E of `26.56` and EPS of `134.77`.
4. **Gensol (Row 24):**
   - Column G has `542851`, but Col M and N formulas query `"BORORENEW"` (Borosil Renewables).
5. **Bajaj Housing (Row 7):**
   - Column G has `544252`, but Col M and N formulas query `"543940"` (Tata Technologies).

### The Tradeoff & Decision
We established a strict separation between **fallback snapshot fidelity** and **live query accuracy**:
- **Workbook Snapshot Fidelity:** We preserved the literal cached values from the workbook (`41.86`, `37.26`, `-5.82`) inside `fallbackPe` and `fallbackEarnings`. We did not silently alter the authoritative Excel baseline.
- **Live Query Accuracy:** When querying live market data from Yahoo Finance and Google Finance, our server-side integration maps each holding to its **actual company ticker** (e.g. querying Google Finance for `FINEORG:BOM`, `GRAVITA:BOM`, `SBILIFE:BOM`, and `TATACONSUM:NSE`). This ensures the live dashboard displays real-world fundamentals while faithfully honoring the Excel snapshot during fallbacks.

---

## 3. Provider Isolation & Failure Handling

### The Challenge
A common design pitfall in multi-provider applications is cascading failure: if Google Finance times out or blocks requests, the entire market-data feed crashes, causing real-time prices from Yahoo Finance to be lost.

### The Solution
We implemented strict, independent provider isolation in `src/lib/market-data.ts`:

- **Independent Execution:** Yahoo Finance and Google Finance requests run in parallel via `Promise.allSettled`.
- **Decoupled Fallback Flags:**
  ```typescript
  const isCmpLive = liveCmp !== null && liveCmp !== undefined;
  const isFundamentalsLive =
    (liveGf?.pe !== null && liveGf?.pe !== undefined) ||
    (liveGf?.earnings !== null && liveGf?.earnings !== undefined);
  ```
- **Concrete Behavior:**
  - **Yahoo Failure:** CMP gracefully falls back to the Excel snapshot (`isCmpLive: false`). Live P/E and EPS from Google Finance remain unaffected (`isFundamentalsLive: true`).
  - **Google Failure:** P/E and EPS fall back to the Excel snapshot (`isFundamentalsLive: false`). Live CMP from Yahoo Finance remains unaffected (`isCmpLive: true`).
  - **Visual Distinction:** In the UI, each metric independently displays an emerald `Live` badge or an amber `Snapshot` badge, guaranteeing complete visibility into data provenance.

---

## 4. Rate Limiting & In-Memory Caching

### The Challenge
With automatic polling every ~15 seconds and users potentially clicking "Refresh Now" repeatedly, querying Yahoo and Google for 26 stocks on every request risks rate-limiting (HTTP 429) or IP blacklisting.

### The Decision: Module-Level Cooldown vs. Redis/Databases
In accordance with the **Karpathy Guidelines (Simplicity First)**, we rejected introducing Redis, memcached, Upstash, or database tables:
- **Solution:** A simple module-scoped in-memory cache with a 10-second TTL (`CACHE_TTL_MS = 10_000`):
  ```typescript
  let cache: CacheState | null = null;

  if (!forceRefresh && cache && now - cache.lastFetchMs < CACHE_TTL_MS) {
    return { quotes: cache.quotes, cached: true, timestamp: cache.timestamp };
  }
  ```
- **Why Redis Was Unnecessary:**
  - The portfolio is fixed at 26 holdings.
  - The application is a focused dashboard, not a multi-tenant enterprise system.
  - Adding Redis would introduce external infrastructure dependencies, configuration complexity, connection overhead, and deployment friction for a 3-day technical assignment.
- **Manual Bypass:** When a user explicitly clicks "Refresh Now", the client sends `?force=true`, intentionally bypassing the 10-second cooldown to deliver immediate live data.

---

## 5. 15-Second Refresh & Concurrency Guarding

### The Challenge
If a network request takes 3 seconds and the user clicks "Refresh Now" 4 times in rapid succession, overlapping asynchronous requests can cause race conditions, UI state flickering, and wasted server resources.

### The Solution
1. **Client-Side Guard:** We manage an in-flight ref `isFetchingRef = useRef(false)` alongside React state `isRefreshing`. If a refresh is already in progress, subsequent clicks are discarded immediately.
2. **Interval Management:** Background polling runs on a standard `useEffect` with `setInterval(..., 15000)`, clearing the timer on component unmount to prevent memory leaks.
3. **No Third-Party State Libraries:** Implemented entirely using native React hooks (`useState`, `useEffect`, `useCallback`, `useRef`), completely avoiding TanStack Query, SWR, Redux, or Zustand.

---

## 6. Deterministic Data Transformation

All financial calculations are decoupled into pure TypeScript functions (`src/lib/calculations.ts`):
- **Calculated at Runtime:** Investment, Portfolio %, Present Value, Gain/Loss, Gain/Loss %, and Sector Summaries.
- **Single Source of Truth:** Core values are never duplicated or hardcoded.
- **Numerical Verification:** Total portfolio investment calculated across the 26 active holdings equals **₹15,43,060.00**, exactly matching cell `E35` of the authoritative spreadsheet.

---

## 7. Network Resilience & Error Boundaries

The application enforces multiple layers of defensive handling:
1. **Request Timeouts:** Every external HTTP request has a strict 5-second timeout (`AbortSignal.timeout(5000)`). A slow response from Google or Yahoo cannot hang the API route.
2. **Per-Holding Isolation:** Errors during an individual stock lookup are caught locally, returning `null` for that holding without interrupting the remaining 25 stocks.
3. **Route-Level Safety Net:** If an unexpected system error occurs at the route handler level, the endpoint returns status 200 with the full set of 26 Excel snapshots, ensuring the frontend dashboard never crashes or shows a blank error screen.

---

## 8. Responsive Table Design

### The Challenge
A financial table with 11 distinct columns (`Particulars`, `Code`, `Buy Price`, `Qty`, `Investment`, `Port %`, `CMP`, `Present Value`, `Gain/Loss`, `P/E Ratio`, `Latest Earnings (EPS)`) cannot be shrunk into a 390px mobile viewport without making numbers unreadable or wrapping text awkwardly.

### The Solution
- **Desktop (1440px+):** Full 11-column table displayed in comfortable whitespace with tabular figures.
- **Tablet & Mobile (<768px):** The table container uses `overflow-x-auto` with `whitespace-nowrap`. This allows users to smoothly swipe horizontally across all 11 columns, preserving column alignment, decimal places, and readability.
- **Summary Cards:** Flexibly collapse from 4 columns on desktop to 2 columns on tablet, and a single vertical stack on mobile.

---

## 9. Simplicity & Defensible Architecture Decisions

Every significant technical decision in this project was made to be justifiable in a technical interview:

| Avoided Technology | Rationale for Omission |
| :--- | :--- |
| **Database (PostgreSQL / MongoDB)** | Portfolio holdings are static source data from the assignment's Excel file. Introducing a database would add setup overhead without solving a functional requirement. |
| **Authentication (NextAuth / JWT)** | Out of scope for the assignment requirements. |
| **State Libraries (Redux, Zustand)** | React's built-in state primitives (`useState`, `useEffect`, `useRef`) handle polling, quotes, and refresh states cleanly in under 40 lines of code. |
| **WebSockets / SSE** | Market data refreshes on an approximate 15-second cadence. HTTP polling via Next.js route handlers is drastically simpler, more reliable, and serverless-friendly. |
| **UI Component Libraries (shadcn, MUI)** | Standard Tailwind CSS v4 utility classes provide total design control with zero third-party component weight or dependency churn. |
| **Complex Abstraction Layers** | Avoided generic factories, repository patterns, or service registries in favor of direct functions and small, understandable modules. |

---

## 10. Known Limitations

1. **Google Finance Markup Volatility:** Google Finance does not provide a public API. While our regular expressions target semantic anchor text (`P/E ratio`, `Earnings per share`), major redesigns by Google could require parser updates. The dashboard handles this gracefully by defaulting to Excel snapshot data.
2. **Savani Financials (`511577`):** As a thinly traded BSE microcap, it is not indexed by Yahoo Finance. The dashboard cleanly displays its Excel fallback CMP (`₹14.86`) marked with a `Snapshot` pill.
3. **Single-Node In-Memory Cache:** The 10-second cooldown is stored in local Node.js process memory. In a distributed, multi-region serverless deployment, individual function instances maintain independent cooldown timestamps. For this assignment, this simplicity is vastly preferable to managing distributed cache infrastructure.
