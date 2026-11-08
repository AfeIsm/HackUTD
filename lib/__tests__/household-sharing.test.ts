import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ObjectId } from 'mongodb';
import { ALL_SETTINGS, PRIVATE_SETTINGS, cleanSharing, projectHouseholdData, SHARING_OPTIONS } from '../household-sharing';
import { alex, ASOF } from '../engine/__tests__/fixtures';
import { scoreHealth } from '../engine/health';
import { householdForViewer, updateHouseholdSharing } from '../services/household';

const mock = vi.hoisted(() => ({ getDb: vi.fn(), connectionsFor: vi.fn(), buildPicture: vi.fn(), findOne: vi.fn(), updateOne: vi.fn() }));
vi.mock('../db/mongo', () => ({ getDb: mock.getDb }));
vi.mock('../services/social', () => ({ connectionsFor: mock.connectionsFor }));
vi.mock('../services/picture', () => ({ buildPicture: mock.buildPicture }));

describe('household data projections', () => {
  const health = scoreHealth(alex, { asOf: ASOF });
  it('returns no financial fields by default', () => {
    expect(projectHouseholdData(alex, health, PRIVATE_SETTINGS)).toEqual({});
    expect(cleanSharing({ balances: 'true', health: 1, income: true, unknown: true })).toEqual({ ...PRIVATE_SETTINGS, income: true });
  });
  for (const { key } of SHARING_OPTIONS) {
    it(`exposes only the selected ${key} category`, () => {
      const data = projectHouseholdData(alex, health, { ...PRIVATE_SETTINGS, [key]: true });
      expect(Object.keys(data)).toEqual([key]);
      expect(JSON.stringify(data)).not.toContain('sourceAccountId');
      expect(JSON.stringify(data)).not.toContain('dataHash');
      expect(JSON.stringify(data)).not.toContain('accountId');
      expect(JSON.stringify(data)).not.toContain('ownerMemberId');
    });
  }
  it('health sharing does not reveal financial indicators, flags or forecasts', () => {
    expect(projectHouseholdData(alex, health, { ...PRIVATE_SETTINGS, health: true })).toEqual({ health: { score: health.score, overall: health.overall } });
  });
  it('limits transaction sharing and keeps the source picture intact', () => {
    const picture = { ...alex, txns: Array.from({ length: 30 }, (_, i) => ({ id: `private-${i}`, accountId: 'private-account', amount: 100, date: '2026-11-01', kind: 'purchase' as const, description: `item-${i}` })) };
    expect(projectHouseholdData(picture, health, ALL_SETTINGS).transactions).toHaveLength(20);
    expect(picture.txns).toHaveLength(30);
  });
});

describe('household sharing access and revocation', () => {
  const viewerId = new ObjectId();
  const otherId = new ObjectId();
  const viewer = { userId: viewerId.toHexString(), memberId: 'viewer', username: 'viewer', name: 'Viewer', role: 'owner' };
  const other = { userId: otherId.toHexString(), memberId: 'other', username: 'other', name: 'Other', role: 'spouse' };
  beforeEach(() => {
    vi.clearAllMocks();
    mock.connectionsFor.mockResolvedValue({ household: { owner: viewer, members: [viewer, other], iAmOwner: true } });
    mock.getDb.mockResolvedValue({ collection: () => ({ findOne: mock.findOne, updateOne: mock.updateOne }) });
    mock.findOne.mockResolvedValue(null);
    mock.buildPicture.mockResolvedValue({ picture: alex });
  });
  it('does not fetch another member finances without a grant, even for the owner', async () => {
    const response = await householdForViewer(viewerId);
    expect(response.members[1].data).toEqual({});
    expect(mock.buildPicture.mock.calls.map(([id]) => id)).toEqual(['viewer']);
    expect(response.settings).toEqual(PRIVATE_SETTINGS);
    expect(response.members[0].data).toHaveProperty('balances');
  });
  it('uses the latest grant after financial data loads and respects revocation', async () => {
    let reads = 0;
    mock.findOne.mockImplementation(async ({ _id }: { _id: string }) => {
      if (_id.endsWith(otherId.toHexString())) return { settings: ++reads === 1 ? ALL_SETTINGS : PRIVATE_SETTINGS };
      return null;
    });
    const response = await householdForViewer(viewerId);
    expect(mock.buildPicture).toHaveBeenCalledWith('other');
    expect(response.members[1].data).toEqual({});
  });
  it('returns no members or data for a pending invitation or a non-member', async () => {
    mock.connectionsFor.mockResolvedValue({ household: null });
    expect(await householdForViewer(viewerId)).toEqual({ household: null, settings: PRIVATE_SETTINGS, members: [] });
    expect(await updateHouseholdSharing(viewerId, 'balances', true)).toBeNull();
    expect(mock.buildPicture).not.toHaveBeenCalled();
    expect(mock.updateOne).not.toHaveBeenCalled();
  });
  it('updates only the viewer setting with a household-scoped key', async () => {
    await updateHouseholdSharing(viewerId, 'income', true);
    expect(mock.updateOne).toHaveBeenCalledWith(
      { _id: `${viewerId.toHexString()}:${viewerId.toHexString()}` },
      { $set: { 'settings.income': true, updatedAt: expect.any(Date) } }, { upsert: true },
    );
  });
  it('discards data if the viewer leaves while the financial request is loading', async () => {
    mock.connectionsFor.mockResolvedValueOnce({ household: { owner: viewer, members: [viewer, other], iAmOwner: true } })
      .mockResolvedValueOnce({ household: null });
    expect(await householdForViewer(viewerId)).toEqual({ household: null, settings: PRIVATE_SETTINGS, members: [] });
  });
});
