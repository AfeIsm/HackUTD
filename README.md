<p align="center">
  <img src="public/wallet/logo.png" alt="Wallet Whisperer logo" width="112" />
</p>

# Wallet Whisperer

### Can we afford it?

Wallet Whisperer helps you understand your money, check a purchase before checkout, and plan shared purchases without exposing your private finances. Open an interactive folding wallet to find your accounts, financial health, friends, household, and **Huddles**—our group purchase feature.

Built for **HackUTD 2026** with **Capital One Nessie**, **NVIDIA Nemotron**, and **MongoDB Atlas**.

**[Open Wallet Whisperer](https://hack-utd.vercel.app)**

> Wallet Whisperer is a hackathon application using synthetic banking data and sandbox transactions. It does not connect to your personal bank or move real money. Its financial health score is an explainable application rubric, not a credit score.

## What you can do

### Open your wallet

Start with a closed leather wallet. Unfold it, sign in through your member ID, and pull a card from its pocket to open a page. The banknote opens **Can I Buy?**. Returning to the wallet reverses the transition.

The interface includes responsive layouts, keyboard navigation, reduced-motion support, and locally stored textures, logos, and fonts. Authentication uses real server sessions; the member ID shows the signed-in account.

### Understand your money

**My Money** brings together checking, savings, credit cards, detected income, bills, subscriptions, and savings goals. It shows a 30-day checking forecast, an explainable health score, and saved assessment history.

You can record a purchase against a specific account, correct essential-bill tags, earmark savings for a goal, rerun your assessment, and review a fix plan. Changes are saved through the backend and reflected in subsequent assessments. Synthetic data and available data-source information are labeled in the interface.

### Check purchases before checkout

**Can I Buy?** evaluates one purchase or several purchases together, preserving each item's date. Select an exact funding account or an eligible savings-goal allocation to see the combined effect on upcoming bills, protected savings, and your score.

The deterministic engine returns **Yes**, **Yes, if…**, or **Not right now**, with before-and-after indicators, missing inputs, and warnings. Available comparison features can explore alternatives. A purchase preview does not execute a purchase.

### Ask an AI coach

Describe a goal in your own words. The **Nemotron coach** retrieves your financial context, calls tools to inspect spending and simulate changes, and streams its progress into the app. Proposed plans are re-scored by the financial engine, with reviewer checks against the underlying data and rules.

Financial calculations belong to the engine. The model chooses tools and explains results. Supported plans require an explicit action before they are applied, and saved answers can be reused when their financial context matches.

### Connect with friends and household members

Add people by their unique username. Requests are saved on the server, and recipients accept or decline from their own account. Usernames are case-insensitive; there is no public financial directory.

Household membership does not automatically share financial records. Each member controls six sharing categories: **balances, income, bills and loans, savings goals, recent transactions, and health score**. These choices default off and can be revoked. The server returns only the categories the viewer is allowed to see.

### Plan a purchase together

Create a **Huddle**, set its cost and target date, and invite accepted connections as paying or nonpaying participants.

1. **Pledge privately.** Each payer selects an amount and exact source account. Their check includes promises already made in other active Huddles.
2. **Review the result.** Missing information or insufficient available money blocks a commitment. Fundable pledges can proceed with private warnings when they affect financial health.
3. **Reveal and agree.** Once the paying members commit, the group can review contribution amounts and agree to the plan. Revisions require renewed review.
4. **Lock the promises.** Locking saves commitments; it does not transfer money. Later health checks can identify commitments at risk.
5. **Choose Transfer now.** A member can explicitly confirm their own sandbox contribution. The application records the contribution and reflects its debit in subsequent financial views.

Huddle detail views also support invitations, requested changes, private coaching, and purchase-option proposals. Group views do not expose underlying account balances, private funding sources, or personal coaching.

## How the health score works

Five indicators contribute to a weighted score. Each indicator earns 100 points for green, 50 for yellow, and 0 for red; its weight determines its contribution to the total.

| Indicator | Weight | What it measures |
| --- | --- | --- |
| Essential bills covered | 40% | The lowest individual checking-account balance in the 30-day forecast, expressed as days of essential costs covered; green requires 10 days |
| Safety cushion | 20% | Unallocated savings relative to monthly essential costs; green requires at least 3 months |
| Debt load | 15% | Scheduled loan payments and confirmed card minimums relative to monthly income |
| Savings protection | 15% | Use of unallocated savings for spending, including applicable reservations and simulated changes |
| Nonessential subscriptions | 10% | Detected nonessential subscription costs relative to monthly income |

**Healthy:** 75–100 · **Watch:** 50–74 · **At risk:** below 50.

A negative essential-bills forecast makes the overall result **At risk**, regardless of the weighted score. Missing required data produces **Needs input** and a nullable score rather than an invented result. Exact thresholds, account validation, and scenario calculations live in [`lib/engine`](lib/engine).

All stored and calculated money uses **integer cents**. Spending checks name an owned `sourceAccountId`; savings allocations and existing commitments remain part of the calculation.

## Architecture

| Layer | Implementation |
| --- | --- |
| Interface | Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4 |
| Financial engine | Pure TypeScript calculations for forecasts, health, affordability, purchase baskets, plans, and pledge checks |
| Banking sandbox | Capital One Nessie data, synthetic account provisioning, and supported sandbox records |
| Application storage | MongoDB Atlas with the official `mongodb` driver |
| AI | NVIDIA Nemotron through NVIDIA's OpenAI-compatible endpoint; the `openai` package supplies the client |
| Purchase search | Optional SerpApi integration, with labeled demo results when a fallback is used |
| Verification | Vitest, TypeScript, ESLint, and the Next.js production build |
| Hosting | Vercel |

The browser calls Next.js route handlers. The server derives the viewer from the session cookie, loads permitted records, and uses the shared engine for financial decisions. API keys and the MongoDB connection stay on the server. MongoDB persists users, sessions, assessments, application purchases, goals, sharing settings, Huddles, and related plans and records.

```text
app/                    Pages, layouts, styles, and API route handlers
components/             Financial views, forms, and Huddle interactions
  wallet/               Folding wallet, card transitions, member ID, and login panel
lib/
  auth/                 Account validation, password hashing, and sessions
  engine/               Deterministic financial calculations and regression tests
  nessie/               Sandbox client, normalization, provisioning, and offline fixture
  db/                   Shared MongoDB connection and connection check
  services/             Financial pictures, saved assessments, social flows, and Huddles
  agent/                Nemotron tools, planning, comparisons, and saved answers
  purchase/             Purchase briefs, offer search, and offer handling
  reviewer/             Checks of agent output against data and rules
  types.ts              Shared application contracts
public/wallet/          Portable wallet images and brand assets
```

## Run locally

You need **Node.js 24.x or 26+**, npm, a MongoDB Atlas database, and a Nessie API key. NVIDIA and SerpApi keys enable their respective features.

```bash
git clone https://github.com/AfeIsm/HackUTD.git
cd HackUTD
npm ci
cp .env.example .env.local
```

Fill in `.env.local`, then start the app:

```bash
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)**. Create an account, choose a username, and let the app set up its synthetic Nessie finances. If setup is incomplete, the signed-in interface offers a setup action.

**The team's Nessie sandbox is already seeded. Do not run `npm run seed` again.** Existing demo accounts can be used with credentials supplied privately by the team. No demo password is published in this repository.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | Server-side Atlas connection string; required for accounts and persisted application state |
| `MONGODB_DB` | Application database name: `walletwhisperer` |
| `NESSIE_API_KEY` | Nessie sandbox key; required for live sandbox reads and new-account financial setup |
| `NESSIE_BASE_URL` | Nessie API base; defaults to `https://api.nessieisreal.com` |
| `USE_LOCAL_DATA` | Set to `false` for Nessie-backed operation; `true` uses the committed fixture for supported existing demo profiles |
| `NVIDIA_API_KEY` | Enables the Nemotron coach and model-backed workflows |
| `NEMOTRON_MODEL` | Optional model override; defaults to `nvidia/nemotron-3.5-lightning-30b-a3b` |
| `SERP_API_KEY` | Optional live purchase-option search |
| `DEMO_PASSWORD` | Used only by the team-maintained demo-user provisioning script; not needed for ordinary sign-up |

New account financial setup requires live Nessie access; fixture mode does not replace provisioning. Missing AI configuration is reported as unavailable rather than simulated success. Keep credentials in ignored local environment files and Vercel environment variables. Do not use a `NEXT_PUBLIC_` prefix for these secrets.

### Development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm test` | Run the Vitest suite |
| `npx tsc --noEmit` | Check TypeScript types |
| `npm run lint` | Run ESLint |
| `npm run build` | Generate the production build |
| `npm start` | Serve an existing production build |
| `npm run db:check` | Check Atlas connectivity using the local environment configuration |

Before reviewing a change, run the tests, type check, lint, and production build, then exercise the affected flows in the browser. Next.js can generate route types during a build; if generated route types are missing in a fresh checkout, build before repeating the type check.

## Deploy on Vercel

Import this repository as a **Next.js** project. The existing production project deploys from `main` to **[hack-utd.vercel.app](https://hack-utd.vercel.app)**.

1. Configure `MONGODB_URI`, `MONGODB_DB=walletwhisperer`, `NESSIE_API_KEY`, `NESSIE_BASE_URL`, and `USE_LOCAL_DATA=false` in the required **Production** and **Preview** scopes.
2. Add `NVIDIA_API_KEY` for the coach and `SERP_API_KEY` for live offer search. Add `NEMOTRON_MODEL` only when overriding the default.
3. Ensure Atlas database-user permissions and network access allow the deployed server to connect.
4. Deploy again after changing environment variables.
5. Check `/api/status`, then sign in, run a health check, and reload to confirm that real application state is saved and retrieved.

`GET /api/status` returns only dependency status, such as:

```json
{"ok":true,"mongodb":"connected","nessie":"connected"}
```

HTTP **200** means MongoDB and the configured Nessie check responded successfully. HTTP **503** reports a missing configuration, unavailable dependency, or fixture mode. This endpoint does not test NVIDIA or SerpApi; verify those through their application flows. A successful build alone does not prove runtime database connectivity.

## Demo boundaries

- **Synthetic finances:** demo assessments use the scenario date shown in the app, currently November 7, 2026. Provider data is not a live personal banking connection.
- **Sandbox contributions:** Nessie transfer records do not update account balances in the tested sandbox behavior. Wallet Whisperer stores the contribution debit in MongoDB and applies it over the banking picture; it attempts to save a Nessie record as a separate paper trail. This is not real payment settlement.
- **Offer estimates:** search results may omit taxes, fees, or availability. Demo fallbacks and retrieved timestamps are labeled; a proposal is not a booking or guaranteed price.
- **Consent for dependents:** dependents join through their own account and accepted username invitation. Creating a managed dependent without an account is unavailable.
- **Service availability:** live banking setup, AI responses, and live search depend on their configured providers. Offline snapshots and unavailable states are identified in the UI.

Wallet Whisperer is designed to make the decision understandable: where the money would come from, what it would affect, and what a group has actually agreed to share.
