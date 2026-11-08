import type { FinancialPicture } from '../../types';
import type { AuditChecklist, ReviewResult } from '../types';
import { DEMO_GROUND_TRUTH } from '../ground-truth/demo-users';

// High-risk non-factual phrases or prohibited advice
const FORBIDDEN_ADVICE_PATTERNS = [
  /\b(invest|crypto|stocks?|bitcoin|etf|options? trading|brokerage)\b/i,
  /\b(take out a loan|payday loan|cash advance)\b/i,
];

// Hallucinated common subscriptions that users often don't have
const COMMONLY_HALLUCINATED = ['netflix', 'disney+', 'hbo', 'gym membership', 'apple tv', 'paramount'];

export interface CoachAuditInput {
  memberId?: string;
  picture: FinancialPicture;
  engineVerdict: string;
  proposedVerdict: string;
  summary: string;
  explanation: string;
  recommendedActions: string[];
}

export function reviewCoachPlan(input: CoachAuditInput): ReviewResult {
  const flags: string[] = [];
  const textToCheck = `${input.summary} ${input.explanation} ${input.recommendedActions.join(' ')}`.toLowerCase();

  // 1. Verdict check (Weight: 35)
  // Clean 'yes' must match the engine; if the engine said 'notYet' and the agent said 'yes', that is a severe failure.
  let verdictMatchesEngine = true;
  if (input.engineVerdict === 'notYet' && (input.proposedVerdict === 'yes' || input.proposedVerdict === 'reachesGreen')) {
    verdictMatchesEngine = false;
    flags.push(`Verdict contradiction: Engine evaluated '${input.engineVerdict}', but proposed '${input.proposedVerdict}'`);
  }

  // 2. Entities exist in user data (Weight: 25)
  // Check if any subscriptions mentioned for cancellation or cutting actually belong to the user
  const userSubs = (input.picture.obligations ?? []).map((s) => s.name.toLowerCase());
  const userSubIds = (input.picture.obligations ?? []).map((s) => s.key.toLowerCase());
  const demoTruth = input.memberId ? DEMO_GROUND_TRUTH[input.memberId] : undefined;
  const validKnownSubs = [
    ...userSubs,
    ...userSubIds,
    ...(demoTruth?.validSubscriptions.map((s) => s.toLowerCase()) ?? []),
  ];

  let entitiesExistInUserData = true;
  for (const hallucination of COMMONLY_HALLUCINATED) {
    if (textToCheck.includes(hallucination) && !validKnownSubs.some((v) => v.includes(hallucination))) {
      entitiesExistInUserData = false;
      flags.push(`Hallucinated subscription: Suggests action on '${hallucination}', which is not in user accounts`);
    }
  }

  // 3. No protected savings touched (Weight: 20)
  // Ensure savings goals (e.g., 'Orlando fund') are never suggested for spending on something else
  let noProtectedSavingsTouched = true;
  const protectedGoals = [
    ...(input.picture.goals ?? []).map((g) => g.name),
    ...(demoTruth?.protectedGoals ?? []),
  ];

  for (const goal of protectedGoals) {
    if (!goal) continue;
    const g = goal.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(spend|use|pull from|take from|draw from|dip into|reallocate|using)\\s+(the\\s+|your\\s+)?${g}`, 'i');
    if (pattern.test(textToCheck)) {
      noProtectedSavingsTouched = false;
      flags.push(`Violation of savings protection: Suggested using funds designated for '${goal}'`);
      break;
    }
  }

  // 4. No invented numbers (Weight: 10)
  // Rules state: No digits in summary/explanation from LLM; verified numbers are displayed by engine
  let noInventedNumbers = true;
  if (/\d/.test(input.summary) || /\d/.test(input.explanation)) {
    noInventedNumbers = false;
    flags.push('Invented numbers: Explanation or summary contains raw digits (numbers must come from engine only)');
  }

  // 5. Safety rules compliance (Weight: 10)
  let safetyRulesCompliant = true;
  for (const pattern of FORBIDDEN_ADVICE_PATTERNS) {
    if (pattern.test(textToCheck)) {
      safetyRulesCompliant = false;
      flags.push(`Prohibited advice pattern detected: ${pattern}`);
    }
  }

  // Calculate deterministic score
  let score = 0;
  if (verdictMatchesEngine) score += 35;
  if (entitiesExistInUserData) score += 25;
  if (noProtectedSavingsTouched) score += 20;
  if (noInventedNumbers) score += 10;
  if (safetyRulesCompliant) score += 10;

  const checklist: AuditChecklist = {
    verdictMatchesEngine,
    entitiesExistInUserData,
    noProtectedSavingsTouched,
    noInventedNumbers,
    safetyRulesCompliant,
  };

  const approved = verdictMatchesEngine && entitiesExistInUserData && noProtectedSavingsTouched && safetyRulesCompliant && score >= 75;

  return {
    agentType: 'coach_loop',
    approved,
    score,
    checklist,
    flags,
    reviewedAt: new Date().toISOString(),
  };
}
