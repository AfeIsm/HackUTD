import { ObjectId } from 'mongodb';
import { getDb } from '../db/mongo';
import { connectionsFor } from './social';
import { buildPicture } from './picture';
import { scoreHealth } from '../engine/health';
import { DEMO_ASOF } from '../people';
import { ALL_SETTINGS, PRIVATE_SETTINGS, cleanSharing, projectHouseholdData,
  type SharingSettings, type SharingScope, type HouseholdPayload } from '../household-sharing';

interface SharingDoc { _id: string; settings: SharingSettings; updatedAt: Date }
const settingsKey = (userId: string, ownerId: string) => `${ownerId}:${userId}`;

async function settingsFor(userId: string, ownerId: string): Promise<SharingSettings> {
  const doc = await (await getDb()).collection<SharingDoc>('householdSharing').findOne({ _id: settingsKey(userId, ownerId) });
  return cleanSharing(doc?.settings);
}

export async function householdForViewer(userId: ObjectId): Promise<HouseholdPayload> {
  const { household } = await connectionsFor(userId);
  const ownerId = household?.owner.userId;
  if (!household || !ownerId) return { household: null, settings: { ...PRIVATE_SETTINGS }, members: [] };
  const viewerId = userId.toHexString();
  const settings = await settingsFor(viewerId, ownerId);
  const members = await Promise.all(household.members.map(async (member) => {
    const own = member.userId === viewerId;
    let sharing = own ? { ...ALL_SETTINGS } : await settingsFor(member.userId!, ownerId);
    const visible = Object.values(sharing).some(Boolean);
    let picture = null;
    if (visible && member.memberId) {
      try { picture = (await buildPicture(member.memberId)).picture; } catch { /* Return no stale private data on failure. */ }
    }
    // Check again after provider calls: a revocation may have happened while loading.
    if (!own) sharing = await settingsFor(member.userId!, ownerId);
    const health = picture && sharing.health ? scoreHealth(picture, { asOf: DEMO_ASOF }) : null;
    return { ...member, sharing, data: picture ? projectHouseholdData(picture, health, sharing) : {},
      unavailable: Object.values(sharing).some(Boolean) && !picture };
  }));
  // A viewer or another member may leave while a provider request is still in flight.
  const latest = (await connectionsFor(userId)).household;
  if (!latest || latest.owner.userId !== ownerId) return { household: null, settings: { ...PRIVATE_SETTINGS }, members: [] };
  return { household: latest, settings, members: members.filter((m) => latest.members.some((p) => p.userId === m.userId)) };
}

/** Server identity is the grantor; a browser cannot edit anyone else's settings. */
export async function updateHouseholdSharing(userId: ObjectId, scope: SharingScope, enabled: boolean): Promise<SharingSettings | null> {
  const { household } = await connectionsFor(userId);
  const ownerId = household?.owner.userId;
  if (!household || !ownerId) return null;
  await (await getDb()).collection<SharingDoc>('householdSharing').updateOne(
    { _id: settingsKey(userId.toHexString(), ownerId) },
    { $set: { [`settings.${scope}`]: enabled, updatedAt: new Date() } }, { upsert: true },
  );
  return settingsFor(userId.toHexString(), ownerId);
}
