import { describe, expect, it } from 'vitest';
import { type Huddle, newParticipant, viewFor } from '../../huddles';
import { groupSafe, soloSafe } from '../../agent/purchase';
import { briefFromGuess, cleanGuess } from '../../agent/plan';
import { evaluateOffer, parseDelivery } from '../evaluate';
import { demoOffers } from '../fixtures';
import { acceptProposal, maybeAutoSearch, rejectProposal, startReview, startSearch } from '../review';
import { normalizeRentals, normalizeShopping, productParams, rentalParams, safeQuery } from '../serpapi';

describe('soloSafe', () => {
  it('keeps model numbers and verified prices', () => {
    expect(soloSafe('The WH-1000XM5 is well under the $450 budget.', [45000])).toBe('The WH-1000XM5 is well under the $450 budget.');
  });
  it('drops a sentence with a figure nobody verified', () => {
    expect(soloSafe('Great pick. It saves you $90 a year.', [45000])).toBe('Great pick.');
    expect(soloSafe('Lasts 30 days on a charge.', [45000])).toBe('');
  });
});
import { judgeBudget, priceRange } from '../viability';
import type { Offer, Proposal, PurchaseBrief } from '../types';

const ASOF = '2026-11-07';
const BUDGET = 50000;
const product = (over: Partial<PurchaseBrief> = {}): PurchaseBrief => ({
  category: 'product', description: 'Headphones', url: null, mode: 'flexible', quantity: 1, exactModel: null, condition: 'new', deliverBy: null,
  location: null, checkIn: null, checkOut: null, guests: null, bedrooms: null, amenities: [],
  flexibility: { alternativeBrands: false, refurbished: false, differentDates: false, nearbyLocations: false }, ...over,
});
const rental = (over: Partial<PurchaseBrief> = {}) => product({ category: 'rental', location: 'Galveston', checkIn: '2026-12-10', checkOut: '2026-12-12', guests: 4, bedrooms: 2, ...over });
const offer = (over: Partial<Offer> = {}): Offer => ({ key: 'k', kind: 'product', title: 'Sony WH-1000XM5', seller: 'Shop', link: null, retrievedAt: 'now', demo: false, unitPrice: 30000, deliveryText: 'Free delivery', ...over });
const judge = (b: PurchaseBrief, o: Offer, rejectedKeys = new Set<string>()) => evaluateOffer(b, o, { budget: BUDGET, asOf: ASOF, rejectedKeys });
const reasonOf = (r: ReturnType<typeof judge>) => (r.ok ? 'ok' : r.reason);

describe('reading delivery text', () => {
  it('reads free and paid shipping, and leaves the rest unknown', () => {
    expect(parseDelivery('Free delivery', ASOF).shipping).toBe(0);
    expect(parseDelivery('$6.99 delivery by Nov 12', ASOF)).toEqual({ shipping: 699, date: '2026-11-12' });
    expect(parseDelivery('In stock', ASOF)).toEqual({ shipping: null, date: null });
    expect(parseDelivery(null, ASOF)).toEqual({ shipping: null, date: null });
  });
  it('uses the later end of a range and rolls past year end', () => {
    expect(parseDelivery('Delivery Nov 12 - 15', ASOF).date).toBe('2026-11-15');
    expect(parseDelivery('Get it by Jan 3', ASOF).date).toBe('2027-01-03');
    expect(parseDelivery('Free next-day delivery', ASOF).date).toBe('2026-11-08');
  });
});

