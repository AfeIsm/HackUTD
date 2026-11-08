import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ObjectId } from 'mongodb';
import { removeFriend, pairKey } from '../services/social';

const mock = vi.hoisted(() => ({ getDb: vi.fn(), deleteMany: vi.fn() }));
vi.mock('../db/mongo', () => ({ getDb: mock.getDb }));

describe('removing a friend', () => {
  const a = new ObjectId();
  const b = new ObjectId();
  beforeEach(() => {
    vi.clearAllMocks();
    mock.getDb.mockResolvedValue({ collection: () => ({ deleteMany: mock.deleteMany }) });
    mock.deleteMany.mockResolvedValue({ deletedCount: 1 });
  });
  it('lets either person remove only their pair of friend records', async () => {
    expect(await removeFriend(a, b.toHexString())).toEqual({ ok: true });
    const first = mock.deleteMany.mock.calls[0][0];
    expect(first).toEqual({ kind: 'friend', pairKey: pairKey(a, b), $or: [{ fromUserId: a }, { toUserId: a }] });
    expect(await removeFriend(b, a.toHexString())).toEqual({ ok: true });
    expect(mock.deleteMany.mock.calls[1][0].pairKey).toBe(first.pairKey);
    // No status filter: stale pending requests cannot restore the removed friend.
    expect(first).not.toHaveProperty('status');
  });
  it('does not allow removing oneself or an invalid ID', async () => {
    expect(await removeFriend(a, 'invalid')).toMatchObject({ ok: false, status: 400 });
    expect(await removeFriend(a, a.toHexString())).toMatchObject({ ok: false, status: 400 });
    expect(mock.deleteMany).not.toHaveBeenCalled();
  });
  it('reports when no matching friendship was removed', async () => {
    mock.deleteMany.mockResolvedValue({ deletedCount: 0 });
    expect(await removeFriend(a, b.toHexString())).toMatchObject({ ok: false, status: 404 });
  });
});
