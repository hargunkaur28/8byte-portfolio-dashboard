import { NextResponse } from "next/server";
import { getMarketData } from "@/lib/market-data";
import { PORTFOLIO_HOLDINGS } from "@/data/portfolio";
import { MarketQuote } from "@/types/portfolio";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get("force") === "true";

    const result = await getMarketData(PORTFOLIO_HOLDINGS, forceRefresh);

    return NextResponse.json(
      {
        success: true,
        timestamp: result.timestamp,
        cached: result.cached,
        holdingsCount: PORTFOLIO_HOLDINGS.length,
        quotes: result.quotes,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error fetching market data";

    // If an unexpected system-level error occurs, fallback gracefully to Excel snapshots
    const fallbackQuotes: Record<string, MarketQuote> = {};
    for (const h of PORTFOLIO_HOLDINGS) {
      fallbackQuotes[h.ticker] = {
        cmp: h.fallbackCmp,
        pe: h.fallbackPe,
        earnings: h.fallbackEarnings,
        isCmpLive: false,
        isFundamentalsLive: false,
      };
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
        cached: false,
        holdingsCount: PORTFOLIO_HOLDINGS.length,
        quotes: fallbackQuotes,
      },
      {
        status: 200, // Return 200 with fallback data so client dashboard remains operable
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  }
}
