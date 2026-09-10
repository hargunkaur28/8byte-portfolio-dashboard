// Static holding extracted from the Excel workbook
export interface Holding {
  name: string;
  sector: string;
  ticker: string;                  // Exact NSE symbol or BSE scrip code from Excel
  purchasePrice: number;
  quantity: number;
  fallbackCmp: number;             // Excel snapshot CMP
  fallbackPe: number | null;       // Excel snapshot P/E (null if #N/A)
  fallbackEarnings: number | null; // Excel snapshot EPS (null if #N/A)
}

// Market quote representation (isolated from UI loading/error states)
export interface MarketQuote {
  cmp: number;
  pe: number | null;
  earnings: number | null;
  isCmpLive: boolean;              // true: live from Yahoo Finance; false: Excel snapshot
  isFundamentalsLive: boolean;     // true: live from Google Finance; false: Excel snapshot
}

// Computed holding enriched with calculations for UI presentation
export interface DisplayHolding extends Holding {
  investment: number;              // purchasePrice * quantity
  portfolioPct: number;            // (investment / totalPortfolioInvestment) * 100
  cmp: number;                     // live quote CMP or fallbackCmp
  presentValue: number;            // cmp * quantity
  gainLoss: number;                // presentValue - investment
  gainLossPct: number;             // (gainLoss / investment) * 100
  pe: number | null;               // live quote PE or fallbackPe
  earnings: number | null;         // live quote Earnings or fallbackEarnings
  isCmpLive: boolean;
  isFundamentalsLive: boolean;
}

// Sector-level aggregated summary
export interface SectorSummary {
  sector: string;
  holdings: DisplayHolding[];
  totalInvestment: number;
  totalPresentValue: number;
  totalGainLoss: number;
  totalGainLossPct: number;
}
