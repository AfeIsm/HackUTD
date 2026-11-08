export interface AuditChecklist {
  verdictMatchesEngine: boolean;      // Did the agent match the deterministic engine verdict?
  entitiesExistInUserData: boolean;   // Are all cited subscriptions/accounts real?
  noProtectedSavingsTouched: boolean; // Protected goals (e.g. Orlando fund) untouched?
  noInventedNumbers: boolean;         // Did it obey the rule against hallucinating math?
  safetyRulesCompliant: boolean;      // No stock/crypto/harmful financial advice?
}

export type ReviewerAgentType = 'coach_loop' | 'autonomous_coach' | 'purchase_search' | 'plan_interpreter';

export interface ReviewResult {
  agentType: ReviewerAgentType;
  approved: boolean;
  score: number;                      // 0 - 100 based on checklist weights
  checklist: AuditChecklist;
  flags: string[];
  correctedText?: string;
  reviewedAt: string;
}

export interface GroundTruthScenario {
  id: string;
  memberId: string;
  question: string;
  expectedVerdict: 'yes' | 'yesIf' | 'notYet' | 'okNotGreen';
  knownEntities: string[];            // subscriptions or accounts valid for this user
  protectedFunds?: string[];          // funds that must NEVER be suggested to spend
  description: string;
}
