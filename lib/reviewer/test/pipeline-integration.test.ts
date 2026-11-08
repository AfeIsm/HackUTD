import { describe, it, expect, vi } from 'vitest';
import type { AgentStep, FinancialPicture } from '../../types';
import { runAgent } from '../../agent/loop';

// Mock nemotron client so we can test what runAgent outputs with and without reviewer guardrails
vi.mock('../../agent/client', () => ({
  NEMOTRON_MODEL: 'nvidia/nemotron-mini',
  nemotron: () => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                role: 'assistant',
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'propose_plan',
                      arguments: JSON.stringify({
                        summary: 'You can easily afford this small coffee.',
                        explanation: 'Your checking balance stays well above buffer.',
                        actions: [],
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      },
    },
  }),
  agentConfigured: () => true,
}));

describe('Agent Pipeline Edge Cases (Integration)', () => {
  const mockPicture: FinancialPicture = {
    memberId: 'alex',
    accounts: [
      { id: 'chk-1', ownerMemberId: 'alex', type: 'Checking', nickname: 'Everyday Checking', balance: 50000 },
      { id: 'sav-1', ownerMemberId: 'alex', type: 'Savings', nickname: 'Emergency Savings', balance: 300000 },
    ],
    txns: [],
    obligations: [
      { accountId: 'chk-1', key: 'rent', name: 'Apartment Rent', amount: 120000, nextDate: '2026-11-15', cadence: 'monthly', essential: true, origin: 'bill' },
    ],
    paycheck: null,
    goals: [
      { id: 'orlando', name: 'Orlando fund', amount: 30000, accountId: 'sav-1' },
    ],
    reservations: [],
    missingInputs: [],
  };

  it('Edge Case: Verifies that runAgent plan outputs a reviewer audit stamp and safety approval', async () => {
    // When called, runAgent produces an AgentAnswer.
    // If reviewer is active, answer.plan.review MUST exist and be approved.
    const steps: AgentStep[] = [];
    const answer = await runAgent(
      mockPicture,
      'Can I buy a $5 coffee?',
      '2026-11-07',
      (s) => steps.push(s),
      { amount: 5, accountId: 'chk-1', label: 'Coffee' }
    );

    // This expectation tests whether the reviewer agent is actively attached to runAgent
    expect(answer.plan).toBeDefined();
    expect(answer.plan?.review).toBeDefined();
    expect(answer.plan?.review?.approved).toBe(true);
    expect(steps.some((s) => s.tool === 'reviewer_agent')).toBe(true);
  });
});
