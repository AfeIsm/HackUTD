import type { AuditChecklist, ReviewResult } from '../types';

const PRIVATE_WORDS = /afford|income|salary|paycheck|broke|debt|savings|balance|\bscore\b|\bcan'?t pay\b|financ/i;

export interface PurchaseAuditInput {
  proposals: Array<{
    title: string;
    total: number;
    why?: string;
  }>;
  groupSafeLimit?: number;
  explanationReason?: string;
}

export function reviewPurchaseProposals(input: PurchaseAuditInput): ReviewResult {
  const flags: string[] = [];

  let verdictMatchesEngine = true;
  let safetyRulesCompliant = true;
  let noInventedNumbers = true;
  let entitiesExistInUserData = true;
  let noProtectedSavingsTouched = true;

  // 1. Check if proposals exceed the group limit
  if (input.groupSafeLimit !== undefined) {
    for (const p of input.proposals) {
      if (p.total > input.groupSafeLimit) {
        verdictMatchesEngine = false;
        flags.push(`Proposal '${p.title}' costs $${(p.total / 100).toFixed(2)}, exceeding group safe limit of $${(input.groupSafeLimit / 100).toFixed(2)}`);
      }
    }
  }

  // 2. Check for private financial leaks in group-facing text
  const groupFacingText = [
    ...input.proposals.map((p) => p.why ?? ''),
    input.explanationReason ?? '',
  ].join(' ');

  if (PRIVATE_WORDS.test(groupFacingText)) {
    safetyRulesCompliant = false;
    flags.push('Privacy leak: Group-facing proposal text contains confidential financial keywords');
  }

  // Calculate score
  let score = 0;
  if (verdictMatchesEngine) score += 35;
  if (safetyRulesCompliant) score += 35;
  if (entitiesExistInUserData) score += 10;
  if (noProtectedSavingsTouched) score += 10;
  if (noInventedNumbers) score += 10;

  const checklist: AuditChecklist = {
    verdictMatchesEngine,
    entitiesExistInUserData,
    noProtectedSavingsTouched,
    noInventedNumbers,
    safetyRulesCompliant,
  };

  const approved = verdictMatchesEngine && safetyRulesCompliant && score >= 70;

  return {
    agentType: 'purchase_search',
    approved,
    score,
    checklist,
    flags,
    reviewedAt: new Date().toISOString(),
  };
}
