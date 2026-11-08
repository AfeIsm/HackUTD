// runHealthCheck: score a member's current money and save the result (PLAN.md §6).
// Every check is saved as a snapshot (score history). Re-running on unchanged data gives the
// same score and the same dataHash, which is how a saved fix plan gets reused instead of regenerated.

import type { FinancialPicture, HealthResult, Indicator, Status } from '../types';
import { getDb, mongoConfigured } from '../db/mongo';
import { scoreHealth } from '../engine/health';
import { DEMO_ASOF } from '../people';
import { buildPicture } from './picture';

export interface SnapshotDoc {
  memberId: string;
  dataHash: string;
  score: number | null; // null = needs input (incomplete data)
  overall: Status;
  indicators: Indicator[];
  flags: string[];
  trigger: string;
  createdAt: Date;
}

export interface HealthPayload {
  result: HealthResult | null;
  picture: FinancialPicture | null;
  source: string;
  saved: boolean; // snapshot written to MongoDB
  unchanged: boolean; // same dataHash as the previous snapshot
  history: { score: number | null; overall: Status; trigger: string; createdAt: string }[];
}

export async function runHealthCheck(memberId: string, trigger: string): Promise<HealthPayload> {
  const loaded = await buildPicture(memberId);
  if (!loaded.picture) return { result: null, picture: null, source: loaded.source, saved: false, unchanged: false, history: [] };

  const now = new Date();
  const result = scoreHealth(loaded.picture, { asOf: DEMO_ASOF, trigger, checkedAt: now.toISOString() });
  if (!mongoConfigured() || !loaded.saved) {
    return { result, picture: loaded.picture, source: loaded.source, saved: false, unchanged: false, history: [] };
  }

  try {
    const snapshots = (await getDb()).collection<SnapshotDoc>('healthSnapshots');
    const previous = await snapshots.findOne({ memberId }, { sort: { createdAt: -1 } });
    await snapshots.insertOne({
      memberId, dataHash: result.dataHash, score: result.score, overall: result.overall,
      indicators: result.indicators, flags: result.flags, trigger, createdAt: now,
    });
    const history = await snapshots.find({ memberId }, { sort: { createdAt: -1 }, limit: 8 }).toArray();
    return {
      result, picture: loaded.picture, source: loaded.source, saved: true,
      unchanged: previous?.dataHash === result.dataHash,
      history: history.map((h) => ({ score: h.score, overall: h.overall, trigger: h.trigger, createdAt: h.createdAt.toISOString() })),
    };
  } catch (err) {
    console.warn(`Could not save health snapshot for ${memberId}:`, (err as Error).message);
    return { result, picture: loaded.picture, source: loaded.source, saved: false, unchanged: false, history: [] };
  }
}

/** Latest saved result. Runs a first check if this member has never been checked. */
export async function latestHealth(memberId: string): Promise<HealthPayload> {
  if (mongoConfigured()) {
    try {
      const snapshots = (await getDb()).collection<SnapshotDoc>('healthSnapshots');
      const last = await snapshots.findOne({ memberId }, { sort: { createdAt: -1 } });
      if (last) {
        // Rebuild the full result from current data; show the saved trigger + time.
        const loaded = await buildPicture(memberId);
        if (loaded.picture) {
          const result = scoreHealth(loaded.picture, { asOf: DEMO_ASOF, trigger: last.trigger, checkedAt: last.createdAt.toISOString() });
          if (result.dataHash === last.dataHash) {
            const history = await snapshots.find({ memberId }, { sort: { createdAt: -1 }, limit: 8 }).toArray();
            return {
              result, picture: loaded.picture, source: loaded.source, saved: true, unchanged: true,
              history: history.map((h) => ({ score: h.score, overall: h.overall, trigger: h.trigger, createdAt: h.createdAt.toISOString() })),
            };
          }
          return runHealthCheck(memberId, 'new bank data synced'); // data changed since last check
        }
      }
    } catch (err) {
      console.warn(`Could not read health snapshots for ${memberId}:`, (err as Error).message);
    }
  }
  return runHealthCheck(memberId, 'first sync');
}
