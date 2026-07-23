# Drizzle ORM Schema Specification - AI Expense/Income/Savings Tracker

This document is a Drizzle ORM schema specification for agentic AI consumption. It is not JavaScript or TypeScript implementation code. Use it to generate Drizzle `pg-core` schemas, relations, migrations, seeds, and database-only migration steps.

Database target: Postgres. All monetary values use `numeric(14,2)`, never `float` or `double`.

---

## Drizzle Conventions

- Use Drizzle ORM for PostgreSQL with `pg-core` schema constructs.
- Use `uuid` primary keys with database default `gen_random_uuid()`.
- Use `timestamp with time zone` for instant timestamps and `date` for calendar-only dates.
- Use `numeric(14,2)` for money and expose money through decimal strings at TypeScript boundaries.
- Use table-level indexes, unique constraints, and check constraints in the schema definition where Drizzle supports them.
- Use raw SQL migrations only for database capabilities that Drizzle schema definitions do not model cleanly: extensions, trigger functions, triggers, row-level security policies, and seed inserts.
- Keep comments from this specification near the generated schema fields, indexes, migrations, or handlers they describe.

---

## Extensions

Drizzle migration requirement:

- Ensure `pgcrypto` exists. Comment: for `gen_random_uuid()`.
- Ensure `pg_trgm` exists. Comment: for fuzzy text search.

---

## Enums

Define these with Drizzle `pgEnum`.

### `transaction_type`

Values:

- `expense`
- `income`
- `savings`

### `category_kind`

Values:

- `expense`
- `income`
- `savings`

### `savings_instrument_kind`

Values:

- `pension`
- `ssf`
- `sip`
- `fixed_deposit`
- `other`

### `budget_status`

Values:

- `active`
- `completed`
- `archived`

---

## Table: `users`

Drizzle table name: `users`.

| Column              | Drizzle column specification | Constraints and comments                 |
| ------------------- | ---------------------------- | ---------------------------------------- |
| `id`                | `uuid`                       | Primary key, default `gen_random_uuid()` |
| `name`              | `text`                       | Not null                                 |
| `email`             | `text`                       | Unique, nullable                         |
| `currency`          | `text`                       | Not null, default `NPR`                  |
| `timezone`          | `text`                       | Not null, default `Asia/Kathmandu`       |
| `spendable_balance` | `numeric(14,2)`              | Not null, default `0`                    |
| `total_saved`       | `numeric(14,2)`              | Not null, default `0`                    |
| `created_at`        | `timestamptz`                | Not null, default `now()`                |

Comments:

- `spendable_balance` - increases on income, decreases on expense and on savings.
- `total_saved` - increases on savings contributions. Only decreases if you add a withdrawal flow later, which is out of scope for v1.

---

## Table: `categories`

Drizzle table name: `categories`.

| Column       | Drizzle column specification | Constraints and comments                                                    |
| ------------ | ---------------------------- | --------------------------------------------------------------------------- |
| `id`         | `uuid`                       | Primary key, default `gen_random_uuid()`                                    |
| `user_id`    | `uuid`                       | Nullable FK to `users.id` with `ON DELETE CASCADE`; `NULL = global default` |
| `kind`       | `category_kind` enum         | Not null                                                                    |
| `name`       | `text`                       | Not null                                                                    |
| `created_at` | `timestamptz`                | Not null, default `now()`                                                   |

Constraints and indexes:

- Unique constraint on `(user_id, kind, name)`.

Seed requirement:

- Global default categories use `user_id = NULL` and are available to every user.
- Expense defaults: `groceries`, `clothing`, `transport`, `food & dining`, `utilities`, `entertainment`, `health`, `rent`, `other`.
- Income defaults: `salary`, `freelancing`, `allowance`, `gift`, `other`.
- Savings defaults: `pension`, `ssf`, `sip`, `fixed deposit`, `other`.

Comment:

- A category's `kind` must match the `type` of any transaction that references it. Enforce this at the application layer when inserting transactions, since Postgres cannot natively FK-constrain across a denormalized enum match without a trigger.

---

## Table: `savings_instruments`

Included in v1. Lets a user track multiple concrete instruments of the same kind, for example two separate SIPs with different providers.

Drizzle table name: `savingsInstruments` mapped to `savings_instruments`.

