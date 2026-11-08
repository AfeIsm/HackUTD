Nessie API Reference Guide for AI Agents
Overview
The Capital One Nessie API is a sandbox banking environment providing mock financial data. It is RESTful, uses JSON, and is the sole source of "Money Data" for the Huddle application.

Critical System Rule: The AI (Nemotron) must NEVER invent financial numbers. All financial data used by the AI must originate from Nessie (via the Huddle engine/tools).

Authentication & Base URL
Base URL: https://api.nessieisreal.com
Authentication: Append ?key={NESSIE_API_KEY} as a query parameter to EVERY request.
Headers: Content-Type: application/json and Accept: application/json.
1. Customers
Represents the individuals holding banking accounts.

Endpoints:
GET /customers - Get all customers.
GET /customers/{id} - Get a specific customer.
Data Fields Provided:
_id (string): Unique identifier for the customer.
first_name (string)
last_name (string)
address (object): Includes street_number, street_name, city, state, zip.
Huddle Usage: Used to map Huddle's internal memberId to their corresponding nessieCustomerId in the MongoDB members collection.
2. Accounts
Represents the bank accounts owned by a customer.

Endpoints:
GET /customers/{id}/accounts - Get all accounts for a customer.
GET /accounts/{id} - Get a specific account.
Data Fields Provided:
_id (string): Unique identifier for the account.
type (string): Enumerated as "Checking", "Savings", or "Credit Card".
nickname (string): User-defined name for the account.
rewards (number): Rewards points.
balance (number): Current balance in dollars.
customer_id (string): The owner's customer ID.
Huddle Usage:
Maps directly to Huddle's Account interface.
Critical for the F1 Dashboard and baseline numbers for the F2 Health Score (e.g., total buffer, checking vs. savings balances).
Used as the source selection for pledges in the F4 Huddle feature.
3. Transactions (Purchases, Deposits, Withdrawals)
Represents money moving in and out of specific accounts.

3a. Purchases (Money Out)
Endpoints: GET /accounts/{id}/purchases, POST /accounts/{id}/purchases
Data Fields Provided:
_id (string)
merchant_id (string): Links to the Merchant object.
amount (number): Dollar amount spent.
purchase_date (string): Date of transaction (YYYY-MM-DD).
description (string)
Huddle Usage: Fed into detectRecurring(txns) to automatically flag subscriptions. Fed into checkSource() to penalize the user (Savings Protection indicator) if they use emergency savings for non-goal purchases.
3b. Deposits (Money In)
Endpoints: GET /accounts/{id}/deposits, POST /accounts/{id}/deposits
Data Fields Provided:
_id, amount, transaction_date, description, payee_id.
Huddle Usage: Fed into detectPaychecks(txns) to automatically determine the user's income, pay rhythm, and next payday. Essential for the "Debt Load" and "Non-essential spending" health indicators (which divide by monthly income).
3c. Withdrawals (Money Out)
Endpoints: GET /accounts/{id}/withdrawals, POST /accounts/{id}/withdrawals
Data Fields Provided:
_id, amount, transaction_date, description, payer_id.
4. Merchants
Represents businesses where purchases are made.

Endpoints: GET /merchants, GET /merchants/{id}
Data Fields Provided:
_id (string)
name (string)
category (array of strings): e.g., ["food", "dining"], ["utilities"].
Huddle Usage: The category array is crucial. Huddle uses it to automatically tag recurring purchases as either "Essential" (rent, utilities) or "Non-essential" (streaming, dining) for the F1 Obligations list and the F2 Health Score weighting.
5. Bills & Loans (Obligations)
Represents recurring debts and scheduled payments.

5a. Bills
Endpoints: GET /accounts/{id}/bills, POST /accounts/{id}/bills
Data Fields Provided:
_id (string), payee (string), nickname (string)
payment_amount (number)
recurring_date (number): Day of the month it repeats.
upcoming_payment_date (string)
Huddle Usage: Mapped into Huddle's Obligation interface with origin: 'bill'. Combined with detected recurring purchases to forecast 30/60-day balances.
5b. Loans
Endpoints: GET /accounts/{id}/loans, POST /accounts/{id}/loans
Data Fields Provided:
_id (string), type (string: e.g., "auto", "home")
monthly_payment (number)
amount (number): Total remaining principal.
Huddle Usage: Mapped into Huddle's Obligation interface with origin: 'loan'. Directly feeds the "Debt load" health indicator (15% weight).
6. Transfers (Peer-to-Peer)
Moves money from one account to another.

Endpoints: GET /accounts/{id}/transfers, POST /accounts/{id}/transfers
Payload for POST:
{
  "medium": "balance",
  "payee_id": "DESTINATION_ACCOUNT_ID",
  "amount": 150.00,
  "transaction_date": "2026-11-07",
  "description": "Huddle Trip Fund Lock-in"
}
Huddle Usage: The F4 Huddle Lock-in. When all huddle members click "Agree" in the Agreeing phase, the backend automatically issues a POST to this endpoint for each member, moving their pledged amount from their chosen source account into the shared Huddle destination account.
Summary for Agent Tool Calling
When calling tools like get_picture(memberId), the backend will have already parsed the above Nessie endpoints and transformed them into the unified FinancialPicture TypeScript interface defined in Huddle's codebase. You do not need to format Nessie API calls directly; you rely on the engine's tools which wrap this data.
