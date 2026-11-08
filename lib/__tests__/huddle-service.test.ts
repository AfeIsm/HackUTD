import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ObjectId } from 'mongodb';
import { actOnHuddle } from '../services/huddle';
import { newParticipant, type Huddle } from '../huddles';
import type { Viewer } from '../auth/viewer';

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock('../db/mongo', () => ({ getDb: mocks.getDb }));
vi.mock('../services/picture', () => ({ buildPicture: vi.fn() }));
vi.mock('../services/social', () => ({ connectionsFor: vi.fn() }));

describe('persisted Huddle leaving and deletion', () => {
  let doc: (Omit<Huddle, 'id'> & { _id: string; version: number }) | null;
  const viewer = (id: string): Viewer => ({ memberId: id, user: { id: new ObjectId().toHexString(), memberId: id, name: id, username: id, email: `${id}@example.com` } });
  beforeEach(() => {
    doc = { _id: 'h1', version: 1, name: 'Trip', totalCost: 10000, targetDate: '2026-12-01', createdBy: 'alex',
      phase: 'pledging', round: 1, message: null, lastDecline: null, fairSplit: null,
      participants: ['alex', 'sam', 'jordan'].map((id) => newParticipant(id, id, id)),
    };
    mocks.getDb.mockResolvedValue({ collection: () => ({
      findOne: async (filter: Record<string, unknown>) => doc?.participants.some((p) => p.memberId === filter['participants.memberId']) ? structuredClone(doc) : null,
      deleteOne: vi.fn(async (filter: { version: number }) => {
        if (!doc || doc.version !== filter.version) return { deletedCount: 0 };
        doc = null;
        return { deletedCount: 1 };
      }),
      updateOne: async (filter: { version: number }, update: { $set: object }) => {
        if (!doc || doc.version !== filter.version) return { matchedCount: 0 };
        Object.assign(doc, update.$set);
        return { matchedCount: 1 };
      },
    }) });
  });

  it('allows only the owner to delete the group for everyone', async () => {
    expect(await actOnHuddle(viewer('sam'), 'h1', { action: 'delete' })).toMatchObject({ ok: false, status: 403 });
    expect(doc).not.toBeNull();
    expect(await actOnHuddle(viewer('alex'), 'h1', { action: 'delete' })).toEqual({ ok: true });
    expect(doc).toBeNull();
  });
  it('rejects users outside the group', async () => {
    expect(await actOnHuddle(viewer('outsider'), 'h1', { action: 'leave' })).toMatchObject({ ok: false, status: 404 });
    expect(await actOnHuddle(viewer('outsider'), 'h1', { action: 'delete' })).toMatchObject({ ok: false, status: 404 });
  });
  it('persists leaving, then automatically deletes when only one member remains', async () => {
    expect(await actOnHuddle(viewer('sam'), 'h1', { action: 'leave' })).toEqual({ ok: true });
    expect(doc?.participants.map((p) => p.memberId)).toEqual(['alex', 'jordan']);
    expect(await actOnHuddle(viewer('jordan'), 'h1', { action: 'leave' })).toEqual({ ok: true });
    expect(doc).toBeNull();
  });
  it('deletes when the last invite is declined', async () => {
    doc!.participants = [newParticipant('alex', 'u1', 'Alex'), newParticipant('sam', 'u2', 'Sam', { joined: false })];
    expect(await actOnHuddle(viewer('sam'), 'h1', { action: 'answerInvite', accept: false })).toEqual({ ok: true });
    expect(doc).toBeNull();
  });
  it('rechecks a concurrent change instead of deleting the newer document', async () => {
    const col = (await mocks.getDb()).collection();
    col.deleteOne.mockImplementationOnce(async () => { doc!.version++; return { deletedCount: 0 }; });
    mocks.getDb.mockResolvedValue({ collection: () => col });
    expect(await actOnHuddle(viewer('alex'), 'h1', { action: 'delete' })).toEqual({ ok: true });
    expect(col.deleteOne).toHaveBeenCalledTimes(2);
    expect(doc).toBeNull();
  });
});
