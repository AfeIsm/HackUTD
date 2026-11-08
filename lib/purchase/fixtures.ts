// Used ONLY when SerpApi is unavailable. Every offer is marked demo, named "Demo", and has no link,
// so it can never be mistaken for a real price. Includes offers that should be rejected, so the
// workflow still shows real filtering.
import { addDays, daysBetween } from '../engine/dates';
import type { Offer, PurchaseBrief } from './types';

export function demoOffers(b: PurchaseBrief, budget: number, asOf: string, retrievedAt: string): Offer[] {
  const name = b.exactModel ?? b.description;
  const base = { link: null, retrievedAt, demo: true };
  if (b.category === 'product') {
    const unit = Math.floor(budget / b.quantity);
    const onTime = addDays(asOf, 3);
    const mk = (id: string, seller: string, share: number, delivery: string, condition: string | null = null): Offer => ({
      ...base, key: `demo:${id}`, kind: 'product', title: `Demo: ${name}`, seller,
      unitPrice: Math.round(unit * share), deliveryText: delivery, condition,
    });
    return [
      mk('a', 'Demo Store A', 0.74, `Free delivery by ${monthDay(onTime)}`),
      mk('b', 'Demo Store B', 0.88, `$6.99 delivery by ${monthDay(onTime)}`),
      mk('c', 'Demo Store C', 0.6, `Free delivery by ${monthDay(addDays(b.deliverBy ?? asOf, 21))}`),
      mk('d', 'Demo Outlet', 0.52, 'Free delivery', 'refurbished'),
      mk('e', 'Demo Boutique', 1.3, 'Free delivery'),
    ];
  }
  const nights = daysBetween(b.checkIn as string, b.checkOut as string);
  const guests = b.guests ?? 2;
  const beds = b.bedrooms ?? 1;
  const mk = (id: string, share: number, sleeps: number, bedrooms: number): Offer => {
    const stayTotal = Math.round(budget * share);
    return {
      ...base, key: `demo:${id}`, kind: 'rental', title: b.mode === 'exact' ? `Demo: ${name} ${id.toUpperCase()}` : `Demo: ${b.location} rental ${id.toUpperCase()}`,
      seller: 'Demo listing', nights, stayTotal, stayBeforeFees: Math.round(stayTotal * 0.85),
      amenities: b.amenities, essentialInfo: [`Sleeps ${sleeps}`, `${bedrooms} bedrooms`],
    };
  };
  return [mk('a', 0.72, guests + 2, beds + 1), mk('b', 0.9, guests, beds), mk('c', 0.5, Math.max(1, guests - 1), beds), mk('d', 1.25, guests + 4, beds + 2)];
}

function monthDay(date: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;
}
