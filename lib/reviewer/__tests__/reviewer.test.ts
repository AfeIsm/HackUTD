import { describe, it, expect } from 'vitest';
import type { FinancialPicture } from '../../types';
import { reviewCoachPlan } from '../checkers/coach-reviewer';
import { reviewPurchaseProposals } from '../checkers/purchase-reviewer';
import { DEMO_GROUND_TRUTH } from '../ground-truth/demo-users';

describe('Reviewer Agent - Coach Plan Checker', () => {
  const mockPicture: FinancialPicture = {
    memberId: 'alex',
    accounts: [],
    txns: [],
    obligations: [
      { accountId: 'acc-1', key: 'sub-1', name: 'Hulu', amount: 1500, nextDate: '2026-11-20', cadence: 'monthly', essential: false, origin: 'detected' },
      { accountId: 'acc-1', key: 'sub-2', name: 'Spotify', amount: 1000, nextDate: '2026-11-22', cadence: 'monthly', essential: false, origin: 'detected' },
    ],
    paycheck: null,
    goals: [
      { id: 'orlando', name: 'Orlando fund', amount: 30000, accountId: 'acc-2' },
    ],
    reservations: [],
    missingInputs: [],
  };

  it('approves a well-grounded plan that matches the engine', () => {
    const result = reviewCoachPlan({
      memberId: 'alex',
      picture: mockPicture,
      engineVerdict: 'yes',
      proposedVerdict: 'yes',
      summary: 'You can comfortably afford this without putting bills at risk.',
      explanation: 'Your checking buffer remains healthy through your next payday.',
      recommendedActions: ['Continue current savings rate'],
    });

    expect(result.approved).toBe(true);
    expect(result.score).toBe(100);
    expect(result.flags.length).toBe(0);
  });

  it('catches and flags hallucinated subscriptions not belonging to the user', () => {
    const result = reviewCoachPlan({
      memberId: 'alex',
      picture: mockPicture,
      engineVerdict: 'yes',
      proposedVerdict: 'yes',
      summary: 'To save extra, consider cancelling your Netflix subscription.',
      explanation: 'Dropping Netflix will free up funds.',
      recommendedActions: ['Cancel Netflix'],
    });

    expect(result.checklist.entitiesExistInUserData).toBe(false);
    expect(result.flags.some((f) => f.includes('Netflix') || f.includes('netflix'))).toBe(true);
    expect(result.score).toBeLessThan(100);
  });

  it('rejects a plan if the engine says notYet but proposed is yes', () => {
    const result = reviewCoachPlan({
      memberId: 'alex',
      picture: mockPicture,
      engineVerdict: 'notYet',
      proposedVerdict: 'yes',
      summary: 'Go ahead and purchase it today!',
      explanation: 'You will be fine.',
      recommendedActions: [],
    });

    expect(result.approved).toBe(false);
    expect(result.checklist.verdictMatchesEngine).toBe(false);
    expect(result.flags.some((f) => f.includes('Verdict contradiction'))).toBe(true);
  });

  it('rejects a plan that suggests touching a protected savings goal', () => {
    const result = reviewCoachPlan({
      memberId: 'alex',
      picture: mockPicture,
      engineVerdict: 'yes',
      proposedVerdict: 'yes',
      summary: 'You can pull from your Orlando fund to buy this today.',
      explanation: 'Using the Orlando fund provides immediate cash.',
      recommendedActions: ['Spend Orlando fund'],
    });

    expect(result.approved).toBe(false);
    expect(result.checklist.noProtectedSavingsTouched).toBe(false);
    expect(result.flags.some((f) => f.includes('Orlando fund'))).toBe(true);
  });

  it('flags raw invented digits in the model prose', () => {
    const result = reviewCoachPlan({
      memberId: 'alex',
      picture: mockPicture,
      engineVerdict: 'yes',
      proposedVerdict: 'yes',
      summary: 'You have 500 dollars left in your checking account.',
      explanation: 'Saving 25 dollars a week will help.',
      recommendedActions: [],
    });

    expect(result.checklist.noInventedNumbers).toBe(false);
    expect(result.flags.some((f) => f.includes('Invented numbers'))).toBe(true);
  });
});

describe('Reviewer Agent - Purchase Proposals Checker', () => {
  it('flags proposals that exceed the group safe limit', () => {
    const result = reviewPurchaseProposals({
      proposals: [
        { title: 'Luxury Villa', total: 500000, why: 'Fits everyone' },
      ],
      groupSafeLimit: 300000,
    });

    expect(result.approved).toBe(false);
    expect(result.checklist.verdictMatchesEngine).toBe(false);
    expect(result.flags.some((f) => f.includes('exceeding group safe limit'))).toBe(true);
  });

  it('flags proposals that leak private financial words into group-facing why', () => {
    const result = reviewPurchaseProposals({
      proposals: [
        { title: 'Standard Cabin', total: 200000, why: 'Picked because Jordan is broke and has low balance' },
      ],
      groupSafeLimit: 300000,
    });

    expect(result.approved).toBe(false);
    expect(result.checklist.safetyRulesCompliant).toBe(false);
    expect(result.flags.some((f) => f.includes('Privacy leak'))).toBe(true);
  });
});

describe('Demo Users Ground Truth Definitions', () => {
  it('has verified ground truth data for demo users', () => {
    expect(DEMO_GROUND_TRUTH.alex).toBeDefined();
    expect(DEMO_GROUND_TRUTH.alex.validSubscriptions).toContain('Hulu');
    expect(DEMO_GROUND_TRUTH.alex.protectedGoals).toContain('Orlando fund');

    expect(DEMO_GROUND_TRUTH.jordan).toBeDefined();
    expect(DEMO_GROUND_TRUTH.jordan.validSubscriptions).toContain("Gold's Gym");

    expect(DEMO_GROUND_TRUTH.sam).toBeDefined();
  });
});