describe('offers are checked by code, not the AI', () => {
  it('exact choice refuses a different model', () => {
    const b = product({ mode: 'exact', exactModel: 'Sony WH-1000XM5' });
    expect(reasonOf(judge(b, offer()))).toBe('ok');
    expect(reasonOf(judge(b, offer({ title: 'Sony WH-1000XM4' })))).toBe('wrongItem');
  });
  it('flexible choice keeps the brand unless other brands were allowed', () => {
    const o = offer({ title: 'Bose QuietComfort' });
    expect(reasonOf(judge(product({ exactModel: 'Sony WH-1000XM5' }), o))).toBe('wrongBrand');
    expect(reasonOf(judge(product({ exactModel: 'Sony WH-1000XM5', flexibility: { alternativeBrands: true, refurbished: false, differentDates: false, nearbyLocations: false } }), o))).toBe('ok');
  });
  it('rejects refurbished unless allowed, late arrivals, over budget and already-rejected offers', () => {
    expect(reasonOf(judge(product(), offer({ condition: 'refurbished' })))).toBe('wrongCondition');
    expect(reasonOf(judge(product({ deliverBy: '2026-11-20' }), offer({ deliveryText: 'Delivery by Dec 1' })))).toBe('lateDelivery');
    expect(reasonOf(judge(product(), offer({ unitPrice: 60000 })))).toBe('overBudget');
    expect(reasonOf(judge(product(), offer(), new Set(['k'])))).toBe('alreadyRejected');
  });
  it('rejects accessories and prices far below similar listings', () => {
    expect(reasonOf(judge(product(), offer({ title: 'For Sony WH-1000XM5 Replacement Ear Pads' })))).toBe('accessory');
    expect(reasonOf(judge(product({ description: 'Phone case' }), offer({ title: 'Leather phone case' })))).toBe('ok');
    expect(reasonOf(evaluateOffer(product(), offer({ unitPrice: 4500 }), { budget: BUDGET, asOf: ASOF, rejectedKeys: new Set(), priceFloor: 9000 }))).toBe('suspiciouslyCheap');
  });
  it('does not reject when the delivery date is unknown, but says so', () => {
    const r = judge(product({ deliverBy: '2026-11-20' }), offer({ deliveryText: 'Free delivery' }));
    expect(r.ok && r.priced.tradeoffs.join()).toMatch(/delivery date/);
  });
  it('multiplies quantity, adds shipping, and marks unknown costs', () => {
    const r = judge(product({ quantity: 2 }), offer({ unitPrice: 10000, deliveryText: '$5 delivery' }));
    expect(r.ok && r.priced.total).toBe(20500);
    expect(r.ok && r.priced.basis).toBe('estimated');
    expect(r.ok && r.priced.unknownCosts).toContain('Sales tax');
  });
  it('a missing shipping cost stays unknown and is never counted as free', () => {
    const r = judge(product(), offer({ deliveryText: null }));
    expect(r.ok && r.priced.lines.find((l) => l.label === 'Shipping')?.amount).toBeNull();
    expect(r.ok && r.priced.unknownCosts).toContain('Shipping');
  });
  it('checks rentals against guests, bedrooms and amenities', () => {
    const base = offer({ kind: 'rental', unitPrice: undefined, title: 'House', stayTotal: 40000, stayBeforeFees: 34000, essentialInfo: ['Sleeps 6', '3 bedrooms'], amenities: ['Pool'] });
    expect(reasonOf(judge(rental(), base))).toBe('ok');
    expect(reasonOf(judge(rental(), { ...base, essentialInfo: ['Sleeps 2'] }))).toBe('tooSmall');
    expect(reasonOf(judge(rental({ amenities: ['Hot tub'] }), base))).toBe('missingAmenity');
    const r = judge(rental(), base);
    expect(r.ok && r.priced.lines.find((l) => l.label === 'Taxes and fees')?.amount).toBe(6000);
    expect(r.ok && r.priced.basis).toBe('estimated');
  });
});

describe('talking to SerpApi', () => {
  it('sends only the brief, and vacation rentals use the hotels engine', () => {
    expect(productParams('headphones', 'price_low', 50000)).toEqual({ engine: 'google_shopping', q: 'headphones', gl: 'us', hl: 'en', max_price: '500', sort_by: '1' });
    const p = rentalParams(rental(), { location: 'Galveston', checkIn: '2026-12-10', checkOut: '2026-12-12' }, 'best');
    expect(p).toMatchObject({ engine: 'google_hotels', vacation_rentals: 'true', check_in_date: '2026-12-10', adults: '4', bedrooms: '2' });
  });
  it('normalizes the documented shopping fields', () => {
    const [o] = normalizeShopping({ shopping_results: [{ title: 'Phone', source: 'Apple', extracted_price: 829, product_link: 'https://g.co/x', delivery: 'Free next-day delivery', extracted_old_price: 999, second_hand_condition: 'refurbished' }, { title: 'No price' }] }, 'at');
    expect(o).toMatchObject({ unitPrice: 82900, oldPrice: 99900, seller: 'Apple', link: 'https://g.co/x', condition: 'refurbished', retrievedAt: 'at', demo: false });
  });
  it('never invents a listing link for a rental', () => {
    const [o] = normalizeRentals({ properties: [{ name: 'Villa', total_rate: { extracted_lowest: 339, extracted_before_taxes_fees: 300 }, prices: [{ source: 'Bluepillow.com' }] }] }, 5, 'Bali', 'at');
    expect(o).toMatchObject({ stayTotal: 33900, stayBeforeFees: 30000, seller: 'Bluepillow.com', linkIsSearch: true });
    expect(o.link).toContain('google.com/search');
  });
  it('strips dollar targets from search words', () => {
    expect(safeQuery('wireless headphones under $300')).toBe('wireless headphones');
    expect(safeQuery('Sony WH-1000XM5')).toBe('Sony WH-1000XM5');
  });
  it('demo offers are always labeled and never linked', () => {
    for (const o of [...demoOffers(product(), BUDGET, ASOF, 'at'), ...demoOffers(rental(), BUDGET, ASOF, 'at')]) {
      expect(o.demo).toBe(true);
      expect(o.title + o.seller).toMatch(/Demo/);
      expect(o.link).toBeNull();
    }
  });
});

