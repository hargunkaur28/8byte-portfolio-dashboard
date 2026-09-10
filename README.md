# Dynamic Portfolio Dashboard — Octa Byte AI Case Study

A responsive, real-time portfolio management dashboard built with Next.js, TypeScript, and Tailwind CSS. The application displays 26 active Indian equity holdings grouped across 6 sectors, calculating real-time investment metrics and updating live market data via ~15-second HTTP polling with independent fallback mechanisms.

---

## Features

- **Portfolio Holdings Table:** Tracks 26 active holdings with Purchase Price, Quantity, Investment, Portfolio %, NSE/BSE Code, CMP, Present Value, Gain/Loss, Gain/Loss %, P/E Ratio, and Latest Earnings (EPS).
- **Sector Aggregation:** Organizes holdings into 6 sectors (Financial, Tech, Consumer, Power, Pipe Sector, Others) with sector-level subtotal bars for Investment, Present Value, Gain/Loss, and Return %.
- **Dual-Provider Market Feeds:**
  - **Yahoo Finance:** Real-time Current Market Price (CMP).
  - **Google Finance:** Live P/E Ratio and Latest Earnings (EPS).
- **Strict Provider Isolation:** A failure in Yahoo Finance falls back to snapshot CMP without breaking Google Finance data, and vice versa.
- **Excel Snapshot Fallbacks:** Built-in resilience using the verified workbook snapshot if live market queries fail, time out, or encounter rate limits.
- **Visual Fallback Transparency:** Discrete, color-coded badges visibly distinguish `Live` real-time data from `Snapshot` fallback data on every metric.
- **Automatic ~15-Second Refresh:** Background polling keeps valuations up to date without UI disruption or page reloading.
- **Manual Refresh:** "Refresh Now" button with in-flight protection and automatic cooldown bypass (`?force=true`).
- **Responsive Layout:** Clean grid and touch-scrollable tables that adapt seamlessly across desktop, tablet, and mobile viewports.

---

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript 5 (Strict Mode)
- **Styling:** Tailwind CSS v4 (Pure utility styling, zero external component libraries)
- **Runtime:** Node.js (v20+)
- **Data Fetching:** Native Node.js `fetch` with `AbortSignal.timeout`

---

## Architecture Overview

```
                      +---------------------------------------+
                      |         Next.js Client (UI)           |
                      |                                       |
                      |  - Top Portfolio Summary Cards        |
                      |  - 6 Sector Groups & Holdings Tables  |
                      |  - 15s Polling Hook / Manual Trigger  |
                      |  - Discrete Live / Snapshot Badges    |
                      +-------------------+-------------------+
                                          |
                                          | GET /api/market-data (every ~15s)
                                          v
                      +---------------------------------------+
                      |        Next.js Route Handler          |
                      |         (/api/market-data)            |
                      |                                       |
                      |  - 10-second in-memory cooldown cache |
                      |  - Concurrent provider execution      |
                      +---------+-------------------+---------+
                                |                   |
                      Fetch CMP |                   | Fetch P/E & EPS
                                v                   v
                     +--------------------+   +--------------------+
                     |   Yahoo Finance    |   |   Google Finance   |
                     |  (Chart Endpoint)  |   |  (Web Quote HTML)  |
                     +---------+----------+   +---------+----------+
                               |                        |
                       Timeout | / Error        Timeout | / Error
                               +-----------+------------+
                                           |
                                           v
                              +--------------------------+
                              | Static Excel Fallback    |
                              | (portfolio.ts baseline)  |
                              | isLive = false           |
                              +--------------------------+
```

---

## Data Flow & Calculations

All portfolio metrics are computed using pure, deterministic functions (`src/lib/calculations.ts`):

1. **Investment:** $\text{Purchase Price} \times \text{Quantity}$
2. **Portfolio %:** $(\text{Investment} / \text{Total Portfolio Investment}) \times 100$
3. **Present Value:** $\text{CMP} \times \text{Quantity}$
4. **Gain / Loss:** $\text{Present Value} - \text{Investment}$
5. **Gain / Loss %:** $(\text{Gain / Loss} / \text{Investment}) \times 100$
6. **Sector Subtotals:** Aggregated directly from member holdings.
7. **Total Portfolio Investment:** Exactly **₹15,43,060.00** across all 26 holdings.