| Column       | Drizzle column specification   | Constraints and comments                                |
| ------------ | ------------------------------ | ------------------------------------------------------- |
| `id`         | `uuid`                         | Primary key, default `gen_random_uuid()`                |
| `user_id`    | `uuid`                         | Not null FK to `users.id` with `ON DELETE CASCADE`      |
| `kind`       | `savings_instrument_kind` enum | Not null                                                |
| `name`       | `text`                         | Not null; examples: `NIBL SIP`, `Employee Pension Fund` |
| `provider`   | `text`                         | Nullable                                                |
| `opened_at`  | `date`                         | Nullable                                                |
| `created_at` | `timestamptz`                  | Not null, default `now()`                               |

Indexes:

- `idx_savings_instruments_user` on `(user_id)`.

---

## Table: `transactions`

Drizzle table name: `transactions`.

| Column                  | Drizzle column specification | Constraints and comments                           |
| ----------------------- | ---------------------------- | -------------------------------------------------- |
| `id`                    | `uuid`                       | Primary key, default `gen_random_uuid()`           |
| `user_id`               | `uuid`                       | Not null FK to `users.id` with `ON DELETE CASCADE` |
| `type`                  | `transaction_type` enum      | Not null                                           |
| `amount`                | `numeric(14,2)`              | Not null; check `amount > 0`                       |
| `category_id`           | `uuid`                       | Nullable FK to `categories.id`                     |
| `savings_instrument_id` | `uuid`                       | Nullable FK to `savings_instruments.id`            |
| `merchant`              | `text`                       | Nullable                                           |
| `title`                 | `text`                       | Not null; concise display label                    |
| `description`           | `text`                       | Not null                                           |
| `notes`                 | `text`                       | Nullable                                           |
| `tags`                  | `text[]`                     | Nullable                                           |
| `is_recurring`          | `boolean`                    | Not null, default `false`                          |
| `receipt_image_url`     | `text`                       | Nullable                                           |
| `occurred_at`           | `timestamptz`                | Not null                                           |
| `created_at`            | `timestamptz`                | Not null, default `now()`                          |

Check constraints:

- `savings_instrument_only_for_savings`: `savings_instrument_id` is only valid when `type = 'savings'`.
- Constraint expression: `(type = 'savings') OR (savings_instrument_id IS NULL)`.

Indexes:

- `idx_transactions_user_id` on `(user_id)`.
- `idx_transactions_user_type_date` on `(user_id, type, occurred_at DESC)`.
- `idx_transactions_user_category` on `(user_id, category_id)`.
- `idx_transactions_tags` as a GIN index on `tags`.
- Fuzzy text search: `idx_transactions_description_trgm` as a GIN index on `description gin_trgm_ops`.
- Fuzzy text search: `idx_transactions_merchant_trgm` as a GIN index on `merchant gin_trgm_ops`.

Notes:

- No `currency` column here. Currency is inherited from `users.currency` for the transaction's owner. If you ever need multi-currency support per transaction, add it back later; for now the app reads `users.currency` when displaying or aggregating amounts.
- `category_id.kind` must match `type`. Enforce this in the application/service layer when inserting transactions, and reject mismatches. A cross-table check constraint would need a trigger. Add a trigger only if you want DB-level enforcement rather than relying on the service layer.
- `merchant` is typically only meaningful for `expense` transactions but is left nullable and unconstrained by type in case you want to log a payer name for income too.
- `title` is the short user-facing label for lists and summaries. `description` remains the fuller transaction detail or original parsed description.
- `notes`, `tags`, and `receipt_image_url` are all optional/nullable. `is_recurring` defaults to `false` and should be set `true` by the write-path handler when the LLM or user flags a transaction as recurring, for example `rent` or `monthly SIP`.
- Recurrence scheduling, meaning auto-creating future transactions, is out of scope here. This field just tags a transaction as part of a recurring pattern.

---

## Table: `merchant_category_map`

Cache of merchant to category associations so repeat merchants skip LLM classification.

Drizzle table name: `merchantCategoryMap` mapped to `merchant_category_map`.

