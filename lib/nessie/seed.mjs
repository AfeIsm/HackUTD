// Seeds the Nessie sandbox with the demo people (PLAN.md §9) and saves everything to
// lib/nessie/local.json (the offline fallback the app can read with USE_LOCAL_DATA=true).
//
// Run once:  npm run seed
// Safe to re-run: it stops if local.json exists or the people are already in Nessie.
// Nessie note: purchases/deposits do NOT change account balances, so each account is
// created with today's balance and the 60 days of history are records only.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(HERE, 'local.json');
const BASE = 'https://api.nessieisreal.com';
const AS_OF = '2026-11-07';

function readKey() {
  if (process.env.NESSIE_API_KEY) return process.env.NESSIE_API_KEY.trim();
  const env = readFileSync(join(ROOT, '.env.local'), 'utf8');
  const m = env.match(/^NESSIE_API_KEY=(.*)$/m);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
}
const KEY = readKey();
if (!KEY) {
  console.error('NESSIE_API_KEY is missing. Put it in .env.local.');
  process.exit(1);
}

async function call(method, path, body) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${BASE}${path}${path.includes('?') ? '&' : '?'}key=${KEY}`, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (res.ok) return text ? JSON.parse(text) : null;
    if (attempt === 3 || res.status < 500) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 800 * attempt));
  }
}
const created = (res) => res.objectCreated;

// ---------- demo data ----------
const ADDRESS = { street_number: '800', street_name: 'W Campbell Rd', city: 'Richardson', state: 'TX', zip: '75080' };

const MERCHANTS = [
  ['H-E-B', 'Groceries'], ['Kroger', 'Groceries'], ['Chipotle', 'Dining'], ["Torchy's Tacos", 'Dining'],
  ['Starbucks', 'Dining'], ['Sonic Drive-In', 'Dining'], ['Shell', 'Gas'], ['Target', 'Shopping'],
  ['Netflix', 'Entertainment'], ['Spotify', 'Entertainment'], ['Hulu', 'Entertainment'], ['Disney+', 'Entertainment'],
  ['YouTube Premium', 'Entertainment'], ['Audible', 'Entertainment'], ['Planet Fitness', 'Fitness'],
  ["Gold's Gym", 'Fitness'], ['HelloFresh', 'Food delivery'],
];

const pay = (description, amount, dates) => dates.map((d) => ({ description, amount, date: d }));
const buys = (merchant, list) => list.map(([date, amount]) => ({ merchant, date, amount }));

const PEOPLE = {
  alex: {
    first: 'Alex', last: 'Rivera',
    accounts: { checking: 386.4, savings: 900, card: 900 },
    deposits: pay('ACME CORP PAYROLL', 1850, ['2026-09-18', '2026-10-02', '2026-10-16', '2026-10-30']),
    purchases: [
      ...buys('Netflix', [['2026-09-14', 15.49], ['2026-10-14', 15.49]]),
      ...buys('Spotify', [['2026-09-16', 11.99], ['2026-10-16', 11.99]]),
      ...buys('Hulu', [['2026-09-21', 17.99], ['2026-10-21', 17.99]]),
      ...buys('Planet Fitness', [['2026-09-28', 40], ['2026-10-28', 40]]),
      ...buys('H-E-B', [['2026-09-13', 64.2], ['2026-09-20', 42.1], ['2026-09-27', 88.45], ['2026-10-04', 51.75],
        ['2026-10-09', 61.3], ['2026-10-17', 47.9], ['2026-10-24', 35.8], ['2026-11-01', 72.15]]),
      ...buys('Chipotle', [['2026-09-11', 12.85], ['2026-10-03', 13.25], ['2026-10-25', 14.1]]),
      ...buys("Torchy's Tacos", [['2026-09-19', 22.4], ['2026-10-12', 31.6]]),
      ...buys('Starbucks', [['2026-09-15', 6.45], ['2026-09-24', 5.95], ['2026-10-08', 7.3], ['2026-10-30', 6.1]]),
      ...buys('Shell', [['2026-09-12', 38.2], ['2026-09-29', 52.75], ['2026-10-14', 31.9], ['2026-11-02', 45.1]]),
      ...buys('Target', [['2026-10-20', 23.49]]),
    ],
    bills: [
      { payee: 'Rent', day: 1, next: '2026-12-01', amount: 1200 },
      { payee: 'Electric', day: 10, next: '2026-11-10', amount: 120 },
      { payee: 'Car insurance', day: 12, next: '2026-11-12', amount: 95 },
      { payee: 'T-Mobile', day: 12, next: '2026-11-12', amount: 65 },
    ],
    loans: [{ type: 'auto', monthly: 310, amount: 14800, dueDay: 20, description: 'Car loan' }],
  },
  jordan: {
    first: 'Jordan', last: 'Rivera',
    accounts: { checking: 2140, savings: 2400, card: 310 },
    deposits: pay('GLOBEX PAYROLL', 2600, ['2026-09-18', '2026-10-02', '2026-10-16', '2026-10-30']),
    purchases: [
      ...buys('HelloFresh', [['2026-09-10', 240], ['2026-10-10', 240]]),
      ...buys("Gold's Gym", [['2026-09-18', 60], ['2026-10-18', 60]]),
      ...buys('Disney+', [['2026-09-19', 13.99], ['2026-10-19', 13.99]]),
      ...buys('Audible', [['2026-09-22', 14.95], ['2026-10-22', 14.95]]),
      ...buys('YouTube Premium', [['2026-09-26', 13.99], ['2026-10-26', 13.99]]),
      ...buys('Kroger', [['2026-09-14', 96.4], ['2026-09-29', 74.2], ['2026-10-11', 118.65], ['2026-10-27', 82.3]]),
      ...buys('Starbucks', [['2026-09-17', 5.75], ['2026-10-05', 6.25], ['2026-10-23', 5.5]]),
      ...buys('Shell', [['2026-09-21', 48.6], ['2026-10-13', 55.2], ['2026-11-03', 39.8]]),
    ],
    bills: [
      { payee: 'Utilities', day: 9, next: '2026-11-09', amount: 140 },
      { payee: 'Verizon', day: 12, next: '2026-11-12', amount: 70 },
      { payee: 'Car insurance', day: 20, next: '2026-11-20', amount: 110 },
      { payee: 'Health insurance', day: 25, next: '2026-11-25', amount: 380 },
    ],
    loans: [{ type: 'auto', monthly: 420, amount: 18500, dueDay: 15, description: 'Car loan' }],
  },
  maya: {
    first: 'Maya', last: 'Rivera',
    accounts: { checking: 120, savings: 400 },
    deposits: pay('SONIC DRIVE-IN PAYROLL', 150, ['2026-09-15', '2026-09-30', '2026-10-15', '2026-10-30']),
    purchases: [
      ...buys('Target', [['2026-09-20', 18.75], ['2026-10-18', 32.4]]),
      ...buys('Starbucks', [['2026-09-26', 6.95], ['2026-10-09', 7.45]]),
    ],
    bills: [],
    loans: [],
  },
  sam: {
    first: 'Sam', last: 'Chen',
    accounts: { checking: 1480, savings: 3200, card: 450 },
    deposits: pay('INITECH PAYROLL', 2200, ['2026-09-18', '2026-10-02', '2026-10-16', '2026-10-30']),
    purchases: [
      ...buys('Spotify', [['2026-09-20', 11.99], ['2026-10-20', 11.99]]),
      ...buys('H-E-B', [['2026-09-16', 58.3], ['2026-10-01', 71.9], ['2026-10-19', 49.6]]),
      ...buys('Chipotle', [['2026-09-23', 13.4], ['2026-10-15', 12.9]]),
    ],
    bills: [
      { payee: 'Rent', day: 1, next: '2026-12-01', amount: 1100 },
      { payee: 'Electric', day: 14, next: '2026-11-14', amount: 90 },
      { payee: 'AT&T', day: 18, next: '2026-11-18', amount: 60 },
    ],
    loans: [],
  },
};

// ---------- seed ----------
async function main() {
  if (existsSync(OUT)) {
    console.log('lib/nessie/local.json already exists, so Nessie is already seeded. Nothing to do.');
    console.log('(To reseed on purpose: delete local.json AND use a fresh Nessie key.)');
    return;
  }
  const existing = await call('GET', '/customers');
  const ours = existing.filter((c) => Object.values(PEOPLE).some((p) => p.first === c.first_name && p.last === c.last_name));
  if (ours.length) {
    console.log(`Nessie already has ${ours.length} of our people under this key. Stopping to avoid duplicates.`);
    return;
  }

  console.log('Creating merchants...');
  const merchantIds = {};
  const merchants = {};
  for (const [name, category] of MERCHANTS) {
    const m = created(await call('POST', '/merchants', {
      name, category, address: ADDRESS, geocode: { lat: 32.9857, lng: -96.7502 },
    }));
    merchantIds[name] = m._id;
    merchants[m._id] = { name, category };
  }

  const members = {};
  for (const [id, p] of Object.entries(PEOPLE)) {
    console.log(`Seeding ${p.first}...`);
    const customer = created(await call('POST', '/customers', { first_name: p.first, last_name: p.last, address: ADDRESS }));
    const mk = async (type, nickname, balance) =>
      created(await call('POST', `/customers/${customer._id}/accounts`, { type, nickname, rewards: 0, balance }));
    const checking = await mk('Checking', 'Checking', p.accounts.checking);
    const savings = await mk('Savings', 'Savings', p.accounts.savings);
    const card = p.accounts.card !== undefined ? await mk('Credit Card', 'Credit card', p.accounts.card) : null;

    for (const d of p.deposits) {
      await call('POST', `/accounts/${checking._id}/deposits`, {
        medium: 'balance', transaction_date: d.date, status: 'completed', amount: d.amount, description: d.description,
      });
    }
    for (const b of p.purchases) {
      await call('POST', `/accounts/${checking._id}/purchases`, {
        merchant_id: merchantIds[b.merchant], medium: 'balance', purchase_date: b.date, amount: b.amount,
        status: 'completed', description: b.merchant,
      });
    }
    for (const bill of p.bills) {
      await call('POST', `/accounts/${checking._id}/bills`, {
        status: 'recurring', payee: bill.payee, nickname: bill.payee, payment_date: bill.next,
        recurring_date: bill.day, payment_amount: bill.amount,
      });
    }
    for (const loan of p.loans) {
      await call('POST', `/accounts/${checking._id}/loans`, {
        type: loan.type, status: 'approved', credit_score: 700, monthly_payment: loan.monthly, amount: loan.amount,
        description: `${loan.description} · due ${loan.dueDay}`,
      });
    }

    // Read back exactly what Nessie stored
    const accounts = [];
    for (const a of [checking, savings, card].filter(Boolean)) {
      const fresh = await call('GET', `/accounts/${a._id}`);
      accounts.push({
        ...fresh,
        purchases: await call('GET', `/accounts/${a._id}/purchases`),
        deposits: await call('GET', `/accounts/${a._id}/deposits`),
        withdrawals: await call('GET', `/accounts/${a._id}/withdrawals`),
        bills: await call('GET', `/accounts/${a._id}/bills`),
        loans: await call('GET', `/accounts/${a._id}/loans`),
      });
    }
    members[id] = { customerId: customer._id, name: `${p.first} ${p.last}`, accounts };
  }

  writeFileSync(OUT, `${JSON.stringify({ seededAt: new Date().toISOString(), asOf: AS_OF, merchants, members }, null, 2)}\n`);
  const counts = Object.entries(members).map(([id, m]) => {
    const n = m.accounts.reduce((s, a) => s + a.purchases.length + a.deposits.length, 0);
    return `${id}: ${m.accounts.length} accounts, ${n} transactions`;
  });
  console.log(`Done. Saved lib/nessie/local.json\n  ${counts.join('\n  ')}`);
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