---

## Market-Data Strategy & Provider Isolation

| Metric | Source Provider | Method | Fallback on Failure |
| :--- | :--- | :--- | :--- |
| **CMP** | Yahoo Finance | Public v8 Chart API (`query1.finance.yahoo.com`) | Excel snapshot CMP (`isCmpLive: false`) |
| **P/E Ratio** | Google Finance | Public HTML quote (`google.com/finance/quote`) | Excel snapshot P/E (`isFundamentalsLive: false`) |
| **Latest Earnings (EPS)** | Google Finance | Public HTML quote (`google.com/finance/quote`) | Excel snapshot EPS (`isFundamentalsLive: false`) |

- **Decoupled Execution:** Both providers run concurrently inside `Promise.allSettled`.
- **Failure Resilience:**
  - If Yahoo Finance is blocked: CMP defaults to the snapshot value while Google Finance P/E & EPS remain `Live`.
  - If Google Finance is blocked: P/E & EPS default to snapshot values while Yahoo Finance CMP remains `Live`.

---

## Project Structure

```text
8byte-portfolio-dashboard/
├── F9001561_ADDBA737E8_B72562937A.xlsx   # Authoritative assignment Excel file (unmodified)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── market-data/
│   │   │       └── route.ts              # Market data endpoint with cooldown caching
│   │   ├── globals.css                   # Global styles with Tailwind CSS v4 import
│   │   ├── layout.tsx                    # Root layout with metadata and title
│   │   └── page.tsx                      # Main interactive portfolio dashboard
│   ├── data/
│   │   └── portfolio.ts                  # Authoritative 26 holdings dataset with fallbacks
│   ├── lib/
│   │   ├── calculations.ts               # Pure calculation functions
│   │   ├── format.ts                     # Currency (INR), percent, and date formatters
│   │   └── market-data.ts                # Yahoo/Google fetchers and cache manager
│   └── types/
│       └── portfolio.ts                  # Clean TypeScript domain models
├── AGENTS.md                             # Project requirements and conventions
├── TECHNICAL_CHALLENGES.md               # Detailed technical analysis and tradeoffs
├── README.md                             # Project documentation
├── package.json                          # Scripts and core dependencies
└── tsconfig.json                         # TypeScript configuration with "@/*" alias
```

---

## Local Setup & Development

### Prerequisites
- **Node.js:** v18.18.0 or later (v20+ recommended)
- **npm:** v9+

### Installation
```bash
# Clone repository
git clone <repo-url>
cd 8byte-portfolio-dashboard

# Install dependencies
npm install
```

### Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Type-Check & Linting
```bash
npm run lint
```

### Production Build
```bash
npm run build
npm run start
```

---

## Environment Variables

**None required.** The application operates without external API keys or secrets, querying public financial data directly from the server.

---

## Known Limitations

1. **Savani Financials (`511577`):** As an illiquid BSE-only microcap, it is not indexed by Yahoo Finance. The dashboard cleanly displays its Excel fallback CMP (`₹14.86`) tagged with a `Snapshot` badge.
2. **Unofficial Web Scraping Surface:** Google Finance periodically alters DOM classes; our parser matches semantic markers (`P/E ratio` and `Earnings per share`) to maximize resilience, falling back gracefully to snapshot data if structure changes.
3. **Single-Instance Caching:** The 10-second cooldown cache is stored in Node.js module memory, which is simple and ideal for single-instance or serverless cold-starts, but does not synchronize across multi-region server clusters.

---

## Deployment Instructions

### Vercel (Recommended)
1. Push this repository to GitHub.
2. Import the project into [Vercel](https://vercel.com).
3. Framework Preset will automatically detect **Next.js**.
4. Deploy. No additional build settings or environment variables are required.

### Netlify
1. Connect your repository to Netlify.
2. Build command: `npm run build`
3. Publish directory: `.next`
4. Deploy using the official `@netlify/plugin-nextjs`.
