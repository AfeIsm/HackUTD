# HackUTD
# Huddle

**Can we afford it?**

Huddle brings a person's financial picture into one place, evaluates upcoming obligations, and helps individuals and groups make spending decisions. Members can plan a shared purchase while keeping their underlying finances private.

Built for HackUTD 2026 with Capital One's Nessie banking sandbox, NVIDIA Nemotron, and MongoDB Atlas.

> **Project status — implementation specification.** This README describes the intended application and its acceptance criteria. Features are planned until verified in the running app. The local planning workspace currently has no application scaffold or package scripts. Setup commands below describe the interface the implementation should provide.

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
| Capital One — Best Use of Nessie | Customer/account data, transaction history, bills, loans, merchants, and approved sandbox transfers | Show data retrieved from Nessie and the provider record for a supported write |
| NVIDIA — Use Nemotron Beyond a Chatbot | A bounded agent workflow that retrieves context, calls calculation tools, evaluates options, and proposes a verified plan | Display actual tool calls, their results, and the selected plan |
| MLH — MongoDB Atlas, subject to entry eligibility | Persisted health history, reusable plans, versioned Huddles, consent, reservations, and contribution records | Reload or switch demo identities and retrieve the correct saved state |

Track mapping follows the event's published sponsor prompts. Confirm the optional MLH entry name and eligibility before selecting it. [Official event tracks](https://zeroday.hackutd.co/)

## Product decisions

These decisions apply to the main implementation.

- **Yellow pledges are allowed with explicit confirmation.** Show the trade-off privately and require a separate acknowledgement tied to the current assessment. Red results and incomplete assessments block commitment.
- **Household finances are private until shared.** A spouse, dependent, or household role does not itself grant access to that person's financial records. Sharing requires an explicit, revocable grant.
- **Friends retain private financial views.** Group members receive only the information allowed by the Huddle's phase and sharing rules.
- **The demo uses synthetic people and money.** The one-laptop `Viewing as` selector switches seeded identities. It demonstrates permission-aware views and is not an authentication system.
- **Every spending decision names an exact source account.** Store `sourceAccountId`. Checking/savings is a display label derived from that account.
- **Saved plans have a defined context.** Reuse a plan only while the financial inputs, assessment date, commitments, and relevant policy versions still match.
- **A fully approved plan starts a funding workflow.** The UI reports a fund as funded after provider-confirmed completion of its required contributions.
- **The MVP funds contributions immediately at lock.** Evaluate current account liquidity and the immediate outflow. The event's target date informs planning, while future expected income cannot authorize a transfer today.

## Build scope and order

Complete each stage through the deployed application before expanding the next one. Update feature status in this README as acceptance criteria pass.

| Priority | Scope | Completion checkpoint |
| --- | --- | --- |
| P0a | Seed data, My Money, account normalization, obligations, income detection, forecasts, deterministic health results, goals, source checks, saved state | Live or explicitly labeled fixture data drives a complete personal assessment |
| P0b | Nemotron fix plans and purchase simulations, verified outcomes, saved answers and observable tool activity | A member can ask about a purchase and inspect a reproducible answer |
| P1 | Core Huddle, one seeded friend, nonpaying members, private checks, yellow acknowledgement, reveal, approvals, reservations and funding records | A group completes the main purchase flow on the deployed URL |
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

The P1 demo uses seeded members and one seeded friend. The invitation extension uses an in-app phone lookup and acceptance. This lookup is an app directory feature and does not establish phone ownership.

| Phase | What happens | What other members can see |
| --- | --- | --- |
| Pledging | Each payer enters an amount and source account and receives a private assessment | Aggregate committed count and neutral progress |
| Yellow acknowledgement | A payer with a yellow result privately confirms the specific trade-off | The aggregate progress update after commitment |
| Revealed | All paying members have valid commitments for the current proposal | Each committed amount and total/shortfall |
| Agreeing | Every payer approves the revealed contribution plan | Approved amounts and agreement progress |
| Locked | All payers approved the same plan version and final checks pass | The locked plan and funding progress |
| Cancelled | The group cancels an unfunded proposal | Cancellation status |

Private source accounts, balances, health results, capacity calculations, and coaching remain private unless separately shared with the viewer. Reveal discloses agreed contribution amounts.

**Commitment rules**

- Check the proposed pledge alongside that member's other active reservations. Replace the member's prior reservation for this Huddle when re-evaluating a revision.
- Build the assessment context with the candidate commitment included exactly once. Persist its reservation and assessment against the resulting ledger version so the initial reservation does not invalidate its own approval. A later change to another commitment requires a fresh check.
- Green may commit directly. Yellow requires a separate acknowledgement of the current assessment. Red and `needsInput` cannot commit.
- Record the approved amount, account, assessment fingerprint, proposal version and yellow acknowledgement where applicable.
- A change to cost, target date, payer list, amounts or source accounts creates a new proposal version and invalidates affected assessments and all prior group agreements.
- Revalidate current data immediately before funding. A stale pledge returns to a state requiring the member's review.
- Allow at most three completed proposal rounds before the creator chooses a lower total, a new date or cancellation of an unfunded proposal.

**Shortfalls and declines — P2**

