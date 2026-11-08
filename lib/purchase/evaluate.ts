// Does an offer meet the group's requirements, and what does it cost? Plain code, no AI.
// Unknown stays unknown: we never fill in a missing fee, date or feature.
import { addDays } from '../engine/dates';
import { toCents } from '../engine/money';
import { shortDate } from '../format';
import type { Offer, Priced, PriceLine, PurchaseBrief } from './types';

const MAJOR_RETAILERS = /\b(amazon|walmart|target|best buy|costco|apple|samsung|sony|nintendo|gamestop|newegg|b&h|sweetwater|ebay|kohl'?s|macy'?s|nordstrom|home depot|lowe'?s|rei)\b/i;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Read a shopping `delivery` string. Null means the text didn't say. */
export function parseDelivery(text: string | null | undefined, asOf: string): { shipping: number | null; date: string | null } {
  if (!text) return { shipping: null, date: null };
  const paid = text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:delivery|shipping)/i);
  const shipping = paid ? toCents(Number(paid[1].replace(/,/g, ''))) : /free\b.*(delivery|shipping)|(delivery|shipping).*free\b/i.test(text) ? 0 : null;
  if (/next[- ]day|tomorrow/i.test(text)) return { shipping, date: addDays(asOf, 1) };
  if (/\btoday\b/i.test(text)) return { shipping, date: asOf };
  const inDays = text.match(/\b(\d{1,2})[- ]day\b/i);
  if (inDays) return { shipping, date: addDays(asOf, Number(inDays[1])) };
  // "by Nov 12", "Nov 12 - 15" (the later day, so we never call a late arrival on time)
  const named = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?/i);
  if (!named) return { shipping, date: null };
  const pad = (n: number) => String(n).padStart(2, '0');
  const month = MONTHS.indexOf(named[1].toLowerCase()) + 1;
  const day = Number(named[3] ?? named[2]);
  let year = Number(asOf.slice(0, 4));
  if (`${year}-${pad(month)}-${pad(day)}` < asOf) year += 1;
  return { shipping, date: `${year}-${pad(month)}-${pad(day)}` };
}

const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1 || /\d/.test(t));
const hasAllTokens = (haystack: string, needle: string) => {
  const have = new Set(tokens(haystack));
  return tokens(needle).every((t) => have.has(t));
};
const firstNumber = (lines: string[] | undefined, pattern: RegExp): number | null => {
  for (const line of lines ?? []) {
    const m = line.match(pattern);
    if (m) return Number(m[1]);
  }
  return null;
};

export function priceOffer(brief: PurchaseBrief, offer: Offer, budget: number, asOf: string): Priced {
  const lines: PriceLine[] = [];
  const unknownCosts: string[] = [];
  const tradeoffs: string[] = [];
  let total: number;
  let basis: Priced['basis'];
  let belowListPriceBy: number | null = null;

  if (offer.kind === 'product') {
    const unit = offer.unitPrice ?? 0;
    const items = unit * brief.quantity;
    const { shipping, date } = parseDelivery(offer.deliveryText, asOf);
    lines.push({ label: brief.quantity > 1 ? `Item (${brief.quantity} at the advertised price)` : 'Item', amount: items });
    lines.push({ label: 'Shipping', amount: shipping });
    if (shipping === null) unknownCosts.push('Shipping');
    unknownCosts.push('Sales tax');
    total = items + (shipping ?? 0);
    basis = brief.quantity > 1 || (shipping ?? 0) > 0 ? 'estimated' : 'advertised';
    if (brief.quantity > 1 && shipping !== null) tradeoffs.push('Shipping is counted once, and may be charged per item.');
    if (offer.oldPrice && offer.oldPrice > unit) belowListPriceBy = (offer.oldPrice - unit) * brief.quantity;
    if (offer.condition) tradeoffs.push(`Condition: ${offer.condition}`);
    if (!offer.demo && !MAJOR_RETAILERS.test(offer.seller)) tradeoffs.push(`${offer.seller} isn’t a major retailer. Check them out before buying.`);
    if (brief.deliverBy && !date) tradeoffs.push('The listing doesn’t give a delivery date.');
  } else {
    const stay = offer.stayTotal ?? 0;
    const before = offer.stayBeforeFees ?? null;
    if (before !== null && before > 0 && before < stay) {
      lines.push({ label: 'Stay', amount: before }, { label: 'Taxes and fees', amount: stay - before }, { label: 'Cleaning fee', amount: null });
      unknownCosts.push('Whether a cleaning fee is included');
    } else {
      lines.push({ label: 'Stay', amount: stay }, { label: 'Taxes and fees', amount: null }, { label: 'Cleaning fee', amount: null });
      unknownCosts.push('Taxes and fees', 'Cleaning fee');
    }
    total = stay;
    basis = 'estimated';
    if (brief.category === 'trip') unknownCosts.push('Flights (not searched)', 'Food and activities');
    if (brief.assumedDates && brief.checkIn && brief.checkOut) tradeoffs.push(`Priced for ${shortDate(brief.checkIn)} to ${shortDate(brief.checkOut)} as an example. Your dates may cost more or less.`);
    if (brief.guests && firstNumber(offer.essentialInfo, /sleeps\s+(\d+)/i) === null) tradeoffs.push('The listing doesn’t say how many guests it sleeps.');
    if (brief.bedrooms && firstNumber(offer.essentialInfo, /(\d+)\s+bedroom/i) === null) tradeoffs.push('The listing doesn’t give a bedroom count.');
    if (brief.amenities.length && !offer.amenities?.length) tradeoffs.push('The listing doesn’t list its amenities.');
  }
  return { lines, total, basis, unknownCosts, tradeoffs, underBudgetBy: budget - total, belowListPriceBy };
}

