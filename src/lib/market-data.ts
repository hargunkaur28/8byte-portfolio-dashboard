import { Holding, MarketQuote } from "@/types/portfolio";
import { PORTFOLIO_HOLDINGS } from "@/data/portfolio";

// Yahoo Finance symbol mapping (NSE symbol formatted as <SYMBOL>.NS or BSE as <SYMBOL>.BO)
const YAHOO_SYMBOLS: Record<string, string> = {
  HDFCBANK: "HDFCBANK.NS",
  BAJFINANCE: "BAJFINANCE.NS",
  "532174": "ICICIBANK.NS",
  "544252": "BAJAJHFL.NS",
  "511577": "SAVFI.BO",
  AFFLE: "AFFLE.NS",
  LTIM: "LTM.NS",
  "542651": "KPITTECH.NS",
  "544028": "TATATECH.NS",
  "544107": "BLSE.NS",
  "532790": "TANLA.NS",
  DMART: "DMART.NS",
  "532540": "TATACONSUM.NS",
  "500331": "PIDILITIND.NS",
  "500400": "TATAPOWER.NS",
  "542323": "KPIGREEN.NS",
  "532667": "SUZLON.NS",
  "542851": "GENSOL.NS",
  "543517": "HARIOMPIPE.NS",
  ASTRAL: "ASTRAL.NS",
  "542652": "POLYCAB.NS",
  "543318": "CLEAN.NS",
  "506401": "DEEPAKNTR.NS",
  "541557": "FINEORG.NS",
  "533282": "GRAVITA.NS",
  "540719": "SBILIFE.NS",
};

// Google Finance query symbol mapping (<SYMBOL>:NSE or <BSE_CODE>:BOM)
const GOOGLE_SYMBOLS: Record<string, string> = {
  HDFCBANK: "HDFCBANK:NSE",
  BAJFINANCE: "BAJFINANCE:NSE",
  "532174": "532174:BOM",
  "544252": "544252:BOM",
  "511577": "511577:BOM",
  AFFLE: "AFFLE:NSE",
  LTIM: "LTIM:NSE",
  "542651": "542651:BOM",
  "544028": "544028:BOM",
  "544107": "544107:BOM",
  "532790": "532790:BOM",
  DMART: "DMART:NSE",
  "532540": "500800:BOM", // Tata Consumer Products is 500800 on BSE / TATACONSUM:NSE
  "500331": "500331:BOM",
  "500400": "500400:BOM",
  "542323": "542323:BOM",
  "532667": "532667:BOM",
  "542851": "542851:BOM",
  "543517": "543517:BOM",
  ASTRAL: "ASTRAL:NSE",
  "542652": "542652:BOM",
  "543318": "543318:BOM",
  "506401": "506401:BOM",
  "541557": "541557:BOM",
  "533282": "533282:BOM",
  "540719": "540719:BOM",
};

/**
 * Fetches CMP from Yahoo Finance chart v8 endpoint.
 * Returns null if the request fails, times out, or returns unexpected data.
 */
export async function fetchYahooCmp(ticker: string): Promise<number | null> {
  const sym = YAHOO_SYMBOLS[ticker];
  if (!sym) return null;

  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === "number" && !isNaN(price) ? price : null;
  } catch {
    return null;
  }
}

/**
 * Parses P/E and Earnings per share from Google Finance quote HTML.
 */
function parseGoogleFinance(html: string): { pe: number | null; earnings: number | null } {
  let pe: number | null = null;
  let earnings: number | null = null;

  // Extract P/E ratio
  const peMatch = html.match(/P\/E ratio<\/div><div[^>]*>([0-9.,]+)<\/div>/i);
  if (peMatch && peMatch[1]) {
    const val = parseFloat(peMatch[1].replace(/,/g, ""));
    if (!isNaN(val)) pe = val;
  }

  // Extract Latest Earnings (EPS)
  const epsIdx = html.indexOf("Earnings per share");
  if (epsIdx !== -1) {
    const chunk = html.substring(epsIdx, epsIdx + 400);
    const epsMatch = chunk.match(/<div class="CNzF7d">([0-9.,-]+)<\/div>/);
    if (epsMatch && epsMatch[1] && epsMatch[1] !== "-") {
      const val = parseFloat(epsMatch[1].replace(/,/g, ""));
      if (!isNaN(val)) earnings = val;
    }
  }

  return { pe, earnings };
}

