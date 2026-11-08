import type { AffordResult, FinancialPicture, ForecastPoint } from '../types';
import type { BuyQuestion } from './buyOptions';
import type { Proposal } from '../purchase/types';
import { canAfford } from '../engine/afford';
import { addDays, addMonths, daysBetween, nextSemiMonthly } from '../engine/dates';
import { validDate } from '../engine/validation';

export interface BuyScenario {
  id: 'now' | 'payday' | 'cheaper';
  title: string;
  question: BuyQuestion | null;
  result: AffordResult | null;
  points: ForecastPoint[];
  lowest: ForecastPoint | null;
  offer: Proposal | null;
  unavailable: string | null;
}

function nextPayday(picture: FinancialPicture, question: BuyQuestion, asOf: string): string | null {
  const pay = picture.paycheck;
  if (!pay || pay.accountId !== question.sourceAccountId || ![7, 14, 15, 30].includes(pay.cadenceDays) || !validDate(pay.nextDate) || !validDate(question.date)) return null;
  if (pay.semiMonthlyDays && (pay.semiMonthlyDays.length !== 2 || pay.semiMonthlyDays.some((day) => !Number.isInteger(day) || day < 1 || day > 31) || pay.semiMonthlyDays[0] >= pay.semiMonthlyDays[1])) return null;
  let date = pay.nextDate;
  // Use the same calendar helpers as the forecast, including month-end and semi-monthly pay.
  for (let n = 0; n < 2000 && daysBetween(asOf, date) <= 335; n++) {
    if (date > question.date && date >= asOf) return date;
    date = pay.cadenceDays === 30 ? addMonths(pay.nextDate, n + 1)
      : pay.cadenceDays === 15 && pay.semiMonthlyDays ? nextSemiMonthly(date, pay.semiMonthlyDays)
      : addDays(date, pay.cadenceDays);
  }
  return null;
}

function liveLowerPrice(offer: Proposal, cost: number): boolean {
  if (offer.demo || offer.kind !== 'product' || !Number.isSafeInteger(offer.total) || offer.total <= 0 || offer.total >= cost || !offer.link || offer.linkIsSearch) return false;
  try { return ['https:', 'http:'].includes(new URL(offer.link).protocol); } catch { return false; }
}

export function buildBuyScenarios(picture: FinancialPicture, purchase: BuyQuestion, offers: Proposal[], asOf: string): BuyScenario[] {
  const evaluate = (id: BuyScenario['id'], title: string, question: BuyQuestion, offer: Proposal | null = null): BuyScenario => {
    const result = canAfford(picture, question, asOf);
    const points = result.missingInputs.length ? [] : result.after.accountForecasts[question.sourceAccountId] ?? [];
    // Select an existing engine output for display; do not calculate new balances in the UI.
    const lowest = points.reduce<ForecastPoint | null>((low, point) => !low || point.balance < low.balance ? point : low, null);
    return { id, title, question, result, points, lowest, offer, unavailable: null };
  };
  const unavailable = (id: BuyScenario['id'], title: string, reason: string): BuyScenario => ({ id, title, question: null, result: null, points: [], lowest: null, offer: null, unavailable: reason });
  const payday = nextPayday(picture, purchase, asOf);
  const offer = offers.filter((candidate) => liveLowerPrice(candidate, purchase.cost)).sort((a, b) => a.total - b.total)[0];
  return [
    evaluate('now', purchase.date === asOf ? 'Buy now' : 'Buy as planned', purchase),
    payday ? evaluate('payday', 'Wait for payday', { ...purchase, date: payday })
      : unavailable('payday', 'Wait for payday', 'No later payday is confirmed for this account in the supported forecast.'),
    offer ? evaluate('cheaper', 'Buy cheaper', { ...purchase, label: offer.title, cost: offer.total }, offer)
      : unavailable('cheaper', 'Buy cheaper', 'No live lower-priced product listing is available yet.'),
  ];
}
