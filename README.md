# Wallet Whisperer

**Can we afford it?**

Wallet Whisperer brings a person's financial picture into one place, evaluates upcoming obligations, and helps individuals and groups make spending decisions. With **Huddles**, family and friends plan a shared purchase while keeping their underlying finances private. (Throughout this document, "Huddle" refers to that group-purchase feature.)

Built for HackUTD 2026 with Capital One's Nessie banking sandbox, NVIDIA Nemotron, and MongoDB Atlas.

> **Project status.** Implemented: a Next.js App Router application with screens for My Money, purchase simulations, households, friends and Huddles; a pure financial engine with regression tests; Nessie seeding and normalization (the sandbox is seeded and pages read live Nessie data, with a committed offline fixture); and **MongoDB Atlas persistence for health-check history, app-added purchases and obligation tags**. Financial contracts use integer cents and exact owned source accounts. **In progress:** real user accounts (sign-up, log-in, sessions), adding friends and family by unique username, cross-device invitations, and Huddle state in MongoDB. Huddle workflow state still lives in browser memory until that ships. Planned: Nemotron tool execution, permission-enforced household sharing, separate yellow-pledge acknowledgement and provider-confirmed funding. Implemented screens are not evidence of completed integrations.

## The problem

An account balance does not explain whether someone can afford a purchase. Rent may fall before payday, savings may already belong to another goal, and an apparently affordable contribution may conflict with an existing commitment.

Group purchases add a social problem. Family members and friends need to agree on a budget and contributions, but sharing a trip should not require sharing everyone's balances, debts, transactions, or financial difficulties.

## Our solution

Huddle combines three connected experiences.

1. **Understand my money.** Bring accounts, spending, income, obligations, and savings goals into one view, with five explainable financial health indicators.
2. **Evaluate a decision.** Simulate a purchase from a specific account on a specific date. Explain its effect and, when possible, propose a verified adjustment.
3. **Decide together.** Collect private pledges, check each member's affordability, reveal approved contribution amounts, obtain agreement, and track approved mock contributions to a shared fund.

The calculation engine owns every financial number. Nemotron selects tools, compares simulated options, and explains the results. MongoDB Atlas stores application state, saved assessments, recommendations, permissions, and contribution records. Nessie supplies simulated banking records and supported sandbox transactions.

## Hackathon tracks

| Track | Huddle's contribution | Evidence in the demo |
| --- | --- | --- |
| PNC — 360° Financial Health Navigator | Consolidated money view, five indicators, dated forecasts, purchase simulations, and actionable explanations | Change an input and inspect the resulting forecast and recommendation |
| Capital One — Best Use of Nessie | Customer/account data, transaction history, bills, loans, merchants, sandbox account creation, and transfer records | Show data retrieved from Nessie and the provider record for a supported write |
| NVIDIA — Use Nemotron Beyond a Chatbot | A bounded agent workflow that retrieves context, calls calculation tools, evaluates options, and proposes a verified plan | Display actual tool calls, their results, and the selected plan |
| MLH — MongoDB Atlas, subject to entry eligibility | User accounts with unique-username and TTL session indexes, persisted health history, reusable plans, versioned Huddles, consent, and saved pledges | Log in on a second device and retrieve the correct saved state |

Track mapping follows the event's published sponsor prompts. Confirm the optional MLH entry name and eligibility before selecting it. [Official event tracks](https://zeroday.hackutd.co/)

## Product decisions

These decisions apply to the main implementation.

- **Risky pledges are the member's call.** A pledge the account can fund commits. If it would not keep the member green, they get a private warning naming the bill at stake, plus advice and a safer amount. Only money the account does not have, after that member's other pledges, and incomplete assessments block commitment.
- **Household finances are private until shared.** A spouse, dependent, or household role does not itself grant access to that person's financial records. Sharing requires an explicit, revocable grant.
- **Friends retain private financial views.** Group members receive only the information allowed by the Huddle's phase and sharing rules.
- **Real accounts, not a demo switcher.** Each person signs up and logs in on their own device; the server identifies the viewer from a session cookie and never trusts a member ID sent by the browser for private data. The demo uses seeded accounts with synthetic money, logged in on two devices. (This replaces the earlier one-laptop `Viewing as` selector.)
- **People are added by unique username.** Every account picks a username at sign-up. Usernames are case-insensitive and unique, enforced by a unique database index. Friends and family are added by typing an exact username and the other person accepts on their own device; there is no public directory and no phone or email lookup.
- **Every spending decision names an exact source account.** Store `sourceAccountId`. Checking/savings is a display label derived from that account.
- **Saved plans have a defined context.** Reuse a plan only while the financial inputs, assessment date, commitments, and relevant policy versions still match.
- **Locking saves promises; it does not move money.** A locked Huddle records what each person is willing to spend, and they keep control of their own money in case something comes up. If later spending puts a pledge at risk, that member is warned privately and the group learns only that a commitment is at risk. Each member can choose **Transfer now** to send their own amount.
- **Promises add up.** Each pledge is checked against current account money minus that member's pledges in their other live Huddles, as of today. Expected future income cannot make a pledge safe today.

## Build scope and order

Complete each stage through the deployed application before expanding the next one. Update feature status in this README as acceptance criteria pass.

| Priority | Scope | Completion checkpoint |
| --- | --- | --- |
| P0a | Seed data, My Money, account normalization, obligations, income detection, forecasts, deterministic health results, goals, source checks, saved state | Live or explicitly labeled fixture data drives a complete personal assessment |
| P0b | Nemotron fix plans and purchase simulations, verified outcomes, saved answers and observable tool activity | A member can ask about a purchase and inspect a reproducible answer |
| P1 | Core Huddle, one seeded friend, nonpaying members, private checks, yellow acknowledgement, reveal, approvals, reservations and funding records | A group completes the main purchase flow on the deployed URL |
| P1+ | User accounts (F7): sign-up, log-in, sessions, unique usernames, friend/household requests by username, Huddle state in MongoDB, cross-device invitations | Two people on two devices complete the Huddle flow with server-side privacy |
| P2 | Phone-based in-app invitations, shortfall coaching, declined proposals, fair-split suggestions and explicit household sharing controls | Members can revise a proposal without leaking private records or using stale approvals |
| P3 | Private alerts, a reviewer agent and probabilistic forecast experiments | Consider only after P0–P2 and submission preparation are complete |

