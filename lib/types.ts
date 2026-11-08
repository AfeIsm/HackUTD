// lib/types.ts: shared contract. Only the Lead edits this file.
// Need a new field? Ask the Lead.

// ---------- Basics ----------
export type Status = 'green' | 'yellow' | 'red';
export type Source = 'checking' | 'savings';

// ---------- Money data (from Nessie) ----------
export interface Account {
  id: string;
  type: 'Checking' | 'Savings' | 'Credit Card';
  nickname: string;
  balance: number;
  limit?: number; // credit cards only
}

export interface Txn {
  id: string;
  accountId: string;
  source?: Source;
  kind: 'purchase' | 'deposit' | 'withdrawal' | 'transfer';
  amount: number;
  date: string; // YYYY-MM-DD
  description: string;
  merchant?: string;
  category?: string;
}

// Bills + loans + subscriptions, ONE list
export interface Obligation {
  key: string;
  name: string;
  amount: number;
  nextDate: string; // YYYY-MM-DD
  cadence: 'weekly' | 'biweekly' | 'monthly';
  essential: boolean;
  origin: 'bill' | 'loan' | 'detected';
}

// User override of an obligation's essential tag
export interface ObligationTag {
  obligationKey: string;
  essential: boolean;
}

// Engine inputs. Backend maps raw Nessie bills/loans into these,
// so the engine never depends on Nessie's field names.
export interface Bill {
  id: string;
  payee: string;
  amount: number;
  nextDate: string; // YYYY-MM-DD
  cadence?: Obligation['cadence']; // defaults to monthly
  category?: string;
}

export interface Loan {
  id: string;
  type: string; // e.g. "car", "student"
  monthlyPayment: number;
  nextDate: string; // YYYY-MM-DD
}

export interface Paycheck {
  avgAmount: number;
  cadenceDays: number;
  nextDate: string; // YYYY-MM-DD
}

export interface SavingsGoal {
  id: string;
  name: string;
  amount: number;
  huddleId?: string;
}

// Everything about one person: the engine's main input
export interface FinancialPicture {
  memberId: string;
  accounts: Account[];
  txns: Txn[];
  obligations: Obligation[];
  paycheck: Paycheck | null; // null = no paycheck detected
  goals: SavingsGoal[];
}

// ---------- Health score (engine output) ----------
export type IndicatorKey =
  | 'essentialBills'
  | 'cushion'
  | 'debtLoad'
  | 'savingsProtection'
  | 'nonEssential';

export interface Indicator {
  key: IndicatorKey;
  label: string;
  weight: number; // 40, 20, 15, 15, 10
  value: number; // raw number, e.g. 106.4
  display: string; // formatted, e.g. "$106"
  status: Status;
  points: 0 | 50 | 100;
  explanation: string;
}

export interface ForecastPoint {
  date: string; // YYYY-MM-DD
  balance: number;
}

export interface HealthResult {
  memberId: string;
  score: number;
  overall: Status;
  indicators: Indicator[];
  forecast: ForecastPoint[];
  dataHash: string; // same data → same hash
  checkedAt: string; // ISO timestamp
  trigger: string; // what caused this check
  flags: string[]; // e.g. "Uses emergency savings"
}

// ---------- What-ifs (Can I buy, fix plans) ----------
// A hypothetical change the engine simulates. Meaning of each kind:
//   oneTime  : `amount` leaves `source` (default checking) on `date` (default today).
//   weekly   : same, every 7 days starting `date` (default 7 days from today).
//   monthly  : same, every month starting `date` (default 1 month from today).
//              Negative amount = money that stops leaving (e.g. "cut dining $35/wk" = -35).
//   With goalId: the money moves INTO savings for that goal instead of being spent
//              (e.g. "set aside $45/week for the PS6 fund").
//   cancelObligation : stop paying `obligationKey` from `date` (default today); amount ignored.
export interface Change {
  kind: 'oneTime' | 'weekly' | 'monthly' | 'cancelObligation';
  amount: number;
  source?: Source;
  date?: string;
  label: string;
  goalId?: string;
  obligationKey?: string;
}

export interface AffordResult {
  verdict: 'yes' | 'yesIf' | 'no';
  reason: string;
  scoreBefore: number;
  scoreAfter: number;
  weeklySavingsNeeded?: number;
  readyDate?: string;
  flags: string[];
}

export interface FixPlan {
  summary: string;
  changes: Change[];
  scoreBefore: number;
  scoreAfter: number;
  dataHash: string; // reused while the hash matches
}

// ---------- Huddles ----------
export type HuddlePhase = 'pledging' | 'revealed' | 'agreeing' | 'locked' | 'cancelled';

// What OTHER members can see. pledge is null until phase >= 'revealed'.
export interface HuddleParticipantPublic {
  memberId: string;
  name: string;
  isPaying: boolean;
  committed: boolean;
  pledge: number | null;
  agreed: boolean | null;
}

// What one viewer gets from the API
export interface HuddleView {
  id: string;
  name: string;
  totalCost: number;
  targetDate: string;
  phase: HuddlePhase;
  round: number;
  committedCount: number;
  payingCount: number;
  totalCommitted: number | null;
  shortfall: number | null;
  participants: HuddleParticipantPublic[];
  // ONLY the viewer's own private data
  me: {
    pledge: number | null;
    source: Source | null;
    checkPassed: boolean | null;
    privateFeedback: FixPlan | null;
  };
}

export type DeclineReason = 'changeMyAmount' | 'unfairSplit' | 'totalOrDate' | 'out';

// ---------- Agent ----------
// One line in the "Nemotron is working" feed
export interface AgentStep {
  type: 'plan' | 'tool' | 'result' | 'final';
  text: string;
  tool?: string;
}
