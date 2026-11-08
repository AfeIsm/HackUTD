import type { AffordResult, FinancialPicture, ForecastPoint, HealthResult, MoneyCents } from '../types';
import type { BuyQuestion } from './buyOptions';
import { canAffordPurchases, MAX_PURCHASES, purchaseTotal } from '../engine/basket';
import { scoreHealth } from '../engine/health';
import { addDays, addMonths, daysBetween, nextSemiMonthly } from '../engine/dates';
import { validDate } from '../engine/validation';

export interface BuyScenario {
  id: 'now' | 'payday' | 'skip';
  title: string;
  question: BuyQuestion | null;
  purchases: BuyQuestion[];
  totalCost: MoneyCents | null;
  result: AffordResult | null;
  points: ForecastPoint[];
  lowest: ForecastPoint | null;
  baseline: HealthResult | null;
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

export function buildBuyScenarios(picture: FinancialPicture, purchase: BuyQuestion | BuyQuestion[], asOf: string): BuyScenario[] {
  const purchases = Array.isArray(purchase) ? purchase : [purchase];
  const first = purchases[0];
  const multiple = purchases.length > 1;
  const skipTitle = multiple ? "Don't buy any" : "Don't buy it";
  const evaluate = (id: BuyScenario['id'], title: string, items: BuyQuestion[]): BuyScenario => {
    const question = items[0] ?? null;
    const result = canAffordPurchases(picture, items, asOf);
    const points = result.missingInputs.length || !question ? [] : result.after.accountForecasts[question.sourceAccountId] ?? [];
    // Select an existing engine output for display; do not calculate new balances in the UI.
    const lowest = points.reduce<ForecastPoint | null>((low, point) => !low || point.balance < low.balance ? point : low, null);
    return { id, title, question, purchases: items, totalCost: purchaseTotal(items), result, points, lowest, baseline: null, unavailable: null };
  };
  const unavailable = (id: BuyScenario['id'], title: string, reason: string): BuyScenario => ({ id, title, question: null, purchases: [], totalCost: id === 'skip' ? 0 : null, result: null, points: [], lowest: null, baseline: null, unavailable: reason });
  const earliest = purchases.reduce<BuyQuestion | undefined>((early, item) => !early || item.date < early.date ? item : early, undefined);
  const payday = earliest ? nextPayday(picture, earliest, asOf) : null;
  const delayed = payday ? purchases.map((item) => item.date < payday ? { ...item, date: payday } : item) : null;
  const ownAccount = first && picture.accounts.some((a) => a.id === first.sourceAccountId && a.ownerMemberId === picture.memberId && a.type !== 'Credit Card');
  let skip = unavailable('skip', skipTitle, 'Choose an owned checking or savings account to see its forecast.');
  const validPurchases = purchases.length > 0 && purchases.length <= MAX_PURCHASES && purchaseTotal(purchases) !== null && purchases.every((item) => item.sourceAccountId === first.sourceAccountId && (item.goalId ?? '') === (first.goalId ?? '') && validDate(item.date) && item.date >= asOf && daysBetween(asOf, item.date) <= 335);
  if (ownAccount && validPurchases) {
    const lastDate = [...purchases, ...(delayed ?? [])].reduce((last, item) => item.date > last ? item.date : last, asOf);
    const days = Math.max(30, daysBetween(asOf, lastDate) + 30);
    // No synthetic zero-cost purchase: ask the engine for the unchanged plan with no new outflow.
    const baseline = scoreHealth(picture, { asOf, days });
    const points = baseline.missingInputs.length ? [] : baseline.accountForecasts[first.sourceAccountId] ?? [];
    const lowest = points.reduce<ForecastPoint | null>((low, point) => !low || point.balance < low.balance ? point : low, null);
    skip = { id: 'skip', title: skipTitle, question: null, purchases: [], totalCost: 0, result: null, baseline, points, lowest, unavailable: null };
  }
  return [
    evaluate('now', multiple ? 'Buy all as planned' : first?.date === asOf ? 'Buy now' : 'Buy as planned', purchases),
    delayed ? evaluate('payday', 'Wait for payday', delayed)
      : unavailable('payday', 'Wait for payday', 'No later payday is confirmed for this account in the supported forecast.'),
    skip,
  ];
}
