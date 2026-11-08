import type { ReviewResult } from './types';
import { getDb, mongoConfigured } from '../db/mongo';
import { DEMO_GROUND_TRUTH } from './ground-truth/demo-users';

export interface AuditLogDocument extends ReviewResult {
  memberId?: string;
  context?: string;
  createdAt: Date;
}

/**
 * Persists an audit result to MongoDB Atlas `agentAudits` collection if configured.
 * Does not block or fail if DB is offline.
 */
export async function logReviewAudit(result: ReviewResult, memberId?: string, context?: string): Promise<void> {
  if (!mongoConfigured()) return;
  try {
    const db = await getDb();
    await db.collection<AuditLogDocument>('agentAudits').insertOne({
      ...result,
      memberId,
      context,
      createdAt: new Date(),
    });
  } catch (err) {
    // Non-blocking telemetry
    console.warn('Failed to log review audit to MongoDB:', (err as Error).message);
  }
}

/**
 * Retrieves aggregate audit stats from MongoDB Atlas for display or judging demo.
 */
export async function getAuditStats(): Promise<{
  totalAudited: number;
  averageScore: number;
  approvedCount: number;
  recentFlags: string[];
}> {
  if (!mongoConfigured()) {
    return {
      totalAudited: 0,
      averageScore: 100,
      approvedCount: 0,
      recentFlags: [],
    };
  }

  try {
    const db = await getDb();
    const audits = await db.collection<AuditLogDocument>('agentAudits')
      .find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    if (!audits.length) {
      return { totalAudited: 0, averageScore: 100, approvedCount: 0, recentFlags: [] };
    }

    const total = audits.length;
    const approvedCount = audits.filter((a) => a.approved).length;
    const avgScore = Math.round(audits.reduce((acc, a) => acc + (a.score ?? 0), 0) / total);
    const recentFlags = audits.flatMap((a) => a.flags || []).slice(0, 5);

    return {
      totalAudited: total,
      averageScore: avgScore,
      approvedCount,
      recentFlags,
    };
  } catch {
    return { totalAudited: 0, averageScore: 100, approvedCount: 0, recentFlags: [] };
  }
}

/**
 * Run evaluation against demo users ground truth benchmark scenarios
 */
export function getDemoGroundTruthScenarios() {
  return Object.values(DEMO_GROUND_TRUTH).flatMap((u) => u.benchmarkScenarios);
}