describe('working out the plan from its name', () => {
  it('needs something to search, or it is "other"', () => {
    expect(cleanGuess({ kind: 'trip', destination: '' }).kind).toBe('other');
    expect(cleanGuess({ kind: 'nonsense', destination: 'Mexico' }).kind).toBe('other');
    expect(cleanGuess({ kind: 'trip', destination: 'Cancun, Mexico', nights: 99 })).toMatchObject({ kind: 'trip', destination: 'Cancun Mexico', nights: 3 });
  });
  it('a trip gets labeled example dates, for everyone coming', () => {
    const b = briefFromGuess({ kind: 'trip', searchTerms: '', destination: 'Mexico', nights: 4 }, 'Mexico trip', 3, '2026-12-20', ASOF)!;
    expect(b).toMatchObject({ category: 'trip', location: 'Mexico', checkIn: '2026-12-20', checkOut: '2026-12-24', guests: 3, assumedDates: true });
    expect(briefFromGuess({ kind: 'trip', searchTerms: '', destination: 'Mexico', nights: 2 }, 'x', 2, '', ASOF)?.checkIn).toBe('2026-12-07');
  });
  it('nothing beyond a cheaper alternative is assumed', () => {
    const b = briefFromGuess({ kind: 'product', searchTerms: 'headphones', destination: '', nights: 3 }, 'Gift', 2, '2026-12-20', ASOF)!;
    expect(b.flexibility).toEqual({ alternativeBrands: true, refurbished: false, differentDates: false, nearbyLocations: false });
    expect(b.condition).toBe('new');
  });
  it('rent or dinner has nothing to shop for', () => {
    expect(briefFromGuess({ kind: 'other', searchTerms: '', destination: '', nights: 3 }, 'Rent', 2, '2026-12-20', ASOF)).toBeNull();
  });
});

describe('is the budget realistic?', () => {
  it('has no opinion without enough real prices', () => {
    expect(priceRange([10000, 20000])).toBeNull();
  });
  it('ignores the junk at the extremes', () => {
    const r = priceRange([100, ...Array.from({ length: 18 }, (_, i) => 20000 + i * 1000), 9000000])!;
    expect(r.low).toBe(21000);
    expect(r.typical).toBe(29000);
    expect(r.high).toBeLessThan(9000000);
  });
  it('a $50 trip is too low', () => {
    const r = { low: 30000, typical: 60000, high: 150000 };
    expect(judgeBudget(5000, r)).toBe('tooLow');
    expect(judgeBudget(40000, r)).toBe('tight');
    expect(judgeBudget(90000, r)).toBe('ok');
    expect(judgeBudget(900000, r)).toBe('high');
  });
});

const proposal = (over: Partial<Proposal> = {}): Proposal => ({
  id: 'p1', offerKey: 'offer-1', kind: 'product', title: 'Sony', seller: 'Shop', link: null, linkIsSearch: false, retrievedAt: 'now', demo: false, deliveryText: null, why: '',
  lines: [], total: 40000, planTotal: 40000, basis: 'advertised', unknownCosts: [], tradeoffs: [], underBudgetBy: 10000, belowListPriceBy: null, ...over,
});
const huddle = (over: Partial<Huddle> = {}): Huddle => ({
  id: 'h', name: 'Gift', totalCost: BUDGET, targetDate: '2026-12-01', createdBy: 'a', phase: 'revealed', round: 1, message: null, lastDecline: null, fairSplit: null, brief: product(),
  participants: [newParticipant('a', 'ua', 'A', { committed: true, pledge: 20000 }), newParticipant('b', 'ub', 'B', { committed: true, pledge: 15000 })], ...over,
});
const withProposals = (h = huddle()): Huddle => {
  const s = startSearch(h, 'requested', 'r1', '2026-11-07T00:00:00Z');
  return { ...s, search: { ...s.search!, status: 'done', proposals: [proposal()] } };
};
const inReview = (h?: Huddle) => startReview(withProposals(h), 'p1') as Huddle;

