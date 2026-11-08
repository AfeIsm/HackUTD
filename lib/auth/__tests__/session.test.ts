import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ObjectId } from 'mongodb';
import { startSession, endSession, refreshBrowserSessionCookie } from '../session';

const mock = vi.hoisted(() => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn(), insertOne: vi.fn(), deleteOne: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ set: mock.set, get: mock.get, delete: mock.delete }) }));
vi.mock('../../db/mongo', () => ({ getDb: async () => ({ collection: () => ({ insertOne: mock.insertOne, deleteOne: mock.deleteOne }) }) }));
vi.mock('../users', () => ({ findUserById: vi.fn(), toPublicUser: vi.fn() }));

describe('browser session cookies', () => {
  beforeEach(() => vi.clearAllMocks());
  it('sets a session-only cookie while retaining server expiry and a hashed token', async () => {
    await startSession(new ObjectId());
    const [name, token, settings] = mock.set.mock.calls[0];
    expect(name).toBe('ww_session');
    expect(settings).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    expect(settings).not.toHaveProperty('expires');
    expect(settings).not.toHaveProperty('maxAge');
    expect(mock.insertOne.mock.calls[0][0].tokenHash).not.toBe(token);
    expect(mock.insertOne.mock.calls[0][0].expiresAt).toBeInstanceOf(Date);
  });
  it('explicit logout removes the server session and the browser cookie', async () => {
    mock.get.mockReturnValue({ value: 'test-token' });
    await endSession();
    expect(mock.deleteOne).toHaveBeenCalledOnce();
    expect(mock.delete).toHaveBeenCalledWith('ww_session');
  });
  it('converts an existing login to a browser-session cookie without changing its token', async () => {
    mock.get.mockReturnValue({ value: 'existing-token' });
    await refreshBrowserSessionCookie();
    expect(mock.set.mock.calls[0].slice(0, 2)).toEqual(['ww_session', 'existing-token']);
    expect(mock.set.mock.calls[0][2]).not.toHaveProperty('expires');
    expect(mock.set.mock.calls[0][2]).not.toHaveProperty('maxAge');
  });
});