// "For Sony WH-1000XM5" is a case or ear pad, not the headphones.
const ACCESSORY = /^\s*for\s|\b(case|cover|ear ?pads?|replacement|charger|cable|skin|protector|compatible with)\b/i;

export type RejectReason = 'accessory' | 'suspiciouslyCheap' | 'alreadyRejected' | 'noPrice' |'wrongItem' | 'wrongBrand' | 'wrongCondition' | 'lateDelivery' | 'tooSmall' | 'tooFewBedrooms' | 'missingAmenity' | 'overBudget';

export const REJECT_TEXT: Record<RejectReason, string> = {
  accessory: 'an accessory, not the item itself',
  suspiciouslyCheap: 'priced far below similar listings, so likely not the real item',
  alreadyRejected: 'the group already said no to it',
  noPrice: 'no price listed',
  wrongItem: 'not the exact item requested',
  wrongBrand: 'a different brand, which the group didn’t allow',
  wrongCondition: 'not new, and refurbished wasn’t allowed',
  lateDelivery: 'arrives after the deadline',
  tooSmall: 'doesn’t sleep enough guests',
  tooFewBedrooms: 'too few bedrooms',
  missingAmenity: 'missing a required amenity',
  overBudget: 'over the target budget',
};

export function evaluateOffer(brief: PurchaseBrief, offer: Offer, ctx: { budget: number; asOf: string; rejectedKeys: Set<string>; priceFloor?: number }):{ ok: true; priced: Priced } | { ok: false; reason: RejectReason } {
  const reject = (reason: RejectReason) => ({ ok: false as const, reason });
  if (ctx.rejectedKeys.has(offer.key)) return reject('alreadyRejected');
  if (offer.kind === 'product' ? !offer.unitPrice : !offer.stayTotal) return reject('noPrice');
  if (brief.exactModel) {
    if (brief.mode === 'exact' && !hasAllTokens(offer.title, brief.exactModel)) return reject('wrongItem');
    if (brief.mode === 'flexible' && !brief.flexibility.alternativeBrands && offer.kind === 'product') {
      const brand = tokens(brief.exactModel)[0];
      if (brand && !hasAllTokens(offer.title, brand)) return reject('wrongBrand');
    }
  }
  if (offer.kind === 'product') {
    if (ACCESSORY.test(offer.title) && !ACCESSORY.test(brief.description)) return reject('accessory');
    if (ctx.priceFloor && (offer.unitPrice ?? 0) < ctx.priceFloor) return reject('suspiciouslyCheap');
    if (brief.condition === 'new' && offer.condition && !brief.flexibility.refurbished) return reject('wrongCondition');
    const { date } = parseDelivery(offer.deliveryText, ctx.asOf);
    if (brief.deliverBy && date && date > brief.deliverBy) return reject('lateDelivery');
  } else {
    const sleeps = firstNumber(offer.essentialInfo, /sleeps\s+(\d+)/i);
    if (brief.guests && sleeps !== null && sleeps < brief.guests) return reject('tooSmall');
    const bedrooms = firstNumber(offer.essentialInfo, /(\d+)\s+bedroom/i);
    if (brief.bedrooms && bedrooms !== null && bedrooms < brief.bedrooms) return reject('tooFewBedrooms');
    if (offer.amenities?.length) {
      const have = offer.amenities.join(' | ').toLowerCase();
      if (brief.amenities.some((a) => !have.includes(a.toLowerCase()))) return reject('missingAmenity');
    }
  }
  const priced = priceOffer(brief, offer, ctx.budget, ctx.asOf);
  if (priced.total > ctx.budget) return reject('overBudget');
  return { ok: true, priced };
}
