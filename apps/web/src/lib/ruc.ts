const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

/** Modulo 11 check digit over the first 10 digits (same rule as the API domain). */
export function rucCheckDigit(first10: string): number {
  let sum = 0;
  for (let i = 0; i < WEIGHTS.length; i++) {
    sum += Number(first10.charAt(i)) * (WEIGHTS[i] ?? 0);
  }
  return (11 - (sum % 11)) % 10;
}

export function isValidRuc(value: string): boolean {
  return /^\d{11}$/.test(value) && rucCheckDigit(value.slice(0, 10)) === Number(value.charAt(10));
}

/** Builds a valid RUC from its first 10 digits (used by mock seeds and tests). */
export function rucFrom(first10: string): string {
  return `${first10}${rucCheckDigit(first10)}`;
}