The group alternative finder, disruption stress tests, and other ideas discussed after the original build plan remain future candidates. The core specification below adds the consistency rules needed for the existing product.

## Main features

### F1 — My Money

- Display checking, savings, credit-card balances, loans, recent transactions, and savings goals with their data source and last successful sync.
- Combine bills, loan obligations, and detected subscriptions into one editable obligations list. Essential/nonessential tags can be corrected by the user.
- Infer likely paychecks and recurring expenses from transaction patterns. Show the evidence, distinguish estimates from confirmed schedules, and allow correction of amount, cadence, and next date.
- Display a 30-day assessment and a 60-day cash-flow timeline. Keep source-account balances distinguishable.
- Allocate existing savings to named goals. An allocation earmarks part of an existing balance and is not additional money.
- Support a manual refresh and a health-check rerun. Poll for changes approximately every 30 seconds while the application is active, with backoff on failure and no overlapping sync for the same member.
- Show loading, empty, incomplete-data, stale-data, and provider-error states. A failed sync preserves the last valid snapshot and its timestamp.

**Acceptance criteria**

- The dashboard renders from normalized provider data and app-owned metadata.
- A bill represented by multiple sources appears once in the forecast.
- Switching identities loads that person's saved result without starting a new model call.
- Detection uncertainty can be resolved through a user correction.

### F2 — Explainable financial health

The health score is Huddle's prototype decision rubric. Nessie's loan `credit_score` field is a separate provider field and must have a separate label if displayed.

Each indicator returns green, yellow, red, or `needsInput`. Green earns 100 indicator points, yellow 50, and red 0. A missing input remains visible and blocks an affordability approval until resolved.

| Indicator | Weight | Measurement | Green | Yellow | Red |
| --- | --- | --- | --- | --- | --- |
| Essential bills covered | 40% | Lowest projected checking balance over 30 days, after scheduled expenses and existing commitments | At least $200 | At least $0 and below $200 | Below $0 |
| Safety cushion | 20% | Unallocated savings divided by monthly essential costs | At least 3 months | At least 1 and below 3 months | Below 1 month |
| Debt load | 15% | Scheduled loan payments plus card minimums divided by monthly income | Below 20% | 20% through 36% | Above 36% |
| Savings protection | 15% | Unallocated savings used for spending within the assessment's 30-day lookback and applicable proposed changes | No usage | Above 0% and below 10% of the defined savings baseline | At least 10% |
| Nonessential subscriptions | 10% | Monthly nonessential subscription cost divided by monthly income | Below 5% | 5% through 10% | Above 10% |

`score = sum(indicatorPoints × indicatorWeight)`

- Use the unrounded score for status. Green is at least 75, yellow is at least 50 and below 75, and red is below 50. Display up to one decimal place.
- A red essential-bills result makes the overall result red regardless of the weighted score. Show both the numerical score and the overriding reason.
- Forecast all currently scheduled outflows. A recommendation to cancel a subscription changes a simulated scenario only after that change is explicitly included.
- Define each denominator and lookback in the engine. Missing income and a zero denominator need explicit handling, rather than a fabricated favorable ratio. Confirmed zero debt can be treated as zero debt burden.
- Spending from earmarked savings consumes the matching goal allocation. Spending from unallocated savings flags emergency-cushion usage and recalculates the affected indicators. Crossing a threshold determines the status change.

**Automatic assessment triggers**

Run after seeding/linking a demo customer, a confirmed application mutation, a newly observed provider transaction, an obligation/goal edit, a reservation change, or a manual rerun. Coalesce concurrent requests and rate-limit duplicate refreshes per member.

Save an assessment with its input fingerprint, effective date, policy version, trigger, result and provenance. Append history for meaningful changes or an explicit rerun. Plain polling and identity switching should reuse unchanged results.

When the assessment is yellow or red, Nemotron can propose a fix plan. Each proposed improvement must be simulated by the engine before Huddle shows its score, amount, or readiness date. If no feasible plan is found within the search horizon, say so and retain the verified partial result.

### F3 — Can I buy this?

Accept a name, amount, purchase date, exact source account and optional matching savings goal.

Return one of three outcomes.

- **Yes** when the proposed purchase passes the configured checks and leaves a green assessment.
- **Yes, if…** when a specific engine-verified adjustment makes it feasible, such as a later date, lower amount or confirmed spending change.
- **Not right now** when it fails the checks or required information is missing.

Show before/after indicators, the lowest balance and its date, emergency-savings effects, assumptions, and an explanation linked to the calculation result. Include all existing commitments. A hypothetical comparison has no effect on the banking records.

The same question in the same assessment context loads the stored answer. Canonicalize the amount, date, source account, goal and proposed changes when constructing its cache key.

### F4 — Huddles for shared purchases

Create a Huddle with a name, total cost, target date, members and a paying/nonpaying flag. Nonpaying participants can join without entering the affordability workflow.

Members are added by unique username (F7). The invited person sees the request on their own device and must accept before joining; only accepted friends and household members can be added to a Huddle.

| Phase | What happens | What other members can see |
| --- | --- | --- |
| Pledging | Each payer enters an amount and source account and receives a private assessment | Aggregate committed count and neutral progress |
| Yellow acknowledgement | A payer with a yellow result privately confirms the specific trade-off | The aggregate progress update after commitment |
| Revealed | All paying members have valid commitments for the current proposal | Each committed amount and total/shortfall |
| Agreeing | Every payer approves the revealed contribution plan | Approved amounts and agreement progress |
| Locked | All payers approved the same plan version and final checks pass | The locked plan and each promised amount |
| Cancelled | The group cancels an unfunded proposal | Cancellation status |

