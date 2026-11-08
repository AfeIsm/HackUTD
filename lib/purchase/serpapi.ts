// SerpApi, server only. Field names follow serpapi.com/google-shopping-api and
// serpapi.com/google-hotels-api. The ONLY inputs are the brief's own words, dates and budget:
// no balances, transactions, scores or member identities are ever sent.
import { createHash } from 'node:crypto';
import { daysBetween } from '../engine/dates';
import { toCents } from '../engine/money';
import { getDb, mongoConfigured } from '../db/mongo';
import type { Offer, PurchaseBrief } from './types';

const URL_BASE = 'https://serpapi.com/search';
const CACHE_MS = 60 * 60_000;
const TIMEOUT_MS = 12_000;
const MAX_OFFERS = 20;
const CACHE_VERSION = 'v1';

export const searchConfigured = () => Boolean(process.env.SERP_API_KEY);

type Json = Record<string, unknown>;
const text = (v: unknown, max = 160) => (typeof v === 'string' ? v.slice(0, max) : '');
const cents = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? toCents(v) : undefined);
const webLink = (v: unknown) => (typeof v === 'string' && /^https?:\/\//.test(v) ? v : null);
const stringList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 30) : []);

export function productParams(q: string, sort: 'best' | 'price_low', maxPriceCents: number): Record<string, string> {
  return {
    engine: 'google_shopping', q, gl: 'us', hl: 'en',
    max_price: String(Math.ceil(maxPriceCents / 100)),
    ...(sort === 'price_low' ? { sort_by: '1' } : {}),
  };
}

export function rentalParams(b: PurchaseBrief, stay: { location: string; checkIn: string; checkOut: string }, sort: 'best' | 'price_low'): Record<string, string> {
  return {
    engine: 'google_hotels', vacation_rentals: 'true', gl: 'us', hl: 'en', currency: 'USD',
    q: b.mode === 'exact' && b.exactModel ? `${b.exactModel} ${stay.location}` : stay.location,
    check_in_date: stay.checkIn, check_out_date: stay.checkOut,
    adults: String(b.guests ?? 2),
    ...(b.bedrooms ? { bedrooms: String(b.bedrooms) } : {}),
    ...(sort === 'price_low' ? { sort_by: '3' } : {}),
  };
}

export function normalizeShopping(json: Json, retrievedAt: string): Offer[] {
  const categorized = Array.isArray(json.categorized_shopping_results) ? json.categorized_shopping_results as Json[] : [];
  const rows = [
    ...(Array.isArray(json.shopping_results) ? json.shopping_results as Json[] : []),
    ...categorized.flatMap((c) => (Array.isArray(c.shopping_results) ? c.shopping_results as Json[] : [])),
  ];
  const seen = new Set<string>();
  const offers: Offer[] = [];
  for (const r of rows) {
    const unitPrice = cents(r.extracted_price);
    const title = text(r.title);
    if (!unitPrice || !title) continue;
    const seller = text(r.source, 80) || 'Unknown seller';
    const key = `${title}|${seller}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    offers.push({
      key, kind: 'product', title, seller, link: webLink(r.product_link), retrievedAt, demo: false, unitPrice,
      oldPrice: cents(r.extracted_old_price), deliveryText: text(r.delivery, 80) || null,
      condition: text(r.second_hand_condition, 40) || null,
      rating: typeof r.rating === 'number' ? r.rating : null, reviews: typeof r.reviews === 'number' ? r.reviews : null,
    });
    if (offers.length === MAX_OFFERS) break;
  }
  return offers;
}

export function normalizeRentals(json: Json, nights: number, location: string, retrievedAt: string): Offer[] {
  const rows = Array.isArray(json.properties) ? json.properties as Json[] : [];
  const offers: Offer[] = [];
  for (const r of rows.slice(0, MAX_OFFERS)) {
    const title = text(r.name);
    if (!title) continue;
    const total = (r.total_rate ?? {}) as Json;
    const perNight = (r.rate_per_night ?? {}) as Json;
    const nightly = cents(perNight.extracted_lowest);
    const nightlyBefore = cents(perNight.extracted_before_taxes_fees);
    const stayTotal = cents(total.extracted_lowest) ?? (nightly ? nightly * nights : undefined);
    const stayBeforeFees = cents(total.extracted_before_taxes_fees) ?? (nightlyBefore ? nightlyBefore * nights : undefined);
    const prices = Array.isArray(r.prices) ? r.prices as Json[] : [];
    const direct = webLink(r.link) ?? webLink(prices[0]?.link);
    offers.push({
      key: (text(r.property_token, 120) || title).toLowerCase(), kind: 'rental', title,
      seller: text(prices[0]?.source, 80) || 'Google Hotels listing',
      // Vacation rentals often come back with no listing link; never pretend we have one.
      link: direct ?? `https://www.google.com/search?q=${encodeURIComponent(`${title} ${location}`)}`, linkIsSearch: !direct,
      retrievedAt, demo: false, nights, stayTotal: stayTotal ?? null, stayBeforeFees: stayBeforeFees ?? null,
      amenities: stringList(r.amenities), essentialInfo: stringList(r.essential_info),
      rating: typeof r.overall_rating === 'number' ? r.overall_rating : null, reviews: typeof r.reviews === 'number' ? r.reviews : null,
    });
  }
  return offers;
}

export const nightsOf = (checkIn: string, checkOut: string) => daysBetween(checkIn, checkOut);

export interface SearchResult { offers: Offer[]; source: 'live' | 'cache' | 'unavailable' }
interface CacheDoc { _id: string; offers: Offer[]; expiresAt: Date }

const cacheId = (params: Record<string, string>) => createHash('sha256').update(CACHE_VERSION + JSON.stringify(Object.entries(params).sort())).digest('hex');

/** One search. `unavailable` means no key, an API error or a timeout: the caller labels demo data. */
export async function runSearch(params: Record<string, string>, normalize: (json: Json, retrievedAt: string) => Offer[]): Promise<SearchResult> {
  const id = cacheId(params);
  const cache = mongoConfigured() ? (await getDb()).collection<CacheDoc>('serpCache') : null;
  const hit = await cache?.findOne({ _id: id, expiresAt: { $gt: new Date() } }).catch(() => null);
  if (hit) return { offers: hit.offers, source: 'cache' };
  const key = process.env.SERP_API_KEY;
  if (!key) return { offers: [], source: 'unavailable' };
  try {
    const res = await fetch(`${URL_BASE}?${new URLSearchParams({ ...params, api_key: key })}`, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
    const json = (await res.json()) as Json;
    const status = (json.search_metadata as Json | undefined)?.status;
    // A Success with an `error` just means Google had no results: that is a real, empty answer.
    if (!res.ok || status !== 'Success') {
      console.warn(`SerpApi search failed (HTTP ${res.status})`); // never log the URL: it holds the key
      return { offers: [], source: 'unavailable' };
    }
    const offers = normalize(json, new Date().toISOString());
    await cache?.replaceOne({ _id: id }, { offers, expiresAt: new Date(Date.now() + CACHE_MS) }, { upsert: true }).catch(() => undefined);
    return { offers, source: 'live' };
  } catch {
    console.warn('SerpApi search failed (network or timeout)');
    return { offers: [], source: 'unavailable' };
  }
}