/**
 * Fetches P/E and Latest Earnings from Google Finance public quote page.
 * Returns null fields on failure or timeout.
 */
export async function fetchGoogleFundamentals(
  ticker: string
): Promise<{ pe: number | null; earnings: number | null }> {
  const sym = GOOGLE_SYMBOLS[ticker];
  if (!sym) return { pe: null, earnings: null };

  try {
    const res = await fetch(`https://www.google.com/finance/quote/${sym}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return { pe: null, earnings: null };
    const html = await res.text();
    return parseGoogleFinance(html);
  } catch {
    return { pe: null, earnings: null };
  }
}

// In-memory cache for rate-limit protection (10-second cooldown)
interface CacheState {
  quotes: Record<string, MarketQuote>;
  timestamp: string;
  lastFetchMs: number;
}

let cache: CacheState | null = null;
const CACHE_TTL_MS = 10_000; // 10 seconds

/**
 * Fetches combined market data for all portfolio holdings.
 * Respects in-memory 10-second cooldown unless forceRefresh is set.
 */
export async function getMarketData(
  holdings: Holding[] = PORTFOLIO_HOLDINGS,
  forceRefresh = false
): Promise<{ quotes: Record<string, MarketQuote>; cached: boolean; timestamp: string }> {
  const now = Date.now();

  // Return cached quotes if within cooldown
  if (!forceRefresh && cache && now - cache.lastFetchMs < CACHE_TTL_MS) {
    return {
      quotes: cache.quotes,
      cached: true,
      timestamp: cache.timestamp,
    };
  }

  // Fetch Yahoo CMP and Google Fundamentals independently and concurrently
  const yahooPromises = holdings.map(async (h) => {
    const cmp = await fetchYahooCmp(h.ticker);
    return { ticker: h.ticker, cmp };
  });

  const googlePromises = holdings.map(async (h) => {
    const fundamentals = await fetchGoogleFundamentals(h.ticker);
    return { ticker: h.ticker, ...fundamentals };
  });

  const [yahooResults, googleResults] = await Promise.all([
    Promise.all(yahooPromises),
    Promise.all(googlePromises),
  ]);

  const yahooMap = new Map(yahooResults.map((y) => [y.ticker, y.cmp]));
  const googleMap = new Map(googleResults.map((g) => [g.ticker, { pe: g.pe, earnings: g.earnings }]));

  const quotes: Record<string, MarketQuote> = {};

  for (const h of holdings) {
    const liveCmp = yahooMap.get(h.ticker);
    const liveGf = googleMap.get(h.ticker);

    const isCmpLive = liveCmp !== null && liveCmp !== undefined;
    const isFundamentalsLive =
      (liveGf?.pe !== null && liveGf?.pe !== undefined) ||
      (liveGf?.earnings !== null && liveGf?.earnings !== undefined);

    quotes[h.ticker] = {
      cmp: isCmpLive ? (liveCmp as number) : h.fallbackCmp,
      pe: isFundamentalsLive && liveGf?.pe !== null && liveGf?.pe !== undefined ? liveGf.pe : h.fallbackPe,
      earnings:
        isFundamentalsLive && liveGf?.earnings !== null && liveGf?.earnings !== undefined
          ? liveGf.earnings
          : h.fallbackEarnings,
      isCmpLive,
      isFundamentalsLive,
    };
  }

  const timestamp = new Date().toISOString();
  cache = {
    quotes,
    timestamp,
    lastFetchMs: now,
  };

  return {
    quotes,
    cached: false,
    timestamp,
  };
}
