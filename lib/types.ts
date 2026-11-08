// Shared financial contract. All monetary numbers are integer cents.
// Convert provider dollars and form input at the boundary; format cents only for display.
export type MoneyCents = number;

// ---------- Basics ----------
export type Status = 'green' | 'yellow' | 'red' | 'needsInput';
export type Source = 'checking' | 'savings';

// ---------- Money data (from Nessie) ----------
export interface Account {
  id: string;
  ownerMemberId: string;
  type: 'Checking' | 'Savings' | 'Credit Card';
  nickname: string;
  balance: MoneyCents;
  limit?: MoneyCents; // credit cards only
  minimumPayment?: MoneyCents; // confirmed metadata; never inferred from the balance
}

export interface Txn {
  id: string;
  accountId: string;
  source?: Source;
  kind: 'purchase' | 'deposit' | 'withdrawal' | 'transfer';
  amount: MoneyCents;
  date: string; // YYYY-MM-DD
  description: string;
  merchant?: string;
  category?: string;
  goalAllocationUsed?: MoneyCents; // recorded portion paid from a matching earmark
}

// Bills + loans + subscriptions, ONE list
export interface Obligation {
  accountId: string;
  key: string;
  name: string;
  amount: MoneyCents;
  nextDate: string; // YYYY-MM-DD
  cadence: 'weekly' | 'biweekly' | 'monthly';
  essential: boolean;
  origin: 'bill' | 'loan' | 'detected' | 'cardMinimum';
}

// User override of an obligation's essential tag
export interface ObligationTag {
  obligationKey: string;
  essential: boolean;
}

// Engine inputs. Backend maps raw Nessie bills/loans into these,
// so the engine never depends on Nessie's field names.
export interface Bill {
  accountId: string;
  id: string;
  payee: string;
  amount: MoneyCents;
  nextDate: string; // YYYY-MM-DD
  cadence?: Obligation['cadence']; // defaults to monthly
  category?: string;
}

export interface Loan {
  accountId: string;
  id: string;
  type: string; // e.g. "car", "student"
  monthlyPayment: MoneyCents;
  nextDate: string; // YYYY-MM-DD
}

export interface Paycheck {
  accountId: string;
  avgAmount: MoneyCents;
  cadenceDays: number;
  // Semi-monthly uses calendar days, rather than repeating every 15 days.
  semiMonthlyDays?: [number, number];
  nextDate: string; // YYYY-MM-DD
}

export interface SavingsGoal {
  accountId: string;
  id: string;
  name: string;
  amount: MoneyCents;
  huddleId?: string;
}

export interface Reservation {
  id: string;
  sourceAccountId: string;
  amount: MoneyCents;
  date: string;
  goalId?: string;
}

// Everything about one person: the engine's main input
export interface FinancialPicture {
  memberId: string;
  accounts: Account[];
  txns: Txn[];
  obligations: Obligation[];
  paycheck: Paycheck | null; // null = no paycheck detected
  goals: SavingsGoal[];
  reservations: Reservation[];
  missingInputs: string[];
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
  value: number | null; // money values are cents; ratios are dimensionless
  display: string; // formatted, e.g. "$106"
  status: Status;
  points: 0 | 50 | 100 | null;
  explanation: string;
}

export interface ForecastPoint {
  date: string; // YYYY-MM-DD
  balance: MoneyCents;
}

export interface HealthResult {
  memberId: string;
  score: number | null;
  overall: Status;
  indicators: Indicator[];
  forecast: ForecastPoint[];
  accountForecasts: Record<string, ForecastPoint[]>;
  missingInputs: string[];
  dataHash: string; // same data → same hash
  checkedAt: string; // ISO timestamp
  trigger: string; // what caused this check
  flags: string[]; // e.g. "Uses emergency savings"
}

// ---------- What-ifs (Can I buy, fix plans) ----------
// Hypothetical flows always name an exact account. goalId on a purchase consumes
// that account's earmark; it does not add money to savings. Saving is an explicit
// transfer using destinationAccountId. Cancellation has no monetary flow.
export interface Change {
  kind: 'oneTime' | 'weekly' | 'monthly' | 'cancelObligation';
  amount: MoneyCents;
  sourceAccountId?: string; // required for every monetary change
  destinationAccountId?: string; // explicit internal transfer
  date?: string;
  label: string;
  goalId?: string;
  obligationKey?: string;
}

export interface AffordResult {
  verdict: 'yes' | 'yesIf' | 'no';
  reason: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  weeklySavingsNeeded?: number;
  readyDate?: string;
  flags: string[];
  missingInputs: string[];
  sourceAccountId: string;
  liquid: boolean; // the chosen account stays non-negative on the asked date
  before: HealthResult;
  after: HealthResult;
  verifiedAlternative?: { date: string; sourceAccountId: string; result: HealthResult };
}

// One concrete step of a fix plan. amount meaning depends on kind:
// cancel = monthly saving, move = one-time transfer, save = weekly transfer.
export interface FixStep {
  kind: 'cancel' | 'move' | 'save';
  label: string; // "Cancel Hulu"
  detail: string; // why / what it does, with exact numbers from the engine
  amount: MoneyCents;
  obligationKey?: string;
  fromAccountId?: string;
  toAccountId?: string;
  weeks?: number; // save only: how long until the target is reached
}

// Built by lib/engine/fixplan.ts (plain math, no AI). Same data → same plan (saved by dataHash).
export interface FixPlan {
  summary: string;
  steps: FixStep[];
  changes: Change[]; // the scored what-if changes (cancellations); a move is applied to balances
  scoreBefore: number | null;
  scoreAfter: number | null;
  statusBefore: Status;
  statusAfter: Status;
  stillNotGreen: string[]; // indicator labels still not green after the plan
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
  totalCost: MoneyCents;
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
    sourceAccountId: string | null;
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

// ---------- Accounts (F6) ----------
// What the browser may know about a logged-in user. Never includes the password hash.
export interface PublicUser {
  id: string;
  username: string; // shown as @username
  name: string;
  email: string;
  memberId: string | null; // links to their money data; null until they have accounts
}

// ---------- Friends + household (F6) ----------
// Someone you're connected to. No email, no money data: just who they are.
export interface PersonRef {
  userId: string | null; // null = no login (e.g. a 10-year-old)
  username: string | null;
  name: string;
  memberId: string | null; // their money data, if any
}
export type HouseholdRole = 'owner' | 'spouse' | 'dependent';
export interface HouseholdMember extends PersonRef {
  role: HouseholdRole;
}
export interface ConnectionRequest {
  id: string;
  kind: 'friend' | 'household';
  role: 'spouse' | 'dependent' | null; // household invites only
  from: PersonRef;
  to: PersonRef;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}
export interface Connections {
  friends: PersonRef[];
  household: { owner: PersonRef; members: HouseholdMember[]; iAmOwner: boolean } | null;
  incoming: ConnectionRequest[]; // pending, sent to me
  sent: ConnectionRequest[]; // sent by me (pending or answered)
}
