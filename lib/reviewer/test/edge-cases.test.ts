import { describe, it, expect } from 'vitest';
import type { FinancialPicture } from '../../types';
import { reviewCoachPlan } from '../checkers/coach-reviewer';
import { reviewPurchaseProposals } from '../checkers/purchase-reviewer';

describe('Reviewer Agent Edge Cases', () => {
  const basePicture: FinancialPicture = {
    memberId: 'alex',
    accounts: [
      { id: 'chk-1', ownerMemberId: 'alex', type: 'Checking', nickname: 'Everyday Checking', balance: 50000 },
      { id: 'sav-1', ownerMemberId: 'alex', type: 'Savings', nickname: 'Emergency Savings', balance: 300000 },
    ],
    txns: [],
    obligations: [
      { accountId: 'chk-1', key: 'rent', name: 'Apartment Rent', amount: 120000, nextDate: '2026-11-15', cadence: 'monthly', essential: true, origin: 'bill' },
      { accountId: 'chk-1', key: 'spotify', name: 'Spotify Premium', amount: 1199, nextDate: '2026-11-20', cadence: 'monthly', essential: false, origin: 'detected' },
    ],
    paycheck: null,
    goals: [
      { id: 'orlando', name: 'Orlando fund', amount: 30000, accountId: 'sav-1' },
    ],
    reservations: [],
    missingInputs: [],
  };

  // Edge Case 1: Subtly disguised attempt to raid protected savings goal
  it('Edge Case 1: Rejects subtle or phrased attempts to reallocate protected savings goals', () => {
    const res = reviewCoachPlan({
      memberId: 'alex',
      picture: basePicture,
      engineVerdict: 'yes',
      proposedVerdict: 'yes',
      summary: 'You can afford this if you reallocate your Orlando fund toward the purchase.',
      explanation: 'Your other accounts remain untouched.',
      recommendedActions: ['Reallocate Orlando fund'],
    });

    expect(res.approved).toBe(false);
    expect(res.checklist.noProtectedSavingsTouched).toBe(false);
    expect(res.flags.some((f) => f.includes('Orlando fund'))).toBe(true);
  });

  // Edge Case 2: Hallucinating popular non-existent recurring subscriptions
  it('Edge Case 2: Flags common hallucinated subscriptions when user does not have them', () => {
    const res = reviewCoachPlan({
      memberId: 'alex',
      picture: basePicture,
      engineVerdict: 'yes',
      proposedVerdict: 'yes',
      summary: 'To create more room in your budget, cancel your Netflix and Disney+ plans.',
      explanation: 'Streaming subscriptions add up quickly.',
      recommendedActions: ['Cancel Netflix'],
    });

    expect(res.approved).toBe(false);
    expect(res.checklist.entitiesExistInUserData).toBe(false);
    expect(res.flags.some((f) => f.includes('netflix') || f.includes('Netflix'))).toBe(true);
  });

  // Edge Case 3: Optimistic LLM claiming affordability when engine flagged notYet
  it('Edge Case 3: Rejects optimistic LLM overrides contradicting engine notYet verdict', () => {
    const res = reviewCoachPlan({
      memberId: 'alex',
      picture: basePicture,
      engineVerdict: 'notYet',
      proposedVerdict: 'yes',
      summary: 'Go ahead and make the purchase today, you have plenty of cash.',
      explanation: 'No immediate bills will bounce.',
      recommendedActions: [],
    });

    expect(res.approved).toBe(false);
    expect(res.checklist.verdictMatchesEngine).toBe(false);
    expect(res.flags.some((f) => f.includes('Verdict contradiction'))).toBe(true);
  });

  // Edge Case 4: Group proposal budget leak & private financial disclosure
  it('Edge Case 4: Rejects group purchase proposals that leak private financial status to friends', () => {
    const res = reviewPurchaseProposals({
      proposals: [
        { title: 'Orlando Villa', total: 45000, why: 'Selected because Alex is broke and has low checking balance' },
      ],
      groupSafeLimit: 50000,
    });

    expect(res.approved).toBe(false);
    expect(res.checklist.safetyRulesCompliant).toBe(false);
    expect(res.flags.some((f) => f.includes('Privacy leak'))).toBe(true);
  });
});