Private source accounts, balances, health results, capacity calculations, and coaching remain private unless separately shared with the viewer. Reveal discloses agreed contribution amounts.

**Commitment rules**

- Check the proposed pledge alongside that member's other active reservations. Replace the member's prior reservation for this Huddle when re-evaluating a revision.
- Build the assessment context with the candidate commitment included exactly once. Persist its reservation and assessment against the resulting ledger version so the initial reservation does not invalidate its own approval. A later change to another commitment requires a fresh check.
- Green commits directly. Anything else the account can fund commits with a private warning. `needsInput` and amounts beyond the member's available money cannot commit.
- Record the approved amount, account, assessment fingerprint, proposal version and any warning shown.
- A change to cost, target date, payer list, amounts or source accounts creates a new proposal version and invalidates affected assessments and all prior group agreements.
- Re-check every pledge against current data after each health check, even after lock. A pledge that stops fitting is flagged and stays in place until the member or group acts.
- Allow at most three completed proposal rounds before the creator chooses a lower total, a new date or cancellation of an unfunded proposal.

**Shortfalls and declines — P2**

- A short Huddle offers private, optional coaching. Suggested extra contributions must pass the same checks.
- The creator may revise the total or date. Members review the revised proposal.
- Decline reasons are change my amount, split feels unfair, total/date does not work, and leave the Huddle. Share only the reason the member elects to disclose.
- Fair-split calculations use the members' permitted private capacities inside the trusted service. Return proposed amounts to the group, and let each member accept or retain their own amount. Keep personal explanations in individual coaching contexts.
- A leaving member's promise is released. No money has moved, so there is nothing to refund.

### F5 — Saved promises, not transfers

When all paying members agree, the Huddle locks and each person's amount is saved as a promise. Locking moves no money, deliberately: people keep control of their own money if something comes up. Money moves only when a member presses **Transfer now** and confirms the exact amount and account.

- Members can keep spending. Every health check re-tests their pledges, including on locked Huddles.
- If spending makes a pledge unaffordable, that member gets a private warning and a Nemotron plan to keep it. The group sees only that a commitment is at risk, never whose or why.
- A member who pledged despite a warning has already been told the risk, so that pledge is flagged only if the money is gone.
- A member's pledges add up across Huddles. Their other live promises are subtracted from what a new pledge can use, in private checks only.
- **Transfer now** lowers that member's balance everywhere the app uses it: My Money, the health score, the forecast and later pledge checks. The Huddle shows who has transferred and the running total, and can no longer be left or deleted.
- Nessie is a sandbox with a limitation we tested against the live API: a balance can only be set when an account is created. Transfers, withdrawals and deposits write a record without changing it, and account updates ignore a new balance. So the balance change is stored in MongoDB and applied over the Nessie data, and Nessie receives a transfer record as the paper trail.
- A production version connected to real banks would add per-transfer authorization, a licensed payment partner to hold pooled funds, refunds when one payment fails, and a live balance check right before charging.

Nessie requests and database writes do not form one atomic transaction. This workflow must represent partial progress and recover from interrupted requests.

### F6 — Privacy, saved results and basic reliability

These are core implementation requirements supporting F1–F5.

- Apply viewer-aware projections on the server, including object access and exact account ownership checks.
- Require explicit, revocable household sharing. Define the granted scope before returning data. The default financial-view grant covers balances, obligations and assessments; personal coach conversations stay private unless separately shared.
- Keep aggregate group progress separate from personal failures. Small groups can still infer information from progress, so describe precisely which records and amounts are disclosed.
- Cache results using normalized data, the effective assessment date/timezone, policy/engine versions, goals, corrections and active commitments. Keep a cached narrative paired with its original verified numerical result.
- Reject a late assessment or agent response when its input version is no longer current. An older request finishing last must not replace a newer assessment.
- Use integer cents internally, explicit transaction-status mapping, stable identifiers and predictable date handling.
- Display live, stale and fixture data modes. Preserve provider errors as errors rather than silently presenting fixture data as live.

### F7 — Accounts, usernames and cross-device invitations

Each person has their own account and uses Wallet Whisperer on their own device.

- **Sign up** with name, username, email and password; **log in** with username or email. Sessions last seven days.
- **Unique usernames.** 3–20 characters (letters, numbers, `_`, `.`), case-insensitive, displayed as `@username`. A unique index on the lowercased username makes the database reject duplicates, including simultaneous sign-ups. The sign-up form checks availability while typing.
- **Adding people by username.** Friend requests, household invitations (with a spouse/dependent role) and Huddle invitations name an exact username. The recipient accepts on their own device. There is no browsable user list.
- **Cross-device updates.** Pending requests and Huddle changes refresh by polling and on window focus.
- **Saved per account.** Health history, purchases, tags, goals, Huddles and requests are stored in MongoDB against the account.
- **Security model.** Passwords are hashed with Node's `crypto.scrypt` and a per-user salt. The session is a random token in an httpOnly, Secure, SameSite=Lax cookie; MongoDB stores only its hash, with a TTL index that removes expired sessions automatically. Route protection uses Next.js 16 `proxy.ts`. This is demo-grade security, not bank-grade.
- **New accounts get their own sandbox money.** Sign-up creates a Nessie customer with starter checking and savings accounts. Seeded demo accounts (`alex`, `jordan`, `maya`, `sam`) link to the existing seeded Nessie customers.

### Later work — P3

Private score-drop and commitment-risk alerts, an independent recommendation reviewer, and probabilistic forecasts remain optional. Reuse verified results for alerts. Report a probability only after defining and validating the underlying assumptions. Additional group optimization and scenario stress tests can be assessed after the core implementation is working.

## Nessie API investigation

