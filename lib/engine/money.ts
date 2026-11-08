// Boundary conversion only. Engine calculations use safe integer cents.
export function toCents(dollars: number): number {
  if (!Number.isFinite(dollars)) throw new Error('Money must be finite');
  const cents = Math.round((dollars + Math.sign(dollars) * Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents)) throw new Error('Money exceeds the supported range');
  return cents;
}

export function parseMoney(text: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(text.trim())) return null;
  const [whole, fraction = ''] = text.trim().split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

export const validCents = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;