| Column                | Drizzle column specification | Constraints and comments                           |
| --------------------- | ---------------------------- | -------------------------------------------------- |
| `user_id`             | `uuid`                       | Not null FK to `users.id` with `ON DELETE CASCADE` |
| `merchant_normalized` | `text`                       | Not null; lowercased, punctuation-stripped         |
| `category_id`         | `uuid`                       | Not null FK to `categories.id`                     |
| `updated_at`          | `timestamptz`                | Not null, default `now()`                          |

Constraints:

- Composite primary key on `(user_id, merchant_normalized)`.

---

## Balance-Update Trigger For Transactions

This is a Drizzle migration requirement, not a Drizzle schema-table construct.

Keeps `users.spendable_balance` and `users.total_saved` in sync automatically on insert, so application code does not have to remember to update both tables in every code path. This is DB-enforced, the confirmed approach, rather than app-layer, so it holds even if a future code path inserts a transaction without going through your main service function.

Required trigger function name: `apply_transaction_to_balance`.

Required trigger name: `trg_apply_transaction_to_balance`.

Trigger timing:

- `AFTER INSERT OR UPDATE OR DELETE ON transactions`.
- `FOR EACH ROW`.

Balance logic:

- Recalculate the affected user's balances from active (`deleted_at IS NULL`) transactions after every transaction table change.
- Income contributes positively to `users.spendable_balance`.
- Expenses contribute negatively to `users.spendable_balance`, except budget-funded expenses because that money already left spendable cash when it was allocated to the budget.
- Savings contribute negatively to `users.spendable_balance` and positively to `users.total_saved`.

Handler comment:

- Since the trigger owns balance mutation, the `createTransaction` handler should only insert into `transactions`. It must not also update `users` balances directly, or amounts will be double-applied.
- Editing, hard deleting, soft deleting, restoring, or moving a transaction between users is handled by the trigger recalculation.

---

## Row-Level Security For Transactions

Recommended for defense in depth. This is a Drizzle migration requirement, not a Drizzle schema-table construct.

Requirements:

- Enable row-level security on `transactions`.
- Create policy `transactions_user_isolation` on `transactions`.
- Policy expression: `user_id = current_setting('app.current_user_id')::uuid`.

Application comment:

- The application sets `app.current_user_id` per connection or session before running queries, so even a bug in application-layer filtering cannot leak another user's transactions.

---

# Drizzle ORM Schema Specification - Budgets (Goal-Based Savings)

Extends the main schema in this document. Same conventions: Postgres, `numeric(14,2)` for money, `uuid` primary keys, and references to `users.id` from the main schema.

This models goal-based budgets: a target amount you are saving toward, such as a headset or a house down payment, that you top up over time. It does not model a monthly spending-limit budget, for example `do not spend more than $200/month on groceries`. Those are a genuinely different concept because they compare against expense transactions in a category per period and reset each period. Say the word if you want that too; it would be a separate schema on top of `transactions`, not this one.

---

## Table: `budgets`

Drizzle table name: `budgets`.

| Column           | Drizzle column specification | Constraints and comments                                     |
| ---------------- | ---------------------------- | ------------------------------------------------------------ |
| `id`             | `uuid`                       | Primary key, default `gen_random_uuid()`                     |
| `user_id`        | `uuid`                       | Not null FK to `users.id` with `ON DELETE CASCADE`           |
| `name`           | `text`                       | Not null; examples: `headset`, `house`                       |
| `target_amount`  | `numeric(14,2)`              | Nullable; check `target_amount IS NULL OR target_amount > 0` |
| `current_amount` | `numeric(14,2)`              | Not null, default `0`; maintained by trigger below           |
| `target_date`    | `date`                       | Nullable; optional deadline                                  |
| `status`         | `budget_status` enum         | Not null, default `active`                                   |
| `created_at`     | `timestamptz`                | Not null, default `now()`                                    |

Indexes:

- `idx_budgets_active_name_unique`: unique index on `(user_id, lower(name))` where `status = 'active'`.
- Comment: only one active budget per name per user. This lets a name be reused later once a budget is completed or archived, for example a second `headset` budget after the first one is done.
- `idx_budgets_user_status` on `(user_id, status)`.
- Fuzzy name matching: `idx_budgets_name_trgm` as a GIN index on `name gin_trgm_ops`. See the note below; this matters more than it looks.

Fuzzy matching note:

- In your own example, you created the budget as `headset` but queried it as `headphone`. Those are different words, not just a typo. Exact or trigram matching on `name` alone will not catch that. Trigram similarity handles typos like `hedset` but not synonyms.
- If you want `headphone` to find a budget named `headset`, that needs either a small synonym-aware step before the DB lookup, for example the LLM normalizes the query term against the user's actual budget names because it has both in context and can recognize they refer to the same thing, or an embeddings-based similarity search over budget names.
- Plain SQL fuzzy search alone will not solve this specific case. This will bite at the query-tool step, not the schema step.

Notes:

- `target_amount` is nullable to allow open-ended budgets with no specific goal, just accumulating. Your examples always give one. Default to requiring it at the application layer and only allow null if the user explicitly declines to set a target.
- No constraint stops `current_amount` from exceeding `target_amount`. Targets are informal, for example `about $3000`, not a hard cap.
- `status` does not auto-transition to `completed` when `current_amount` reaches `target_amount`. That is a small optional addition, either app-layer check or trigger extension, if you want it.

---

## Table: `budget_allocations`

One row per `allocate $X to budget Y` action. This is an append-only ledger, not just a running total, so you can show history, such as when money was added to a budget.

Drizzle table name: `budgetAllocations` mapped to `budget_allocations`.

| Column        | Drizzle column specification | Constraints and comments                                                                         |
| ------------- | ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `id`          | `uuid`                       | Primary key, default `gen_random_uuid()`                                                         |
| `budget_id`   | `uuid`                       | Not null FK to `budgets.id` with `ON DELETE CASCADE`                                             |
| `user_id`     | `uuid`                       | Not null FK to `users.id` with `ON DELETE CASCADE`; denormalized, same pattern as `transactions` |
| `amount`      | `numeric(14,2)`              | Not null; check `amount > 0`                                                                     |
| `note`        | `text`                       | Nullable                                                                                         |
| `occurred_at` | `timestamptz`                | Not null                                                                                         |
| `created_at`  | `timestamptz`                | Not null, default `now()`                                                                        |

Indexes:

- `idx_budget_allocations_budget` on `(budget_id)`.
- `idx_budget_allocations_user` on `(user_id)`.

---

## Balance-Update Trigger For Budget Allocations

This is a Drizzle migration requirement, not a Drizzle schema-table construct.

Same DB-enforced pattern as the transactions trigger. An allocation is money leaving spendable cash into the budget's earmarked pot. This decrements `users.spendable_balance`, the same way a `savings` transaction does.

Assumption:

- If you intended budgets to be a separate planning layer that does not touch the real balance, just a tracker rather than actually moving money, drop the `users` update from this trigger.

Required trigger function name: `apply_budget_allocation`.

Required trigger name: `trg_apply_budget_allocation`.

Trigger timing:

- `AFTER INSERT ON budget_allocations`.
- `FOR EACH ROW`.

Trigger logic:

- Lock the budget row to avoid a race between two concurrent allocations.
- Read the budget status from `budgets` using `FOR UPDATE`.
- If the budget status is not `active`, raise an exception: `Cannot allocate to a budget that is not active (status: %)`.
- Update `budgets.current_amount = current_amount + NEW.amount` for `NEW.budget_id`.
- Update `users.spendable_balance = spendable_balance - NEW.amount` for `NEW.user_id`.

Comment:

- The exception guard against allocating to a non-active budget is a small safety addition beyond what you asked for. Remove it if you would rather allow allocating to a completed or archived budget without error.

---

## Row-Level Security For Budgets

This is a Drizzle migration requirement, not a Drizzle schema-table construct.

Requirements:

- Enable row-level security on `budgets`.
- Create policy `budgets_user_isolation` on `budgets`.
- Policy expression: `user_id = current_setting('app.current_user_id')::uuid`.
- Enable row-level security on `budget_allocations`.
- Create policy `budget_allocations_user_isolation` on `budget_allocations`.
- Policy expression: `user_id = current_setting('app.current_user_id')::uuid`.

---

## What This Does Not Cover Yet

- Reading the value, for example `how much is in my budget for X`, is a tool-schema/query concern, not a schema concern. That is the next step, same generic-tool philosophy as `query_transactions`, once you are ready for it.
- Editing or deleting an allocation needs balance-reversal logic, same open point as the transactions trigger from before.
- Auto-completing a budget when `current_amount` hits `target_amount` is optional and not built.