Documentation inspected on **7 November 2026**. The current interactive docs configure `https://prod-api.nessieisreal.com` as their server and use a `key` query parameter. Keep the base URL configurable and confirm it with the event key. Use server-side requests and redact keys from logs. [Current documentation](https://nessieisreal.com/docs#authentication)

### Available resources and Huddle mapping

The paths below are documentation findings. Endpoint and payload behavior still require an authenticated integration check.

| Resource | Relevant documented operations | Huddle usage |
| --- | --- | --- |
| Customers | `GET/POST /customers`, `GET/PUT /customers/{id}`, `GET /accounts/{id}/customer` | Seeded identities and ownership mapping |
| Accounts | `GET/POST /customers/{id}/accounts`, `GET /accounts/{id}`, `PUT /accounts/{id}` | Checking, savings and credit-card balances |
| Deposits | `GET/POST /accounts/{id}/deposits`, `GET /deposits/{id}` | Income history and payroll-like seed records |
| Withdrawals | `GET/POST /accounts/{id}/withdrawals`, `GET /withdrawal/{withdrawal_id}` | Cash outflows and a documented fallback for sandbox expense events |
| Bills | `GET /customers/{id}/bills`, `GET/POST /accounts/{id}/bills`, `GET/PUT /bills/{billId}` | Scheduled and recurring obligations |
| Loans | `GET/POST /accounts/{id}/loans`, `GET/PUT /loans/{id}` | Loan obligations and monthly payments |
| Merchants | `GET/POST /merchants`, `GET/PUT /merchants/{id}` | Spending categories and seed merchants |
| Purchases | `GET/PUT/DELETE /purchase/{purchase_id}` in the current reference | Merchant-based history where list/create operations are confirmed |
| Transfers | `GET/PUT/DELETE /transfers/{transfer_id}` in the reference; `POST /accounts/{id}/transfers` in Quick Start | Paper-trail records for Transfer now and approved savings moves. Nessie transfers have no recipient and do not change balances |
| ATMs and branches | Directory lookups | Available resources outside the core workflow |
| Enterprise | Customer, deposit and withdrawal lookups | Broad resource access that does not replace Huddle's per-member filtering |

[Nessie resources and Quick Start](https://nessieisreal.com/docs)

### Documentation gaps to resolve first

The current reference omits account-level purchase list/create and transfer list/create entries from its resource operation lists. Quick Start explicitly shows transfer creation. The official older JavaScript SDK contains `GET/POST /accounts/{id}/purchases` and an account-level transfer listing, but its transfer creation helper appears to call `/withdrawals`.

Implement a small REST adapter using the verified provider contract. Treat the older SDK as historical evidence. Confirm purchase list/create, transfer list/create, accepted payloads, status behavior and balance effects with the event key before claiming those paths work. Store capability-check results for the team. [Official purchase SDK source](https://github.com/nessieisreal/nessie-javascript-sdk/blob/master/lib/purchase.js), [official transfer SDK source](https://github.com/nessieisreal/nessie-javascript-sdk/blob/master/lib/transfer.js), [current Quick Start](https://nessieisreal.com/docs#quick-start)

### Normalize the provider records

- Current transaction examples use `transaction_date`; older purchase examples use `purchase_date`. The adapter must normalize the contract actually returned by the selected service.
- Account records associate one `customer_id`. Huddle's household, permissions, invites and shared goals belong in Atlas.
- Merchant categories are shown as an array in the current example despite a string label in the field table. Normalize string/array variants and preserve unknown categories for correction.
- Bills include recurrence and upcoming-payment fields. Preserve provider identifiers to reconcile detected subscriptions with bill records.
- Loans expose `monthly_payment`, amount and status. Loan due dates and outstanding principal may require app metadata or confirmation. Do not infer either from a field with a different meaning.
- The account example does not establish a card limit, minimum payment or APR. Store explicit synthetic/user-confirmed metadata for required missing fields.
- Monetary fields vary between integer and float descriptions. Establish provider units and convert at the adapter boundary. Keep calculations in cents.
- Check whether pending transactions have already affected balances. Include an obligation or transfer in the forecast only once.
- A successful connection may have existing data. Seed only Huddle-owned records, reuse their stored provider IDs, and scope any reset to those records.

The docs expose banking records and transactions. Huddle implements paycheck inference, subscription detection, financial scoring, forecasts, consent, group membership, reservations and coaching itself. [Nessie documentation](https://nessieisreal.com/docs)

### Initial integration check

1. Obtain the event API key and confirm the configured service address.
2. Create or reuse Huddle-owned synthetic customers and source accounts.
3. Verify a deposit, account retrieval, bill and loan operation, including accepted fields.
4. Verify supported purchase history and creation operations. Where needed, use clearly labeled synthetic history and documented withdrawal events while resolving the missing capability.
5. Verify that a mock transfer record can be created and retrieved. Creating one does not change an account balance.
6. Record response shape, timestamps, monetary units and observed balance/status semantics.
7. Save normalized fixtures so UI and engine work can continue independently.

No participant key was available during this documentation research. Live provider writes, key permissions and settlement behavior remain integration checkpoints.

## Nemotron capability and integration plan

Nemotron is a family of models. Huddle needs text understanding, instruction following, tool selection, structured arguments and concise explanations across several tool steps. The application implements scheduling, tool execution, authorization, persistence and the numerical engine.

As of 7 November 2026, NVIDIA's **Nemotron 3.5 Lightning 30B A3B** page advertises a free prototype endpoint, streaming, and a model intended for agent workflows. Its model card describes training for tool use and structured outputs. Use `nvidia/nemotron-3.5-lightning-30b-a3b` as the initial configurable candidate and confirm tool calling with the event key. The published example uses the NVIDIA base URL and model-specific sampling settings. [Model endpoint and example](https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b), [model card](https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b/modelcard)

The Nemotron 3 Super page currently marks its free endpoint as deprecated. Choose a model using its current availability and the team's successful tool-call check. Keep provider/model selection configurable. [Nemotron 3 Super availability](https://build.nvidia.com/nvidia/nemotron-3-super-120b-a12b)

### Agent workflow

1. Bind the request to the viewer, permitted member/Huddle scope, current data version and requested task.
2. Supply a small tool catalog with validated argument schemas.
3. Let Nemotron request relevant context and simulations.
4. Validate each request, execute an allowlisted tool on the server, and return a compact result with its ID and input version.
5. Let the model compare verified candidates and propose a plan.
6. Validate the final structured plan and recompute the selected candidate before saving it.
7. Stream application-authored activity events and the verified final answer to the permitted viewer.

| Tool | Responsibility |
| --- | --- |
| `get_picture` | Return the permitted member's normalized financial context |
| `get_health` | Retrieve a matching saved assessment or request a current calculation |
| `get_spending_by_category` | Return engine-calculated totals for a defined interval |
| `simulate` | Evaluate identified changes through the deterministic engine |
| `can_afford` | Evaluate a purchase using a date and exact account |
| `get_capacity` | Calculate the permitted member's available commitment under policy |
| `suggest_split` | Return allowed proposed amounts from the trusted group service |
| `propose_plan` | Return a candidate tied to simulation result IDs for validation and storage |

Tools derive authorization from the server request context. A model-supplied member/account ID must pass that context's ownership and permission checks. Group agents receive approved group projections; private coaching uses separate member-scoped context.

### Operating constraints

- Start with one agent and a small tool loop. Additional reviewers remain P3.
- Cap tool executions at eight per run and give the run a configurable 30-second initial deadline. Tune model output/reasoning budgets and request limits to the actual hosted model and deployment.
- Use the selected model's current recommended sampling settings. Temperature zero does not establish the saved-result guarantee; persistence and input versioning do.
- Treat structured output as untrusted until parsed and validated. Reject unknown tools, malformed arguments and references to nonexistent simulation results.
- Show actual tool activity, timing and result summaries. Keep private financial context and raw model reasoning out of shared activity views.
- On timeout or rate limiting, return verified partial results, retain a labeled previous plan if available, and offer an explicit retry.
- Recommendation tools return proposed actions. User-confirmed application routes perform any approved savings move.
- A request to reduce a subscription records a proposed/app-tracked budget change. Its simulated saving becomes an actual observed saving only when supported by updated records.

The NVIDIA hosted API uses a chat-completions endpoint. Actual tool support and request options depend on the chosen model/service. [NVIDIA API reference](https://docs.api.nvidia.com/nim/reference/llm-apis)

## Calculation and data rules

The pure engine must define these behaviors before UI labels or agent prompts depend on them.

- **Reference clock.** Pass an explicit `asOfDate` and timezone into the engine. Use `America/Chicago` for the demo and a controlled clock for reproducible seed cases.
- **Calendars.** Distinguish biweekly, semimonthly and monthly schedules. Specify end-of-month behavior for dates such as the 31st.
- **Forward forecast.** Start from a confirmed balance at its reference time and add future changes. Historical transactions inform detection and analysis; replaying them into the same current balance would double-count them.
- **Credit accounts.** Treat owed credit-card balances as liabilities. A card purchase changes liability and future payment obligations; card repayment from checking must be reconciled with the related obligation.
- **Deduplication.** Link recurring purchases, bills and loan-payment records that describe the same obligation. Preserve provenance and user overrides.
- **Internal transfers.** Track both account effects while retaining one transfer identity. Moving checking money to savings does not create income.
- **Goals and commitments.** Earmarks and reservations describe existing funds. Replace a goal allocation with its matching commitment reservation as appropriate so the same protected amount is not subtracted twice.
- **Feasibility.** Check the exact source account, dated obligations and active commitments. An aggregate score does not authorize an outflow from an insufficient source account.
- **Saved results.** Sort/canonicalize normalized inputs before hashing. Include effective date, versions, reservations and corrections. Persist a single accepted plan per member/context key and reject stale concurrent results.
- **Unknown inputs.** Surface missing data with an actionable correction. Return an incomplete assessment instead of guessing financial facts.

## Architecture

| Layer | Planned choice | Responsibility |
| --- | --- | --- |
| Language | TypeScript | Shared types across UI, routes, engine and agent |
| UI | Next.js App Router, React, Tailwind CSS | Dashboard, simulations and group interactions |
| Application backend | Next.js route handlers | Viewer context, validation, services and streaming |
| Money provider | Nessie REST adapter | Contract normalization and sandbox operations |
| App database | MongoDB Atlas with official Node driver | Consent, metadata, assessments, plans and workflow state |
| AI client | `openai` package configured for NVIDIA's compatible API | Nemotron calls and tool messages |
| Tests | Vitest for engine and workflow regressions | Deterministic calculations, state transitions and permission projections |
| Hosting | Vercel | Early deployed integration environment |

```text
Browser
  -> Next.js routes and viewer context
     -> application services
        -> pure financial engine
        -> Nessie adapter
        -> MongoDB Atlas
     -> Nemotron loop
        -> allowlisted application tools
           -> the same application services and engine
```

Suggested ownership boundaries follow the original team plan.

```text
app/                     pages and route handlers
components/              UI components, including AgentActivity
lib/types.ts             shared normalized types and workflow contracts
lib/engine/              detection, obligations, forecasts, scoring and splits
lib/services/            health, consent, Huddle and funding orchestration
lib/nessie/              provider client, adapter, seed support and fixtures
lib/db/                  cached MongoClient, queries and indexes
lib/agent/               model client, tool schemas, loop and prompts
```

`lib/engine/` accepts input and returns results without network or database calls. Route handlers and agent tools use the same services. Cache the Mongo client per runtime instance and keep deployment connection handling explicit.

## Implemented financial contract (local prototype)

- All normalized monetary fields (`balance`, `amount`, `monthlyPayment`, `avgAmount`, limits and allocations) are safe integer **cents**. Nessie dollar values and dollar form input are converted at the boundary; display formatting converts cents back to dollars.
- Every account has an `ownerMemberId`. Monetary scenarios and pledges require `sourceAccountId`; obligations, goals and paychecks require `accountId`. Credit cards remain liabilities and are not accepted as cash source accounts.
- Forecasts retain one series per account. Aggregate charts are informational; a well-funded second account cannot cover a shortfall in the selected account without an explicit transfer. Every scheduled outflow and reservation is included in health coverage.
- A matching goal purchase consumes that goal allocation and debits savings once. Internal saving transfers require a separate destination account; a goal purchase never credits the same money back to savings. Recorded purchases retain the exact amount covered by an earmark, so any excess still counts as unallocated-savings spending.
- Missing income, card payment metadata, account links, invalid amounts or overallocated goals produce actionable `missingInputs` and an incomplete score (`null`). Required indicator inputs use `needsInput`; known essential-bill failure still overrides the overall result to red.
- Synthetic card limits, minimum payments, repayment accounts and due dates are explicit demo metadata in `lib/people.ts`. They apply only to their named seeded account IDs. If reseeding changes IDs, update this metadata rather than guessing an account or a minimum.
- Savings-protection usage uses a fixed pre-scenario baseline: current savings plus unallocated savings withdrawals in the preceding 30 days. A matching goal spend does not count as emergency-cushion use. The configured status thresholds determine its effect.
- Monthly forecasts preserve the original day through short months. Semi-monthly income uses two calendar days, distinct from a 14-day biweekly schedule; ambiguous day patterns require confirmation. Pending or unknown transaction settlement is surfaced as incomplete input rather than replayed into a confirmed balance.
- “Yes” requires a complete green result and sufficient money in the exact source account. “Yes, if…” is shown only for a recomputed same-account payday alternative. The prototype supports a bounded forecast of at most 365 days and does not claim unverified long-term savings plans.
- Pledge checks evaluate immediate funding, including existing reservations, rather than counting future pay before the event. A pledge that isn't safe commits with a private warning. A locked plan saves promises and does not transfer money.

## Persistent state

Store external provider IDs alongside Huddle-owned identifiers. Keep secret credentials outside stored user-facing records.

| Collection | Core contents |
| --- | --- |
| `users` | Account: unique `usernameLower`, unique email, name, password hash + salt, linked member and Nessie customer |
| `sessions` | Hashed session token, user, expiry (TTL index deletes expired sessions) |
| `friendRequests` | Friend, household or Huddle request by username: sender, recipient, kind, role and status |
| `members`, `households` | Household relationship and Nessie customer mapping |
| `sharingGrants` | Grantor, grantee, explicit scope and revocation state |
| `accountMetadata` | Confirmed supplementary fields such as card limit or loan due date |
| `obligationOverrides` | Classification, correction and source-linking decisions |
| `savingsGoals` | Account-linked earmarks and matching Huddle references |
| `healthSnapshots` | **Implemented.** Member, data fingerprint, score, status, indicators, flags, trigger and time (score history) |
| `appPurchases`, `obligationTags` | **Implemented.** Purchases added in the app (cents, exact source account, optional goal) and essential/non-essential overrides |
| `fixPlans`, `affordAnswers` | Verified outputs keyed by member/context and canonical question |
| `friendInvites` | In-app invite, target member, Huddle and acceptance state |
| `huddles` | Cost/date, proposal version, phase, members, private assessments and approvals |
| `reservationLedgers` | Per-member active commitments and conditional version for concurrent updates |
| `contributions` | Unique operation key, source/fund IDs, amount, provider ID and reconciliation state |
| `agentRuns`, `alerts` | Scoped tool receipts, final-result references and optional private alerts |

Use unique indexes for accepted plan/context keys, member/question/context keys, and contribution operation keys. Use conditional version checks for workflow edits and a per-member atomic reservation update to prevent concurrent Huddles from reserving the same capacity. Embedded Huddle members make a single-document phase change atomic; cross-document and provider operations still need explicit workflow coordination.

## Interface contract for the team

The lead owns `lib/types.ts`. Before parallel feature work, agree on these normalized entities.

- `Account` with `accountId`, `ownerMemberId`, `type`, `balanceCents`, `balanceAsOf` and optional confirmed supplementary metadata.
- `Transaction` with provider/source identifiers, exact account, kind, date, status, amount in cents and normalized merchant categories.
- `Obligation` with source provenance, account, amount, next date, cadence, classification and linked source IDs.
- `AssessmentContext` with member, effective date/timezone, input fingerprint and policy/engine versions.
- `HealthResult` with numerical score, overridden overall status, indicator results, forecast and missing inputs.
- `Plan` with proposed changes, referenced simulation results, verified outcome and context key.
- `HuddleView` with allowed group fields plus a separate viewer-only private section.
- `PledgeApproval` with exact amount/account, proposal version, assessment context and yellow acknowledgement.
- `Contribution` with stable operation key and provider reconciliation state.

Expose the original planned route families for health, sync, transactions, obligations, goals, members, invitations, Huddles, pledges, agreements and agent actions. Add consent and funding-status/reconciliation routes where required. Finalize request/response contracts before implementing each route. Keep all amounts unambiguous and bind every mutation to the current version.

## Demo data and story

Seed synthetic records for Alex, Jordan, Maya, Leo and Sam. Keep names human-readable inside Huddle and store the actual Nessie IDs separately.

| Member | Intended scenario |
| --- | --- |
| Alex | Tight cash timing, recurring obligations, earmarked savings and a purchase that changes an assessment |
| Jordan | Healthier cash position and a different comfortable contribution |
| Maya | Part-time income and a small savings goal |
| Leo | Nonpaying participant |
| Sam | Friend whose financial records remain private from the group |

Create approximately 60 days of synthetic history with realistic payroll cadence and spending categories. Choose dates relative to the controlled assessment clock. Derive displayed scores and readiness dates from the actual fixtures and engine; keep expected values in meaningful regression tests.

The main demonstration uses two devices, for example a laptop logged in as `alex` and a phone logged in as `sam`. It shows personal assessment, one purchase simulation, a Huddle invitation sent by username that appears on the other device, private pledges, a private warning on a risky pledge, reveal on both screens, a cheaper alternative the whole group votes on if they come up short, agreement, and a lock that saves everyone's promise without moving money. Logging out and back in shows saved-result consistency. A separate private view demonstrates household sharing only after consent.

## Local setup contract

### Automatic sandbox onboarding

The signed-in logo returns to My Money, and visiting `/` with a valid session redirects there.
Login cookies last for the browser session; explicit logout invalidates the server record.
`/api/auth/me` also converts older persistent cookies on the next page load. The server retains
the seven-day expiry cap. Browser session-restore settings can restore session cookies.

Every Huddle detail page provides **Leave huddle** and an owner-only **Delete huddle for everyone**.
Leaving removes the member, clears remaining approvals and fair-split suggestions, and transfers
ownership to another account holder when necessary. At one or fewer remaining participants,
the Huddle is deleted; groups require at least two people at creation. Pending invitees count as
participants. Declining the final invite applies the same cleanup. Deletions use version checks
and disappear from other windows through the five-second poll. Locked Huddles
only save promises, so this removal flow has no money to refund. Once any member has pressed
Transfer now, the Huddle can no longer be left or deleted.

New sign-ups read one of our seeded synthetic customers through the live Nessie API and
randomly vary its checking/savings balances, regular payroll, bills, subscriptions and available
loan payment data. The resulting records are created under the new user's own Nessie customer.
Managed dependents use the smaller dependent template. MongoDB stores provider IDs and step receipts
in `members`, normalized integer-cent banking data in `financialPictures`, and computed results
in `healthSnapshots`. This uses the existing November 7, 2026 demo clock. These are synthetic
finances, not a connection to the user's real bank. No new dependencies are needed.

Every household member now joins by username invitation and accepts on their own account.
Spouses and dependents use the same acceptance flow. Pending and declined invitations grant
no membership or financial visibility. Direct creation of no-login household members is disabled;
old managed records are retained in storage but are not automatically household members.
Test separate logins using incognito, browser profiles or two devices.

My Money has a **Randomize demo finances** button (`POST /api/demo/randomize`). It creates a new
account pair for the signed-in user, reads the records back from Nessie, updates MongoDB and
reruns the engine. Each completed adult reroll chooses a different template and fresh random
amounts. Request IDs prevent retrying the same completed request from creating another profile;
failed generations resume their saved profile and receipts. Only the new account pair participates
in bank refreshes and forecasts; previous Nessie records and `demoGenerations` receipts are retained.
Previous purchases, tags and goals remain tied to their old accounts and are not replayed onto
the new scenario. Score history remains available. Non-cancelled Huddles block rerolling to
preserve existing pledges and agreements. No shared seed or other user's records are modified.

Configure `MONGODB_URI`, `MONGODB_DB=walletwhisperer`, `NESSIE_API_KEY`, `USE_LOCAL_DATA=false`
and the event-verified `NESSIE_BASE_URL` locally and on Vercel. Confirm the create/read endpoints
against your team's key. Deployments must support the onboarding routes' configured 120-second
maximum duration. Never rerun the shared seed script.

Signup waits for setup. On failure, the login still exists and the welcome screen offers a
retry (`POST /api/auth/setup`). `GET /api/auth/setup` reports status. Provider writes are saved
step by step. A timed-out write retains `members.inFlight`: inspect Nessie and reconcile before
retrying. If the record exists, save its ID under `members.steps[stepName]` and clear `inFlight`.
Only clear it without an ID after establishing that no record was created. A terminated worker's
lock expires after three minutes. Never blindly repeat ambiguous writes.

New members refresh their MongoDB bank cache on reads after 30 seconds. Failed syncs retain
the last valid picture and mark it stale/incomplete, blocking affordability approval. App-added
purchases and obligation overrides remain separate and are applied over the bank snapshot.

Household sharing is controlled by six switches on the Household page: balances, income,
bills/loans, goals, recent transactions and health score. Every switch defaults off. Each member
controls only their own choices, including when the viewer is the household owner. Settings are
saved in `householdSharing`, keyed by household owner and grantor, and apply to accepted members
of that household. Changes refresh on other active windows approximately every five seconds and
on focus. A failed refresh clears displayed shared data.

`GET /api/household` returns explicit category projections, never a full financial picture.
Health-only sharing returns score/status without indicators, financial ratios, flags or forecasts.
Recent transactions are limited to twenty. Household totals are not computed from hidden data.
`PATCH /api/household {scope, enabled}` derives the grantor from the session and updates one switch.
`/api/picture` remains self-only; legacy broad `sharingGrants` cannot bypass the switches. Your
own household card always shows your own data without changing what you share with others.

The application scaffold and scripts now exist. Install dependencies and start the app with `npm install` and `npm run dev`. The seed script supports the synthetic demo data; review its mode and provider configuration before running it. The sequence below includes seeding:

```bash
git clone https://github.com/AfeIsm/HackUTD.git
cd HackUTD
npm install
cp .env.example .env.local   # then fill in the keys from the team
npm run db:check             # optional: confirms MongoDB works
npm run dev
```

Planned environment variables use server-side secrets.

```dotenv
NESSIE_API_KEY=
NESSIE_BASE_URL=https://prod-api.nessieisreal.com
NVIDIA_API_KEY=
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b
MONGODB_URI=
MONGODB_DB=walletwhisperer
USE_LOCAL_DATA=false
```

The team's Nessie sandbox is already seeded and `lib/nessie/local.json` is committed, so teammates do not need to run `npm run seed` (it refuses to run twice with the same key). Use `npm run db:check` to verify the MongoDB connection without printing the connection string.

The scaffold includes `.env.example`; keep secret placeholders blank. Keep actual values in `.env.local` and the hosting environment. Configure Atlas connectivity for the deployed app using the deployment's documented network-access options.

Current scripts provide development, production build, start, seed, tests and lint. Run `npx tsc --noEmit` for the type check. Pin package versions in the npm lockfile. Confirm service access and event credit limits with the team's own accounts.

In fixture mode, show a visible data-mode badge and track simulated writes locally. Explicitly choose the mode at startup. Restore live mode and demonstrate a real supported Nessie operation before claiming live-provider integration in the entry.

## Collaboration and AI implementation context

| Owner | Main responsibility | Completion evidence |
| --- | --- | --- |
| Sagar / lead | Shared types, pure engine, health service and integration review | Numerical cases and state changes are explainable and reproducible |
| Backend | Nessie, Atlas, non-agent routes, consent, Huddle state and funding | Normalized records, allowed projections and recoverable writes work on the deployment |
| Feature / agent | NVIDIA client, scoped tools, validated plans and streaming | A real tool workflow produces an engine-verified saved plan |
| Frontend | Pages, components, all data states, demo assets and submission | The complete user journey works with live services and labeled fallbacks |

- Read this README before coding. Implement P0 through P1 first and retain P2/P3 as the stated later priorities.
- Coordinate shared contracts and dependency additions with the team. Prefer the existing stack and shared services.
- Work in small branches and changes. Merge working increments frequently and show the complete app every hour.
- Use genuine provider responses to establish contracts. Keep unresolved endpoint behavior explicitly marked until tested.
- Tie agent claims to tool results and apply the same validation to UI and model-originated requests.
- Add focused regression cases for calculations, stale approvals, disclosure rules, overlapping reservations and interrupted funding. These protect the core behavior.
- Label planned features accurately in screenshots, README status and Devpost. Update this specification when the team changes a product rule.

## Core completion checklist

- [ ] Verify the event Nessie base URL, key and required endpoint behavior.
- [ ] Verify the configured Nemotron model can request a tool, receive its result and complete a response.
- [ ] Seed/reuse only Huddle-owned synthetic provider records and save normalized fixtures.
- [ ] Show accounts, obligations, income and goals with understandable provenance.
- [ ] Test duplicate obligations, current-balance forecasting, missing data and account-specific affordability.
- [ ] Save matching assessments and verified plans, including date/version-aware cache invalidation.
- [ ] Simulate a purchase without executing it.
- [ ] Sign up, log in and log out; reject duplicate usernames; derive the viewer from the session on every route.
- [ ] Add friends and household members by username, accepted on the other person's device.
- [ ] Enforce explicit household sharing and correct private/group projections.
- [ ] Allow yellow pledges only after acknowledgement, and invalidate stale agreements.
- [ ] Prevent overlapping Huddles from overcommitting the same money.
- [ ] Complete core pledge, reveal, agree and lock on the deployed application.
- [ ] Reconcile contributions, repeated clicks, an ambiguous write and partial failure.
- [ ] Demonstrate actual Nemotron tool activity and a supported live Nessie operation.
- [ ] Publish the code, complete both required submissions, record the demo and rehearse.

## Event checkpoints

All times are Central, using the team's original build targets.

| Checkpoint | Target |
| --- | --- |
| Initial Devpost team submission | Saturday, 7 November, 11 p.m. |
| Internal feature freeze | Sunday, 8 November, 8 a.m. |
| Internal final submission | Sunday, 8 November, 11:30 a.m. |
| Official final deadline | Sunday, 8 November, noon |
| Judging | Sunday, 8 November, 1–4 p.m. |

Adjust implementation milestones to current progress while preserving submission and demo time. Confirm event changes through the organizers' announcements. [Official schedule](https://zeroday.hackutd.co/)

## Research references

API/model research was performed on 7 November 2026. Documentation findings establish an integration plan; participant-key behavior still needs the checks listed above.

- [Nessie current documentation, schemas and Quick Start](https://nessieisreal.com/docs)
- [Nessie official SDK source](https://github.com/nessieisreal/nessie-javascript-sdk)
- [Nessie official purchase helper](https://github.com/nessieisreal/nessie-javascript-sdk/blob/master/lib/purchase.js)
- [Nessie official transfer helper](https://github.com/nessieisreal/nessie-javascript-sdk/blob/master/lib/transfer.js)
- [Nemotron 3.5 Lightning endpoint and example](https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b)
- [Nemotron 3.5 Lightning model card](https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b/modelcard)
- [Nemotron 3 Super availability](https://build.nvidia.com/nvidia/nemotron-3-super-120b-a12b)
- [NVIDIA hosted API reference](https://docs.api.nvidia.com/nim/reference/llm-apis)
- [HackUTD event tracks and schedule](https://zeroday.hackutd.co/)


## Vercel deployment checks

The GitHub repository is linked to the Vercel project `hack-utd`. Production deploys from `main`; other branches receive preview deployments. The production URL is https://hack-utd.vercel.app.

Set `NESSIE_API_KEY`, `MONGODB_URI`, and `MONGODB_DB=walletwhisperer` in both **Production** and **Preview** environment scopes. Set `USE_LOCAL_DATA=false` to verify the live provider. Keep credentials in Vercel environment variables and ignored local environment files, never in Git. Environment changes require a new deployment.

`GET /api/status` reports only `{ ok, mongodb, nessie }`, never credentials or financial records. It checks the shared MongoDB connection and a read in the selected database, and makes a read-only Nessie request without falling back to fixtures. HTTP 200 means both dependencies responded; HTTP 503 identifies an unavailable/unconfigured dependency or fixture mode. The route runs at request time, so a successful static build cannot conceal a runtime connection failure.

After deployment, also open My Money, run a health check and reload. Confirm the application reports a saved result: the status endpoint checks connectivity, while the saved assessment confirms the real application write/read path. `GET /api/health?member=alex` currently exposes `saved`, `unchanged`, `source` and history for the synthetic demo. Session-bound access remains a separate planned change.

Atlas must permit the Vercel runtime to connect. Check Atlas Network Access, database-user permissions and the URI's encoded password when a connection is unavailable. Do not reseed Nessie to diagnose deployment connectivity.

Vercel previews require a commit author recognized by GitHub. If a deployment reports an invalid Mac-local email, configure `git config --local user.email` with the account’s verified commit email or GitHub-provided no-reply address, then push a new commit. This repository uses the GitHub no-reply identity for AfeIsm; previous commits do not need to be rewritten.