describe('everyone must accept a proposal', () => {
  it('starting a review resets agreements but leaves every pledge alone', () => {
    const h = inReview(huddle({ participants: [newParticipant('a', 'ua', 'A', { committed: true, pledge: 20000, agreed: true })] }));
    expect(h.participants[0].agreed).toBe(false);
    expect(h.participants[0].pledge).toBe(20000);
    expect(h.totalCost).toBe(BUDGET);
  });
  it('one acceptance changes nothing; the last one makes it the plan', () => {
    const one = acceptProposal(inReview(), 'a');
    expect(one.review).toBeTruthy();
    expect(one.selected).toBeUndefined();
    expect(one.totalCost).toBe(BUDGET);
    const both = acceptProposal(one, 'b');
    expect(both.review).toBeNull();
    expect(both.selected?.id).toBe('p1');
    expect(both.totalCost).toBe(40000);
    expect(both.participants.map((p) => p.pledge)).toEqual([20000, 15000]);
  });
  it('switching to another option starts the acceptances over', () => {
    const h = withProposals();
    const two = { ...h, search: { ...h.search!, proposals: [proposal(), proposal({ id: 'p2', offerKey: 'offer-2' })] } };
    const one = acceptProposal(startReview(two, 'p1') as Huddle, 'a');
    const switched = startReview(one, 'p2') as Huddle;
    expect(switched.review?.proposal.id).toBe('p2');
    expect(switched.review?.acceptedBy).toEqual([]);
    expect(startReview(switched, 'p2')).toBeTypeOf('string');
  });
  it('once everyone accepts, the other options are gone', () => {
    expect(acceptProposal(acceptProposal(inReview(), 'a'), 'b').search?.proposals).toEqual([]);
  });
  it('an underfunded plan stays underfunded after everyone accepts', () => {
    const done = acceptProposal(acceptProposal(inReview(), 'a'), 'b');
    expect(done.phase).toBe('revealed');
    expect(viewFor(done, 'a').shortfall).toBe(5000);
  });
  it('people without a login are not asked', () => {
    const h = huddle({ participants: [newParticipant('a', 'ua', 'A', { committed: true, pledge: 45000 }), newParticipant('leo', null, 'Leo', { isPaying: false })] });
    expect(acceptProposal(inReview(h), 'a').selected?.id).toBe('p1');
  });
  it('a no ends the round, blocks that offer and keeps the reason away from every browser', () => {
    const after = rejectProposal(acceptProposal(inReview(), 'a'), 'I cannot afford this after my zebra bill');
    expect(after.review).toBeNull();
    expect(after.rejectedOfferKeys).toEqual(['offer-1']);
    expect(after.proposalFeedback?.[0].reason).toMatch(/zebra/);
    for (const viewer of ['a', 'b']) {
      const json = JSON.stringify(viewFor(after, viewer));
      expect(json).not.toMatch(/afford|zebra/);
      expect(json).not.toContain('proposalFeedback');
    }
  });
});

describe('when Nemotron searches on its own', () => {
  it('searches once per shortfall', () => {
    const first = maybeAutoSearch(huddle(), 'r1', Date.now());
    expect(first.search?.trigger).toBe('underfunded');
    const done = { ...first, search: { ...first.search!, status: 'done' as const } };
    expect(maybeAutoSearch(done, 'r2', Date.now()).search?.runId).toBe('r1');
  });
  it('needs no form: any huddle that comes up short gets a search', () => {
    expect(maybeAutoSearch(huddle({ brief: null }), 'r', Date.now()).search?.trigger).toBe('underfunded');
  });
  it('does not search when funded, or after a plan was accepted', () => {
    const funded = huddle({ totalCost: 30000 });
    expect(maybeAutoSearch(funded, 'r', Date.now()).search).toBeUndefined();
    expect(maybeAutoSearch(huddle({ selected: proposal() }), 'r', Date.now()).search).toBeUndefined();
  });
  it('accepting a cheaper stay keeps room for flights in the plan', () => {
    const h = withProposals();
    const trip = { ...h, search: { ...h.search!, proposals: [proposal({ kind: 'rental', total: 12000, planTotal: 35000 })] } };
    const done = acceptProposal(acceptProposal(startReview(trip, 'p1') as Huddle, 'a'), 'b');
    expect(done.totalCost).toBe(35000);
    expect(done.phase).toBe('agreeing');
    expect(done.participants.map((p) => p.pledge)).toEqual([20000, 15000]);
  });
  it('hides the funding gap until commitments are revealed', () => {
    const hidden = viewFor(withProposals(huddle({ phase: 'pledging' })), 'a');
    expect(hidden.purchase?.search?.proposals[0].fundingGap).toBeNull();
    expect(JSON.stringify(hidden)).not.toContain('fundingKey');
    expect(viewFor(withProposals(), 'a').purchase?.search?.proposals[0].fundingGap).toBe(5000);
  });
});

describe('what Nemotron writes for the group', () => {
  it('drops sentences with numbers or anything about money', () => {
    expect(groupSafe('Great sound for the trip. It costs 300 dollars. Fits your savings well.')).toBe('Great sound for the trip.');
  });
});