- A short Huddle offers private, optional coaching. Suggested extra contributions must pass the same checks.
- The creator may revise the total or date. Members review the revised proposal.
- Decline reasons are change my amount, split feels unfair, total/date does not work, and leave the Huddle. Share only the reason the member elects to disclose.
- Fair-split calculations use the members' permitted private capacities inside the trusted service. Return proposed amounts to the group, and let each member accept or retain their own amount. Keep personal explanations in individual coaching contexts.
- A leaving member releases an unfunded reservation. Money already recorded as transferred requires a separate, explicitly approved reconciliation/refund operation and cannot disappear through a membership edit.

### F5 — Consented mock funding

After all paying members agree to the current proposal, execute supported Nessie transfers from each exact source account into the Huddle's designated sandbox fund account.

- Create a dedicated sandbox account for the fund under a designated demo customer and retain the link in Huddle metadata. App membership provides the shared view of its contributions.
- Tag fund accounts in application metadata and exclude them from the nominal owner's personal spendable balances. Account ownership in the sandbox must not make group contributions available for that person's unrelated spending.
- Show pledged, approved, pending and completed totals separately. Submitted transfers become completed only after confirming the provider outcome.
- Persist one contribution operation per Huddle, member and locked proposal version. Repeated clicks must reuse the existing operation.
- Keep a stable operation identifier, provider transfer ID and reconciliation status. Reconcile an ambiguous timeout before issuing another write.
- Preserve completed transfers when another contribution fails. A retry addresses only the unresolved operation after checking its provider status.
- A confirmed transfer replaces its corresponding reservation. Retain a reservation while an outflow remains unreflected in a provider balance, then release it after reconciliation. Each contribution affects available funds once.

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

### Later work — P3

Private score-drop and commitment-risk alerts, an independent recommendation reviewer, and probabilistic forecasts remain optional. Reuse verified results for alerts. Report a probability only after defining and validating the underlying assumptions. Additional group optimization and scenario stress tests can be assessed after the core implementation is working.

## Nessie API investigation

Documentation inspected on **7 November 2026**. The current interactive docs configure `https://prod-api.nessieisreal.com` as their server and use a `key` query parameter. Keep the base URL configurable and confirm it with the event key. Use server-side requests and redact keys from logs. [Current documentation](https://nessieisreal.com/docs#authentication)

### Available resources and Huddle mapping

The paths below are documentation findings. Endpoint and payload behavior still require an authenticated integration check.

| Resource | Relevant documented operations | Huddle usage |
| --- | --- | --- |
| Customers | `GET/POST /customers`, `GET/PUT /customers/{id}`, `GET /accounts/{id}/customer` | Seeded identities and ownership mapping |
| Accounts | `GET/POST /customers/{id}/accounts`, `GET /accounts/{id}`, `PUT /accounts/{id}` | Checking, savings, credit-card balances and fund account |
| Deposits | `GET/POST /accounts/{id}/deposits`, `GET /deposits/{id}` | Income history and payroll-like seed records |
| Withdrawals | `GET/POST /accounts/{id}/withdrawals`, `GET /withdrawal/{withdrawal_id}` | Cash outflows and a documented fallback for sandbox expense events |
| Bills | `GET /customers/{id}/bills`, `GET/POST /accounts/{id}/bills`, `GET/PUT /bills/{billId}` | Scheduled and recurring obligations |
| Loans | `GET/POST /accounts/{id}/loans`, `GET/PUT /loans/{id}` | Loan obligations and monthly payments |
| Merchants | `GET/POST /merchants`, `GET/PUT /merchants/{id}` | Spending categories and seed merchants |
| Purchases | `GET/PUT/DELETE /purchase/{purchase_id}` in the current reference | Merchant-based history where list/create operations are confirmed |
| Transfers | `GET/PUT/DELETE /transfers/{transfer_id}` in the reference; `POST /accounts/{id}/transfers` in Quick Start | Approved mock contributions and provider reconciliation |
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
5. Verify one mock source-to-fund transfer and retrieve its status and both balances.
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
- Recommendation tools return proposed actions. User-confirmed application routes perform supported mock funding operations.
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

## Persistent state

Store external provider IDs alongside Huddle-owned identifiers. Keep secret credentials outside stored user-facing records.

| Collection | Core contents |
| --- | --- |
| `members`, `households` | Demo identity, household relationship and Nessie customer mapping |
| `sharingGrants` | Grantor, grantee, explicit scope and revocation state |
| `accountMetadata` | Confirmed supplementary fields such as card limit or loan due date |
| `obligationOverrides` | Classification, correction and source-linking decisions |
| `savingsGoals` | Account-linked earmarks and matching Huddle references |
| `healthSnapshots` | Context key, policy/engine versions, date, indicators, forecast and provenance |
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

The main demonstration should show personal assessment, one purchase simulation, private pledges, a yellow acknowledgement or private revision, reveal, agreement, and reconciled mock funding. A reload/identity switch shows saved-result consistency. A separate private view demonstrates household sharing only after consent.

## Local setup contract

The following is the planned setup once the application scaffold and scripts exist.

```bash
git clone https://github.com/AfeIsm/HackUTD.git
cd HackUTD
npm install
cp .env.example .env.local
npm run seed
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
MONGODB_DB=huddle
USE_LOCAL_DATA=false
```

Create `.env.example` with blank secrets when scaffolding. Keep actual values in `.env.local` and the hosting environment. Configure Atlas connectivity for the deployed app using the deployment's documented network-access options.

Provide scripts for development, production build, start, seed, engine/workflow tests and the scaffold's lint/type checks. Pin package versions in the npm lockfile. Confirm service access and event credit limits with the team's own accounts.

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

