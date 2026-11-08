// "Is this budget realistic?" Nemotron says what the plan is; real listings say what it costs.
// Plain code compares the two. No listings, no opinion: we never guess a price range.

import { briefFromGuess, interpretPlan } from '../agent/plan';
import { DEMO_ASOF } from '../people';
import { daysBetween } from '../engine/dates';
import { money0 } from '../format';
import { normalizeRentals, normalizeShopping, productParams, rentalParams, runSearch } from './serpapi';

export type BudgetVerdict = 'tooLow' | 'tight' | 'ok' | 'high';
export interface PriceRange { low: number; typical: number; high: number }
export interface BudgetCheck extends PriceRange { verdict: BudgetVerdict; message: string; kind: 'product' | 'trip' }

const MIN_PRICES = 3;

/** The extremes of a search are often junk, so "low" and "high" skip the outer 10%. */
export function priceRange(prices: number[]): PriceRange | null {
  const sorted = prices.filter((p) => p > 0).sort((a, b) => a - b);
  if (sorted.length < MIN_PRICES) return null;
  const at = (share: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
  return { low: at(0.1), typical: at(0.5), high: at(0.9) };
}

export function judgeBudget(amount: number, r: PriceRange): BudgetVerdict {
  if (amount < r.low) return 'tooLow';
  if (amount < r.typical) return 'tight';
  return amount > r.high * 3 ? 'high' : 'ok';
}

function tripMessage(verdict: BudgetVerdict, amount: number, r: PriceRange, place: string, nights: number): string {
  const stay = `A ${nights}-night stay in ${place}`;
  if (verdict === 'tooLow') return `${money0(amount)} won’t cover this. ${stay} starts around ${money0(r.low)}, before flights and food.`;
  if (verdict === 'tight') return `${money0(amount)} is tight. ${stay} usually runs about ${money0(r.typical)}, before flights and food.`;
  return `${stay} usually runs about ${money0(r.typical)}, so ${money0(amount)} leaves about ${money0(amount - r.typical)} for flights, food and activities. Flights aren’t included in this check.`;
}

function productMessage(verdict: BudgetVerdict, amount: number, r: PriceRange): string {
  const usual = `usually costs ${money0(r.low)} to ${money0(r.high)}`;
  if (verdict === 'tooLow') return `${money0(amount)} looks too low. This ${usual}.`;
  if (verdict === 'tight') return `${money0(amount)} is on the low side. This ${usual}, about ${money0(r.typical)} typically.`;
  if (verdict === 'high') return `${money0(amount)} is well above what this ${usual.replace('usually costs', 'usually costs:')}.`;
  return `${money0(amount)} looks realistic. This ${usual}.`;
}

/** Null means no opinion: the plan isn't something we can price, or the search is unavailable. */
export async function checkBudget(input: { name: string; amount: number; targetDate: string; people: number }): Promise<BudgetCheck | null> {
  const guess = await interpretPlan(input.name);
  if (!guess || guess.kind === 'other') return null;
  const brief = briefFromGuess(guess, input.name, input.people, input.targetDate, DEMO_ASOF);
  if (!brief) return null;

  if (guess.kind === 'product') {
    const res = await runSearch(productParams(guess.searchTerms, 'best'), normalizeShopping);
    const range = res.source === 'unavailable' ? null : priceRange(res.offers.map((o) => o.unitPrice ?? 0));
    if (!range) return null;
    const verdict = judgeBudget(input.amount, range);
    return { ...range, verdict, kind: 'product', message: productMessage(verdict, input.amount, range) };
  }

  const stay = { location: brief.location as string, checkIn: brief.checkIn as string, checkOut: brief.checkOut as string };
  const nights = daysBetween(stay.checkIn, stay.checkOut);
  const res = await runSearch(rentalParams(brief, stay, 'best'), (json, at) => normalizeRentals(json, nights, stay.location, at));
  const range = res.source === 'unavailable' ? null : priceRange(res.offers.map((o) => o.stayTotal ?? 0));
  if (!range) return null;
  const verdict = judgeBudget(input.amount, range);
  return { ...range, verdict: verdict === 'high' ? 'ok' : verdict, kind: 'trip', message: tripMessage(verdict, input.amount, range, stay.location, nights) };
}
