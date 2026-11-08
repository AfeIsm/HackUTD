import type { GroundTruthScenario } from '../types';

export interface DemoUserGroundTruth {
  memberId: string;
  name: string;
  validSubscriptions: string[];       // Subscriptions known to exist in Nessie seed data
  protectedGoals: string[];           // Goals that must never be redirected/spent
  expectedHealthStatus: 'green' | 'yellow' | 'red';
  benchmarkScenarios: GroundTruthScenario[];
}

export const DEMO_GROUND_TRUTH: Record<string, DemoUserGroundTruth> = {
  alex: {
    memberId: 'alex',
    name: 'Alex',
    validSubscriptions: ['Hulu', 'Spotify', 'Electric Utility', 'Car Insurance', 'Rent'],
    protectedGoals: ['Orlando fund', 'orlando'],
    expectedHealthStatus: 'yellow',
    benchmarkScenarios: [
      {
        id: 'alex_expensive_purchase',
        memberId: 'alex',
        question: 'Can I buy an $800 drone today?',
        expectedVerdict: 'notYet',
        knownEntities: ['Hulu', 'Spotify', 'Checking'],
        protectedFunds: ['Orlando fund', 'orlando'],
        description: 'Large purchase with low buffer: must not be approved without green path or waiting.',
      },
      {
        id: 'alex_touch_goal_protection',
        memberId: 'alex',
        question: 'Can I take money out of my Orlando fund to buy concert tickets?',
        expectedVerdict: 'notYet',
        knownEntities: ['Orlando fund'],
        protectedFunds: ['Orlando fund', 'orlando'],
        description: 'Must protect the designated Orlando savings goal.',
      },
    ],
  },
  jordan: {
    memberId: 'jordan',
    name: 'Jordan',
    validSubscriptions: ["Gold's Gym", 'Rent', 'Internet', 'Water Utility'],
    protectedGoals: [],
    expectedHealthStatus: 'green',
    benchmarkScenarios: [
      {
        id: 'jordan_small_purchase',
        memberId: 'jordan',
        question: 'Can I buy $40 running shoes?',
        expectedVerdict: 'yes',
        knownEntities: ["Gold's Gym", 'Checking'],
        description: 'Jordan is in good health with ample cash flow; purchase is easily affordable.',
      },
      {
        id: 'jordan_cut_gym',
        memberId: 'jordan',
        question: 'How can I save an extra $40 a month?',
        expectedVerdict: 'yes',
        knownEntities: ["Gold's Gym"],
        description: "Jordan's main non-essential subscription is Gold's Gym.",
      },
    ],
  },
  sam: {
    memberId: 'sam',
    name: 'Sam',
    validSubscriptions: ['Rent', 'Streaming Service'],
    protectedGoals: [],
    expectedHealthStatus: 'green',
    benchmarkScenarios: [
      {
        id: 'sam_huddle_pledge',
        memberId: 'sam',
        question: 'Can I pledge $150 to the Orlando trip?',
        expectedVerdict: 'yes',
        knownEntities: ['Checking'],
        description: 'Sam has enough buffer to commit moderately.',
      },
    ],
  },
};
