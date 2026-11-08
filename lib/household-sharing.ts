import type { FinancialPicture, HealthResult, HouseholdMember, Connections } from './types';

export const SHARING_OPTIONS = [
  { key: 'balances', label: 'Account balances', detail: 'Account names, types and current balances.' },
  { key: 'income', label: 'Income and payday', detail: 'Detected paycheck amount, cadence and next payday.' },
  { key: 'obligations', label: 'Bills and loans', detail: 'Scheduled payment names, amounts, dates and essential tags.' },
  { key: 'goals', label: 'Savings goals', detail: 'Goal names and amounts set aside.' },
  { key: 'transactions', label: 'Recent transactions', detail: 'The most recent 20 transaction descriptions, amounts and dates.' },
  { key: 'health', label: 'Health score', detail: 'Overall score and status only. Indicator details remain private.' },
] as const;
export type SharingScope = typeof SHARING_OPTIONS[number]['key'];
export type SharingSettings = Record<SharingScope, boolean>;
export const PRIVATE_SETTINGS: SharingSettings = { balances: false, income: false, obligations: false, goals: false, transactions: false, health: false };
export const ALL_SETTINGS: SharingSettings = { balances: true, income: true, obligations: true, goals: true, transactions: true, health: true };

export function cleanSharing(value: unknown): SharingSettings {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return Object.fromEntries(SHARING_OPTIONS.map(({ key }) => [key, record[key] === true])) as SharingSettings;
}

export interface SharedHouseholdData {
  balances?: Pick<FinancialPicture['accounts'][number], 'nickname' | 'type' | 'balance'>[];
  income?: Pick<NonNullable<FinancialPicture['paycheck']>, 'avgAmount' | 'cadenceDays' | 'nextDate'> | null;
  obligations?: Pick<FinancialPicture['obligations'][number], 'name' | 'amount' | 'nextDate' | 'cadence' | 'essential'>[];
  goals?: Pick<FinancialPicture['goals'][number], 'name' | 'amount'>[];
  transactions?: Pick<FinancialPicture['txns'][number], 'date' | 'amount' | 'description' | 'kind'>[];
  health?: Pick<HealthResult, 'score' | 'overall'>;
}
export interface SharedHouseholdMember extends HouseholdMember {
  sharing: SharingSettings;
  data: SharedHouseholdData;
  unavailable: boolean;
}
export interface HouseholdPayload {
  household: Connections['household'];
  settings: SharingSettings;
  members: SharedHouseholdMember[];
}

/** Explicit allowlist: no private fields, IDs, ratios, flags or forecasts hitchhike. */
export function projectHouseholdData(p: FinancialPicture, health: HealthResult | null, s: SharingSettings): SharedHouseholdData {
  const data: SharedHouseholdData = {};
  if (s.balances) data.balances = p.accounts.map(({ nickname, type, balance }) => ({ nickname, type, balance }));
  if (s.income) data.income = p.paycheck ? { avgAmount: p.paycheck.avgAmount, cadenceDays: p.paycheck.cadenceDays, nextDate: p.paycheck.nextDate } : null;
  if (s.obligations) data.obligations = p.obligations.map(({ name, amount, nextDate, cadence, essential }) => ({ name, amount, nextDate, cadence, essential }));
  if (s.goals) data.goals = p.goals.map(({ name, amount }) => ({ name, amount }));
  if (s.transactions) data.transactions = [...p.txns].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)).slice(0, 20).map(({ date, amount, description, kind }) => ({ date, amount, description, kind }));
  if (s.health && health) data.health = { score: health.score, overall: health.overall };
  return data;
}
