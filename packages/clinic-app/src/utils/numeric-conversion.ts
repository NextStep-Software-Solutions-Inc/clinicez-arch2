
/**
 * SQLite does not natively support decimal types, so we store them as strings.
 * These utility functions help convert between string and number representations.
 */

/**
 * Converts a number to a decimal string with specified precision.
 * @param value The number to convert.
 * @param precision Number of decimal places (default is 2).
 * @returns The decimal string representation of the number.
 */
export function toDecimalString({
  value, precision = 2
}: {
  value: number;
  precision?: number
}): string {
  return value.toFixed(precision);
}

/**
 * Converts a decimal string to a number.
 * @param value The decimal string to convert.
 * @returns The number representation of the decimal string.
 */
export function fromDecimalString(value: string): number {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
}
