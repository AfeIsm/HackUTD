import { NextResponse } from 'next/server';
import { getAuditStats, getDemoGroundTruthScenarios } from '@/lib/reviewer/evaluator';
import { DEMO_GROUND_TRUTH } from '@/lib/reviewer/ground-truth/demo-users';

export async function GET() {
  const stats = await getAuditStats();
  const scenarios = getDemoGroundTruthScenarios();

  return NextResponse.json({
    status: 'ok',
    system: 'Wallet Whisperer Reviewer & Benchmark Suite',
    groundTruthUsers: Object.keys(DEMO_GROUND_TRUTH),
    totalBenchmarkScenarios: scenarios.length,
    scenarios,
    runtimeAudits: stats,
  });
}
