# Nessie API Reference Guide for AI Agents

## Overview

The Capital One Nessie API is a sandbox banking environment providing mock financial data. It is RESTful, uses JSON, and is the sole source of "Money Data" for the Huddle application.

> **Critical system rule** — The AI (Nemotron) must never invent financial numbers. All financial data used by the AI must originate from Nessie through the Huddle engine and tools.

## Authentication and base URL

| Setting | Value |
| --- | --- |
| Base URL | `https://api.nessieisreal.com` |
| Authentication | Append `?key={NESSIE_API_KEY}` as a query parameter to every request |
| Content type | `Content-Type: application/json` |
| Accepted response | `Accept: application/json` |

## 1. Customers

Represents the individuals holding banking accounts.

### Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/customers` | Get all customers |
| `GET` | `/customers/{id}` | Get a specific customer |

### Data fields

| Field | Type | Description |
| --- | --- | --- |
| `_id` | String | Unique customer identifier |
| `first_name` | String | First name |
| `last_name` | String | Last name |
| `address` | Object | Includes `street_number`, `street_name`, `city`, `state`, and `zip` |

### Huddle usage

Maps Huddle's internal `memberId` to the corresponding `nessieCustomerId` in the MongoDB `members` collection.

## 2. Accounts

Represents the bank accounts owned by a customer.

### Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/customers/{id}/accounts` | Get all accounts for a customer |
| `GET` | `/accounts/{id}` | Get a specific account |

### Data fields

| Field | Type | Description |
| --- | --- | --- |
| `_id` | String | Unique account identifier |
| `type` | String | One of `Checking`, `Savings`, or `Credit Card` |
| `nickname` | String | User-defined account name |
| `rewards` | Number | Rewards points |
| `balance` | Number | Current balance in dollars |
| `customer_id` | String | Owning customer's identifier |

### Huddle usage

- Maps directly to Huddle's `Account` interface.
- Provides balances for the F1 Dashboard and baseline numbers for the F2 Health Score, including checking and savings buffers.
- Supplies source-account selection for pledges in the F4 Huddle feature.

## 3. Transactions

Purchases, deposits, and withdrawals represent money moving into and out of specific accounts.

### 3a. Purchases — money out

#### Endpoints

| Method | Path |
| --- | --- |
| `GET` | `/accounts/{id}/purchases` |
| `POST` | `/accounts/{id}/purchases` |

#### Data fields

| Field | Type | Description |
| --- | --- | --- |
| `_id` | String | Purchase identifier |
| `merchant_id` | String | Links to the merchant object |
| `amount` | Number | Dollar amount spent |
| `purchase_date` | String | Transaction date in `YYYY-MM-DD` format |
| `description` | String | Purchase description |

#### Huddle usage

- Feeds `detectRecurring(txns)` to identify subscriptions automatically.
- Feeds `checkSource()` to affect the Savings Protection indicator when emergency savings are used for purchases unrelated to a savings goal.

### 3b. Deposits — money in

#### Endpoints

| Method | Path |
| --- | --- |
| `GET` | `/accounts/{id}/deposits` |
| `POST` | `/accounts/{id}/deposits` |

#### Data fields

- `_id`
- `amount`
- `transaction_date`
- `description`
- `payee_id`

#### Huddle usage

Feeds `detectPaychecks(txns)` to determine income, pay rhythm, and the next payday automatically. Monthly income supports the Debt Load and Non-essential Spending indicators.

### 3c. Withdrawals — money out

#### Endpoints

| Method | Path |
| --- | --- |
| `GET` | `/accounts/{id}/withdrawals` |
| `POST` | `/accounts/{id}/withdrawals` |

#### Data fields

- `_id`
- `amount`
- `transaction_date`
- `description`
- `payer_id`

## 4. Merchants

Represents businesses where purchases are made.

### Endpoints

| Method | Path |
| --- | --- |
| `GET` | `/merchants` |
| `GET` | `/merchants/{id}` |

### Data fields

| Field | Type | Description |
| --- | --- | --- |
| `_id` | String | Merchant identifier |
| `name` | String | Merchant name |
| `category` | Array of strings | Categories such as `["food", "dining"]` or `["utilities"]` |

### Huddle usage

Merchant categories support automatic classification of recurring purchases as essential, such as rent and utilities, or nonessential, such as streaming and dining. The classifications feed the F1 Obligations list and F2 Health Score weighting.

## 5. Bills and loans

Represents recurring debts and scheduled payments.

### 5a. Bills

#### Endpoints

| Method | Path |
| --- | --- |
| `GET` | `/accounts/{id}/bills` |
| `POST` | `/accounts/{id}/bills` |

#### Data fields

| Field | Type | Description |
| --- | --- | --- |
| `_id` | String | Bill identifier |
| `payee` | String | Payment recipient |
| `nickname` | String | Bill nickname |
| `payment_amount` | Number | Payment amount |
| `recurring_date` | Number | Day of the month the payment repeats |
| `upcoming_payment_date` | String | Upcoming payment date |

#### Huddle usage

Maps into Huddle's `Obligation` interface with `origin: 'bill'`. Bills combine with detected recurring purchases to forecast balances over 30 and 60 days.

### 5b. Loans

#### Endpoints

| Method | Path |
| --- | --- |
| `GET` | `/accounts/{id}/loans` |
| `POST` | `/accounts/{id}/loans` |

#### Data fields

| Field | Type | Description |
| --- | --- | --- |
| `_id` | String | Loan identifier |
| `type` | String | Loan type, such as `auto` or `home` |
| `monthly_payment` | Number | Monthly payment |
| `amount` | Number | Total remaining principal |

#### Huddle usage

Maps into Huddle's `Obligation` interface with `origin: 'loan'`. Monthly payments directly feed the Debt Load indicator, which has a 15% weight.

## 6. Transfers — peer to peer

Moves money from one account to another.

### Endpoints

| Method | Path |
| --- | --- |
| `GET` | `/accounts/{id}/transfers` |
| `POST` | `/accounts/{id}/transfers` |

### POST payload

```json
{
  "medium": "balance",
  "payee_id": "DESTINATION_ACCOUNT_ID",
  "amount": 150.00,
  "transaction_date": "2026-11-07",
  "description": "Huddle Trip Fund Lock-in"
}
```

### Huddle usage

Supports the F4 Huddle lock-in flow. When all Huddle members click **Agree** during the agreeing phase, the backend issues a `POST` request for each member, moving their pledged amount from their chosen source account into the shared Huddle destination account.

## Summary for agent tool calling

When the agent calls a tool such as `get_picture(memberId)`, the backend parses the relevant Nessie responses and transforms them into the unified `FinancialPicture` TypeScript interface defined in Huddle's codebase.

The agent relies on the engine's tools that wrap this data. Direct Nessie request formatting belongs to the backend integration.
