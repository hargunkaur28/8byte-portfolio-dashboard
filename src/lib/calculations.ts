import { Holding, MarketQuote, DisplayHolding, SectorSummary } from "@/types/portfolio";

/**
 * Calculates investment cost from purchase price and quantity.
 */
export function calculateInvestment(purchasePrice: number, quantity: number): number {
  return purchasePrice * quantity;
}

/**
 * Calculates current market value of a holding.
 */
export function calculatePresentValue(cmp: number, quantity: number): number {
  return cmp * quantity;
}

/**
 * Calculates absolute gain or loss.
 */
export function calculateGainLoss(presentValue: number, investment: number): number {
  return presentValue - investment;
}

/**
 * Calculates percentage gain or loss. Returns 0 if investment is 0.
 */
export function calculateGainLossPct(gainLoss: number, investment: number): number {
  if (investment === 0) return 0;
  return (gainLoss / investment) * 100;
}

/**
 * Computes portfolio percentage relative to total investment.
 */
export function calculatePortfolioPct(investment: number, totalInvestment: number): number {
  if (totalInvestment === 0) return 0;
  return (investment / totalInvestment) * 100;
}

/**
 * Computes enriched DisplayHolding items given raw holdings and optional live quotes.
 * If a live quote is missing or partial, falls back to the Excel snapshot.
 */
export function computeDisplayHoldings(
  holdings: Holding[],
  quotes: Record<string, MarketQuote> = {}
): DisplayHolding[] {
  const totalInvestment = holdings.reduce(
    (sum, h) => sum + calculateInvestment(h.purchasePrice, h.quantity),
    0
  );

  return holdings.map((h) => {
    const investment = calculateInvestment(h.purchasePrice, h.quantity);
    const portfolioPct = calculatePortfolioPct(investment, totalInvestment);

    const quote = quotes[h.ticker];
    const isCmpLive = quote?.isCmpLive ?? false;
    const isFundamentalsLive = quote?.isFundamentalsLive ?? false;

    const cmp = isCmpLive && quote ? quote.cmp : h.fallbackCmp;
    const pe = isFundamentalsLive && quote ? quote.pe : h.fallbackPe;
    const earnings = isFundamentalsLive && quote ? quote.earnings : h.fallbackEarnings;

    const presentValue = calculatePresentValue(cmp, h.quantity);
    const gainLoss = calculateGainLoss(presentValue, investment);
    const gainLossPct = calculateGainLossPct(gainLoss, investment);

    return {
      ...h,
      investment,
      portfolioPct,
      cmp,
      presentValue,
      gainLoss,
      gainLossPct,
      pe,
      earnings,
      isCmpLive,
      isFundamentalsLive,
    };
  });
}

/**
 * Groups display holdings by sector and aggregates sector totals.
 * Preserves the original sector order found in the portfolio.
 */
export function computeSectorSummaries(displayHoldings: DisplayHolding[]): SectorSummary[] {
  const sectorMap = new Map<string, DisplayHolding[]>();

  for (const item of displayHoldings) {
    const list = sectorMap.get(item.sector);
    if (list) {
      list.push(item);
    } else {
      sectorMap.set(item.sector, [item]);
    }
  }

  const summaries: SectorSummary[] = [];

  for (const [sector, items] of sectorMap.entries()) {
    const totalInvestment = items.reduce((sum, h) => sum + h.investment, 0);
    const totalPresentValue = items.reduce((sum, h) => sum + h.presentValue, 0);
    const totalGainLoss = calculateGainLoss(totalPresentValue, totalInvestment);
    const totalGainLossPct = calculateGainLossPct(totalGainLoss, totalInvestment);

    summaries.push({
      sector,
      holdings: items,
      totalInvestment,
      totalPresentValue,
      totalGainLoss,
      totalGainLossPct,
    });
  }

  return summaries;
}

/**
 * Calculates overall portfolio aggregates across all display holdings.
 */
export function computePortfolioTotals(displayHoldings: DisplayHolding[]): {
  totalInvestment: number;
  totalPresentValue: number;
  totalGainLoss: number;
  totalGainLossPct: number;
} {
  const totalInvestment = displayHoldings.reduce((sum, h) => sum + h.investment, 0);
  const totalPresentValue = displayHoldings.reduce((sum, h) => sum + h.presentValue, 0);
  const totalGainLoss = calculateGainLoss(totalPresentValue, totalInvestment);
  const totalGainLossPct = calculateGainLossPct(totalGainLoss, totalInvestment);

  return {
    totalInvestment,
    totalPresentValue,
    totalGainLoss,
    totalGainLossPct,
  };
}
