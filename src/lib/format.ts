/**
 * Formats a number as Indian Rupee currency (e.g. ₹15,43,060.00).
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Formats a percentage with sign and 2 decimal places (e.g. +14.25% or -3.10%).
 */
export function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * Formats a decimal number, falling back to a dash if null or undefined.
 */
export function formatNumber(value: number | null | undefined, fallback = "-"): string {
  if (value === null || value === undefined || isNaN(value)) return fallback;
  return value.toFixed(2);
}

/**
 * Formats a timestamp into a human-readable local time string.
 */
export function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  } catch {
    return isoString;
  }
}
