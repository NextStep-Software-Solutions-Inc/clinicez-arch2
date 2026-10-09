/** Money helpers. Amounts are handled in whole cents so that adding, comparing and splitting never drift. */

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** Parses a typed amount ("1,250.50"); returns null unless it is a positive number with at most two decimals. */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value > 0 ? value : null;
}

/** Like `parseAmount` but allows zero (opening floats, counted cash). */
export function parseAmountOrZero(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Number(cleaned);
}

export function formatMoney(amount: number, currency: string = 'PHP'): string {
  try {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Change due when the customer hands over more than the amount to collect (never negative). */
export function changeDue(amount: number, tendered: number): number {
  return Math.max(0, fromCents(toCents(tendered) - toCents(amount)));
}
