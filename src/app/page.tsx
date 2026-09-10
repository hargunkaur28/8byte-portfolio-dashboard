"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { PORTFOLIO_HOLDINGS } from "@/data/portfolio";
import { MarketQuote } from "@/types/portfolio";
import {
  computeDisplayHoldings,
  computeSectorSummaries,
  computePortfolioTotals,
} from "@/lib/calculations";
import {
  formatCurrency,
  formatPercent,
  formatNumber,
  formatTime,
} from "@/lib/format";

export default function PortfolioDashboard() {
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({});
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isFetchingRef = useRef<boolean>(false);

  // Fetch market quotes from API route
  const fetchQuotes = useCallback(async (force = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsRefreshing(true);

    try {
      const url = force ? "/api/market-data?force=true" : "/api/market-data";
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();

      if (data?.quotes) {
        setQuotes(data.quotes);
        setLastUpdated(data.timestamp || new Date().toISOString());
        setErrorMessage(null);
      } else {
        setErrorMessage("Using static Excel snapshot due to unexpected response format.");
      }
    } catch {
      setErrorMessage("Network error connecting to market feed. Displaying Excel snapshot.");
    } finally {
      setIsRefreshing(false);
      isFetchingRef.current = false;
    }
  }, []);

  // Initial load and 15-second automatic polling
  useEffect(() => {
    let isCancelled = false;

    async function initialLoad() {
      try {
        const res = await fetch("/api/market-data", { cache: "no-store" });
        const data = await res.json();
        if (!isCancelled && data?.quotes) {
          setQuotes(data.quotes);
          setLastUpdated(data.timestamp || new Date().toISOString());
          setErrorMessage(null);
        }
      } catch {
        if (!isCancelled) {
          setErrorMessage("Network error connecting to market feed. Displaying Excel snapshot.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    initialLoad();

    const interval = setInterval(() => {
      fetchQuotes(false);
    }, 15000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [fetchQuotes]);

  // Compute all display metrics using verified calculation logic
  const displayHoldings = computeDisplayHoldings(PORTFOLIO_HOLDINGS, quotes);
  const sectorSummaries = computeSectorSummaries(displayHoldings);
  const totals = computePortfolioTotals(displayHoldings);

  // Gain/Loss color helper
  const getGainLossColor = (value: number) => {
    if (value > 0) return "text-emerald-700 bg-emerald-50 border-emerald-200";
    if (value < 0) return "text-rose-700 bg-rose-50 border-rose-200";
    return "text-slate-700 bg-slate-50 border-slate-200";
  };

  const getGainLossText = (value: number) => {
    if (value > 0) return "text-emerald-600 font-semibold";
    if (value < 0) return "text-rose-600 font-semibold";
    return "text-slate-600 font-semibold";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-slate-300 border-t-indigo-600 rounded-full animate-spin" />
          <h2 className="text-lg font-medium text-slate-800">Loading Portfolio Dashboard...</h2>
          <p className="text-sm text-slate-500">Connecting to live market data feeds</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 pb-16">
      {/* Top Navigation / App Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-indigo-600" />
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Octa Byte AI — Dynamic Portfolio Dashboard
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Live CMP via Yahoo Finance • P/E & Latest Earnings via Google Finance • Excel Fallback
            </p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            {lastUpdated && (
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Updated: {formatTime(lastUpdated)}</span>
              </div>
            )}

            <button
              onClick={() => fetchQuotes(true)}
              disabled={isRefreshing}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all flex items-center gap-1.5 cursor-pointer ${
                isRefreshing
                  ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                  : "bg-white text-slate-700 hover:bg-slate-50 border-slate-300 active:bg-slate-100 shadow-xs"
              }`}
            >
              <svg
                className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-indigo-600" : "text-slate-500"}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span>{isRefreshing ? "Refreshing..." : "Refresh Now"}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* Error / Fallback Notice Banner if API encountered issues */}
        {errorMessage && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-2.5 rounded-lg flex items-center justify-between">
            <span>⚠️ {errorMessage}</span>
            <button
              onClick={() => fetchQuotes(true)}
              className="text-amber-900 font-semibold underline ml-2 hover:opacity-80"
            >
              Retry
            </button>
          </div>
        )}

        {/* 1. Portfolio Summary Cards */}
        <section aria-label="Portfolio Summary">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Total Investment */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Total Investment
              </span>
              <div className="text-2xl font-bold text-slate-900 mt-1">
                {formatCurrency(totals.totalInvestment)}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                26 active holdings across 6 sectors
              </p>
            </div>

            {/* Card 2: Total Present Value */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Present Portfolio Value
              </span>
              <div className="text-2xl font-bold text-slate-900 mt-1">
                {formatCurrency(totals.totalPresentValue)}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Current market value of active holdings
              </p>
            </div>

            {/* Card 3: Total Gain/Loss */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Total Gain / Loss
              </span>
              <div className={`text-2xl font-bold mt-1 ${getGainLossText(totals.totalGainLoss)}`}>
                {totals.totalGainLoss > 0 ? "+" : ""}
                {formatCurrency(totals.totalGainLoss)}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${getGainLossColor(
                    totals.totalGainLoss
                  )}`}
                >
                  {formatPercent(totals.totalGainLossPct)}
                </span>
                <span className="text-xs text-slate-500">Overall return</span>
              </div>
            </div>

            {/* Card 4: Feed Status */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Data Feed Status
              </span>
              <div className="mt-2 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Yahoo (CMP):</span>
                  <span className="font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Live
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Google (P/E & EPS):</span>
                  <span className="font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Live
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                  <span>Auto-refresh:</span>
                  <span>Every ~15s</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2 & 3. Sector Grouping & Holdings Tables */}
        <section aria-label="Portfolio Holdings by Sector" className="space-y-6">
          {sectorSummaries.map((sec) => (
            <div
              key={sec.sector}
              className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden"
            >
              {/* Sector Header with Summary Bar */}
              <div className="bg-slate-50/80 px-4 sm:px-6 py-3.5 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  <h2 className="text-base font-bold text-slate-900">{sec.sector}</h2>
                  <span className="text-xs font-normal text-slate-500">
                    ({sec.holdings.length} {sec.holdings.length === 1 ? "holding" : "holdings"})
                  </span>
                </div>

                {/* Sector Level Totals Summary */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <div>
                    <span className="text-slate-500">Inv: </span>
                    <span className="font-semibold text-slate-800">
                      {formatCurrency(sec.totalInvestment)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Value: </span>
                    <span className="font-semibold text-slate-800">
                      {formatCurrency(sec.totalPresentValue)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Gain/Loss: </span>
                    <span className={`font-semibold ${getGainLossText(sec.totalGainLoss)}`}>
                      {sec.totalGainLoss > 0 ? "+" : ""}
                      {formatCurrency(sec.totalGainLoss)}
                    </span>
                  </div>
                  <span
                    className={`inline-block text-[11px] font-semibold px-1.5 py-0.5 rounded border ${getGainLossColor(
                      sec.totalGainLoss
                    )}`}
                  >
                    {formatPercent(sec.totalGainLossPct)}
                  </span>
                </div>
              </div>

              {/* Holdings Table with Horizontal Scroll on Narrow Screens */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700 whitespace-nowrap">
                  <thead className="bg-slate-100/50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th scope="col" className="py-3 px-4">Particulars</th>
                      <th scope="col" className="py-3 px-3">Code</th>
                      <th scope="col" className="py-3 px-3 text-right">Buy Price</th>
                      <th scope="col" className="py-3 px-3 text-right">Qty</th>
                      <th scope="col" className="py-3 px-3 text-right">Investment</th>
                      <th scope="col" className="py-3 px-3 text-right">Port %</th>
                      <th scope="col" className="py-3 px-4 text-right">CMP (₹)</th>
                      <th scope="col" className="py-3 px-4 text-right">Present Value</th>
                      <th scope="col" className="py-3 px-4 text-right">Gain / Loss</th>
                      <th scope="col" className="py-3 px-4 text-right">P/E Ratio</th>
                      <th scope="col" className="py-3 px-4 text-right">Latest Earnings (EPS)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sec.holdings.map((h) => (
                      <tr
                        key={h.ticker}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        {/* 1. Particulars */}
                        <td className="py-3 px-4 font-medium text-slate-900">
                          {h.name}
                        </td>

                        {/* 2. NSE/BSE Code */}
                        <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                          {h.ticker}
                        </td>

                        {/* 3. Purchase Price */}
                        <td className="py-3 px-3 text-right text-slate-800">
                          ₹{h.purchasePrice.toFixed(2)}
                        </td>

                        {/* 4. Qty */}
                        <td className="py-3 px-3 text-right text-slate-800">
                          {h.quantity}
                        </td>

                        {/* 5. Investment */}
                        <td className="py-3 px-3 text-right font-medium text-slate-900">
                          {formatCurrency(h.investment)}
                        </td>

                        {/* 6. Portfolio % */}
                        <td className="py-3 px-3 text-right text-slate-600">
                          {h.portfolioPct.toFixed(2)}%
                        </td>

                        {/* 7. CMP with Live / Snapshot badge */}
                        <td className="py-3 px-4 text-right">
                          <div className="font-medium text-slate-900">
                            ₹{h.cmp.toFixed(2)}
                          </div>
                          <span
                            className={`inline-block text-[10px] font-medium px-1.5 py-0.2 rounded ${
                              h.isCmpLive
                                ? "text-emerald-700 bg-emerald-50 border border-emerald-200"
                                : "text-amber-700 bg-amber-50 border border-amber-200"
                            }`}
                          >
                            {h.isCmpLive ? "Live" : "Snapshot"}
                          </span>
                        </td>

                        {/* 8. Present Value */}
                        <td className="py-3 px-4 text-right font-medium text-slate-900">
                          {formatCurrency(h.presentValue)}
                        </td>

                        {/* 9. Gain / Loss (Value and %) */}
                        <td className="py-3 px-4 text-right">
                          <div className={`font-semibold ${getGainLossText(h.gainLoss)}`}>
                            {h.gainLoss > 0 ? "+" : ""}
                            {formatCurrency(h.gainLoss)}
                          </div>
                          <span
                            className={`inline-block text-[10px] px-1.5 py-0.2 rounded border ${getGainLossColor(
                              h.gainLoss
                            )}`}
                          >
                            {formatPercent(h.gainLossPct)}
                          </span>
                        </td>

                        {/* 10. P/E Ratio with Live / Snapshot badge */}
                        <td className="py-3 px-4 text-right">
                          <div className="font-medium text-slate-800">
                            {formatNumber(h.pe)}
                          </div>
                          <span
                            className={`inline-block text-[10px] font-medium px-1.5 py-0.2 rounded ${
                              h.isFundamentalsLive
                                ? "text-emerald-700 bg-emerald-50 border border-emerald-200"
                                : "text-amber-700 bg-amber-50 border border-amber-200"
                            }`}
                          >
                            {h.isFundamentalsLive ? "Live" : "Snapshot"}
                          </span>
                        </td>

                        {/* 11. Latest Earnings with Live / Snapshot badge */}
                        <td className="py-3 px-4 text-right">
                          <div className="font-medium text-slate-800">
                            {formatNumber(h.earnings)}
                          </div>
                          <span
                            className={`inline-block text-[10px] font-medium px-1.5 py-0.2 rounded ${
                              h.isFundamentalsLive
                                ? "text-emerald-700 bg-emerald-50 border border-emerald-200"
                                : "text-amber-700 bg-amber-50 border border-amber-200"
                            }`}
                          >
                            {h.isFundamentalsLive ? "Live" : "Snapshot"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
