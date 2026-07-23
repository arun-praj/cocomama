# Agent Spec â€” AI Finance Tracking Tool-Calling Layer

## 0. Status

This is the authoritative, current spec for the tool-calling layer â€” it **supersedes
the tool-schema sections** of `expense-agent-build-prompt.md` (that file's original
`create_transaction`/`query_transactions` schemas are now out of date; the schema
section of that file is still fine). It builds on `schema.md` and `budget-schema.md`
â€” read those first if you haven't, since this doc references their tables without
re-deriving them.

---

## 1. Role

You are the tool-calling layer for a personal finance chat agent. You never touch
the database directly. Every read or write happens by emitting one of the six tool
calls below; the backend validates, executes, and returns a structured result for
you to phrase into a natural-language reply.

---

## 2. Context injected every turn

- `today_date`, `user_timezone`, `user_currency`
- The user's categories, **grouped by kind** (expense / income / savings)
- The user's existing budgets: `[{id, name, status, target_amount, current_amount}]`
  â€” needed so you can resolve "my laptop budget" to an id and detect near-duplicate
  names before creating a new one
- Merchantâ†’category history is looked up server-side before you're called for
  classification (see `create_transaction`) â€” it is not injected into the prompt.

---

## 3. Tool catalogue

### 3.1 `create_transaction`

```
create_transaction(
  type: "expense" | "income" | "savings",
  amount: number,
  category: string,            // must match an existing category name for this type, or "other"
  description: string,
  merchant?: string,            // structured field for merchant-based lookups/caching
  savings_instrument?: string,  // only when type = "savings"
  tags?: string[],
  is_recurring?: boolean,       // default false
  occurred_at: string           // ISO date, resolved using today_date + user_timezone
)
```

Requirements (carried over and finalized from the earlier spec):

- Resolve relative dates ("yesterday," "this month") against injected `today_date`
  â€” never guess without it. If no day is mentioned at all (e.g. "received my salary
  this month"), default `occurred_at` to `today_date` rather than the 1st of the
  month; flag this in your reply if it matters (see Worked Examples, Case 3).
- Category must come from the injected list **for the matching type** â€” an expense
  can't be filed under an income category. If nothing fits, use `"other"` and
  include a `suggested_new_category` field.
- **Category vs. item name** â€” see Â§4, this is a common source of bugs. `category`
  is a broad bucket ("clothing," "electronics"). The specific product ("headphone,"
  "shoe") goes in `description`/`merchant`, not `category`.
- `merchant` and `description` are separate fields serving separate purposes:
  `merchant` is the structured value used for the merchant-cache lookup (so
  "Coseli Nepal" always maps to the same category next time); `description` is the
  human-readable summary and will often _also_ mention the merchant in prose. Both
  get populated â€” one doesn't replace the other.
- Check `merchant_category_map` before calling you at all for a known merchant;
  skip category classification when there's a cache hit.
- `savings_instrument` only valid when `type = "savings"` â€” reject otherwise.

---

### 3.2 `query_transactions`

```
query_transactions(
  filters: {
    type?: "expense" | "income" | "savings",
    category?: string,
    merchant?: string,
    description_contains?: string,  // fuzzy-matched (pg_trgm), see Â§4
    date_start?: string,
    date_end?: string,
    amount_min?: number,
    amount_max?: number
  },
  aggregate: "sum" | "count" | "avg" | "list" | "net",
  group_by?: "category" | "merchant" | "date" | "type" | "none",
  sort?: "date_desc" | "amount_desc" | "none",
  limit?: number
)
```

Unchanged from the earlier spec (generic filter object, `net` = income âˆ’ expense âˆ’
savings). The addition for this round is Â§5: **decompose multi-part questions into
multiple calls to this same tool** rather than merging unrelated filters into one.

---

### 3.3 `create_budget`

```
create_budget(
  name: string,
  target_amount?: number,
  target_date?: string   // ISO date, optional
)
```

- Before creating, the backend checks the injected budget list for a
  **near-duplicate active name** (fuzzy match, not just exact) â€” e.g. "laptop" vs.
  "laptop fund." Exact-same-name-while-active is already blocked at the DB level
  (`idx_budgets_active_name_unique` in `budget-schema.md`); this is the softer
  check for similar-but-not-identical names that constraint won't catch.
- On a near-duplicate hit, don't silently create a second budget â€” call `clarify`
  ("You already have an active budget called 'laptop fund' with Rs 150 saved â€” add
  to that one, or make this a separate budget?").
- Returns `{budget_id, name, target_amount, current_amount: 0, status: "active"}` on
  success â€” pass `budget_id` forward if the same message also allocates to it (see
  Â§6).

---

### 3.4 `allocate_to_budget`

```
allocate_to_budget(
  budget_id?: string,     // preferred â€” use this when you already have it (just
                          // created, or from a query_budgets call this turn)
  budget_name?: string,   // fallback â€” backend resolves by fuzzy match against the
                          // user's ACTIVE budgets; at least one of budget_id/budget_name required
  amount: number,
  occurred_at: string,
  note?: string
)
```

- If `budget_name` matches zero or more-than-one active budget, the backend returns
  a structured no-match/ambiguous-match result instead of guessing â€” call `clarify`.
- Allocating decreases `users.spendable_balance` and increases the budget's
  `current_amount` (DB trigger, already built in `budget-schema.md`) â€” this is the
  same "money leaving spendable cash" semantics as a `savings` transaction, now
  confirmed by your own example ("assign 200 from my **available money**").
- If the resolved budget's status isn't `active`, the DB trigger raises an
  exception â€” catch it and surface a clean message rather than a raw DB error (see
  Â§7).

---

### 3.5 `query_budgets`

```
query_budgets(
  name_query?: string,          // fuzzy-matched against budget names
  status?: "active" | "completed" | "archived",
  allocation_date_start?: string,  // for "how much did I add last month" style questions
  allocation_date_end?: string,
  aggregate: "current_amount" | "target_amount" | "remaining" | "allocations_sum" | "list"
)
```

- `current_amount` / `target_amount` / `remaining` read directly from the `budgets`
  table (already-maintained running totals â€” no date range needed, since "how much
  is in my budget" means the total to date).
- `allocations_sum` aggregates over `budget_allocations` with the optional date
  range â€” this is the tool for "how much did I put into my laptop budget **last
  month**" as opposed to "how much is in it **total**." Same generic-tool
  philosophy as `query_transactions`: one tool, the filters carry the phrasing
  differences.
- `list` returns all matching budgets with their full state â€” for "what budgets do
  I have going."

---

### 3.6 `clarify`

```
clarify(question: string)
```

Called instead of guessing whenever: a category has no good match, a date is
genuinely ambiguous, a budget name matches zero or multiple budgets, or a
near-duplicate budget name is detected on creation.

---

## 4. Category vs. item name â€” read this before wiring up extraction

This is the most common way these systems produce wrong aggregates, and your own
examples hit it directly:

- **Category** = a broad bucket drawn from the seeded/user category list
  (`clothing`, `electronics`, `groceries`...).
- **Item/product name** ("headphone," "shoe," "momo") is _not_ a category. It
  belongs in `description` (and `merchant` if a business is named), and gets
  matched at query time via `description_contains` (fuzzy/full-text search) â€” never
  via the `category` filter, unless the item happens to literally share a name with
  a seeded category.

Concretely: "how much did I spend on my headphone" should become
`{filters: {description_contains: "headphone"}, aggregate: "sum"}`, **not**
`{filters: {category: "headphone"}, ...}` â€” there is no `headphone` category, and
if the model guesses one into existence you'll get a category column full of
one-off item names instead of a small, meaningful set of buckets.

**Gap to flag**: your seeded expense categories (`schema.md`) don't currently
include anything like `electronics` or `shopping` â€” a headphone purchase has
nowhere clean to land except `other`. Worth adding `electronics` (and maybe
`shopping` as a catch-all for one-off purchases) to the seed list before you ship,
otherwise `other` will absorb a lot of real spending and your category breakdowns
will be less useful than they could be. Say the word and I'll patch `schema.md`.

---

## 5. Multi-intent decomposition (compound questions)

**Rule: if a message contains more than one distinct ask, emit one tool call per
ask â€” never merge unrelated filters into a single call.**

"How much did I spend on my headphone last week? And how much on shoe?" is two
independent questions sharing a date range, not one question with two categories.
Filters combine with AND semantics â€” cramming both items into one
`query_transactions` call would either match nothing (if you tried
`category IN (...)`, which isn't how the filter object works) or silently answer
only one of the two. The correct handling is two separate calls in the same turn:

```
query_transactions({ filters: { description_contains: "headphone", date_start: <last week start>, date_end: <last week end> }, aggregate: "sum" })
query_transactions({ filters: { description_contains: "shoe",      date_start: <last week start>, date_end: <last week end> }, aggregate: "sum" })
```

Then synthesize **one reply covering both**, in the order asked. If one call
fails or returns nothing, say so for that part specifically rather than dropping it
silently or failing the whole response.

This generalizes beyond two items â€” three merchants, "spending vs. saving this
month," "clothing and groceries last week" are all the same pattern: split by
distinct filter combination, not by sentence structure.

---

## 6. Chained actions (create, then use the result)

Some messages contain a create-then-act sequence: "Create a budget for a laptop...
and assign 200 from my available money" is `create_budget` followed by
`allocate_to_budget`, where the second call needs the first call's `budget_id`.

Handle this as sequential tool calls within the same turn: call `create_budget`,
read its `budget_id` from the result, then call `allocate_to_budget` with that id
(not by re-resolving the name, which would work but is strictly redundant right
after creation â€” you already have the id). Don't ask the user to repeat the budget
name for the second call.

---

## 7. Validation & robustness

- **Type/enum/amount validation**: `amount > 0`, `type` in its enum, `occurred_at`
  parses and isn't in the future, category's `kind` matches the transaction `type`.
- **Insufficient balance â€” warn, don't block by default**: if an expense or
  allocation would drive `spendable_balance` negative, don't reject the write (real
  usage includes logging expenses before logging today's income, or planned
  spending) â€” insert it, but say so in the reply ("heads up, this puts you at
  -Rs 500"). Flag if you'd rather hard-block instead; that's a one-line change in
  the handler.
- **Idempotency**: guard against duplicate inserts from client retries â€” either a
  client-supplied idempotency key, or a server-side check rejecting an identical
  `(user_id, amount, description, occurred_at)` insert within a short window (e.g.
  60 seconds).
- **Ambiguity â†’ `clarify`, never a silent guess**: unrecognized category with no
  reasonable fallback, unresolvable budget name, ambiguous relative date.
- **Errors surface as structured tool results, not crashes**: if a DB constraint
  fires (duplicate active budget name, allocate-to-inactive-budget), catch it in
  the handler and return a clean structured error for you to explain in plain
  language â€” never let a raw Postgres exception reach the user.
- **Security (recap from `schema.md`)**: parameterized queries only, every query
  scoped to `user_id`, row-level security as a second layer, you never emit raw
  SQL â€” only structured tool calls.
- **Concurrency**: the budget-allocation trigger already row-locks (`FOR UPDATE`)
  to prevent a race between two simultaneous allocations to the same budget.

---

## 8. Worked examples â€” your six cases end to end

**1. "Bought a new pair of headphone @ 999"**

```
create_transaction({ type: "expense", amount: 999, category: "electronics" /* or "other" until seeded */, description: "Headphones", occurred_at: today_date })
```

**2. "Spent money on a shoe for Rs 1000 at Coseli Nepal"**

```
create_transaction({ type: "expense", amount: 1000, category: "clothing", merchant: "Coseli Nepal", description: "Shoe purchase at Coseli Nepal", occurred_at: today_date })
```

(Both `merchant` and `description` carry "Coseli Nepal" â€” see Â§3.1.)

**3. "Received salary for this month Rs 62k"**

```
create_transaction({ type: "income", amount: 62000, category: "salary", description: "Salary for July", occurred_at: today_date })
```

(No specific payday given, so `occurred_at` defaults to today â€” flag this
assumption in the reply if precision matters to you.)

**4. "I want a laptop. Create a budget for a laptop, it'll cost around 2000. Assign 200 from my available money."**

```
create_budget({ name: "laptop", target_amount: 2000 })
â†’ { budget_id: "b_123", current_amount: 0, status: "active" }

allocate_to_budget({ budget_id: "b_123", amount: 200, occurred_at: today_date })
â†’ budgets.current_amount = 200; users.spendable_balance -= 200
```

**5. "How much did I spend on my headphone last week? And how much on shoe?"**

```
query_transactions({ filters: { description_contains: "headphone", date_start: <last_week_start>, date_end: <last_week_end> }, aggregate: "sum" })
query_transactions({ filters: { description_contains: "shoe", date_start: <last_week_start>, date_end: <last_week_end> }, aggregate: "sum" })
```

â†’ "You spent Rs 999 on the headphone and Rs 1000 on the shoe last week."

**6. "How much money did I save for my budget of a laptop?"**

```
query_budgets({ name_query: "laptop", aggregate: "current_amount" })
```

â†’ "You've saved Rs 200 toward your laptop budget (target: Rs 2000)."

---

## 9. Sample system prompt

```
You are a finance-tracking assistant. Today's date is {today_date}, the user's
timezone is {user_timezone}, and amounts are in {user_currency}.

The user's categories, by type:
  expense: {expense_categories}
  income: {income_categories}
  savings: {savings_categories}

The user's current budgets:
  {budget_list}   // [{id, name, status, target_amount, current_amount}]

Rules:
- Use create_transaction / create_budget / allocate_to_budget for anything the
  user states as having happened or wanting to set up. Use query_transactions /
  query_budgets for anything the user is asking about.
- category is a broad bucket, not the specific item purchased â€” put the item in
  description/merchant and match it at query time via description_contains.
- If a message contains more than one distinct question or action, emit one tool
  call per distinct part, then answer all parts in one reply.
- If a budget name is new but similar to an existing active budget, or a category/
  date/budget reference is ambiguous, call clarify instead of guessing.
- Never invent SQL. Never touch the database except through these tools.
```

---

## 10. Deliverables for the coding AI

1. TypeScript interfaces for all six tool schemas above.
2. Handler functions: `createTransaction`, `queryTransactions`, `createBudget`,
   `allocateToBudget`, `queryBudgets`, `clarify` â€” implementing the validation,
   fuzzy-resolution, and error-translation behavior described in Â§3 and Â§7.
3. A date-range resolver utility (`"last week"`, `"this month"`, etc. â†’ ISO
   start/end), used server-side rather than trusted to LLM date math.
4. The system prompt assembly function that fills in Â§9's template from live user
   state each turn.
5. A small test suite exercising exactly the six worked examples in Â§8, plus three
   edge cases: an unrecognized category (â†’ `other` + suggestion), an allocation to
   a budget name that matches nothing (â†’ `clarify`), and an expense that would take
   `spendable_balance` negative (â†’ inserted with a warning, not blocked).

Keep the same layering as before: LLM-facing tool schema â†’ validation â†’ database
access, cleanly separated.

---- NEW SPECS ----

# Agent Spec â€” AI Finance Tracking Tool-Calling Layer

## 0. Status

This is the authoritative, current spec for the tool-calling layer â€” it **supersedes
the tool-schema sections** of `expense-agent-build-prompt.md` (that file's original
`create_transaction`/`query_transactions` schemas are now out of date; the schema
section of that file is still fine). It builds on `schema.md` and `budget-schema.md`
â€” read those first if you haven't, since this doc references their tables without
re-deriving them.

---

## 1. Role

You are the tool-calling layer for a personal finance chat agent. You never touch
the database directly. Every read or write happens by emitting one of the tool
calls below; the backend validates, executes, and returns a structured result for
you to phrase into a natural-language reply.

---

## 2. Context injected every turn

- `today_date`, `user_timezone`, `user_currency`
- The user's categories, **grouped by kind** (expense / income / savings)
- The user's existing budgets: `[{id, name, status, target_amount, current_amount}]`
  â€” needed so you can resolve "my laptop budget" to an id and detect near-duplicate
  names before creating a new one
- Merchantâ†’category history is looked up server-side before you're called for
  classification (see `create_transaction`) â€” it is not injected into the prompt.

---

## 3. Tool catalogue

Ten tools, not six â€” Â§Â§3.7â€“3.10 are new this round. Worth being explicit that this
growth isn't the anti-pattern flagged in an earlier round of this spec ("don't make
a new tool per question phrasing"): that was about the _read_ side exploding into
`get_spending_by_category`, `get_spending_by_merchant`, etc. â€” many tools doing
slightly different filters of the same underlying query. Create / modify / delete /
spend-from-a-specific-pot are genuinely different _operations_, not phrasing
variants of one operation â€” the same distinction as POST vs. PATCH vs. a distinct
domain action in a REST API. The rule was "don't multiply tools per phrasing," not
"never add a tool" â€” this is the difference.

### 3.1 `create_transaction`

```
create_transaction(
  type: "expense" | "income" | "savings",
  amount: number,
  category: string,            // must match an existing category name for this type, or "other"
  description: string,
  merchant?: string,            // structured field for merchant-based lookups/caching
  savings_instrument?: string,  // only when type = "savings"
  tags?: string[],
  is_recurring?: boolean,       // default false
  occurred_at: string           // ISO date, resolved using today_date + user_timezone
)
```

Requirements (carried over and finalized from the earlier spec):

- Resolve relative dates ("yesterday," "this month") against injected `today_date`
  â€” never guess without it. If no day is mentioned at all (e.g. "received my salary
  this month"), default `occurred_at` to `today_date` rather than the 1st of the
  month; flag this in your reply if it matters (see Worked Examples, Case 3).
- Category must come from the injected list **for the matching type** â€” an expense
  can't be filed under an income category. If nothing fits, use `"other"` and
  include a `suggested_new_category` field.
- **Category vs. item name** â€” see Â§4, this is a common source of bugs. `category`
  is a broad bucket ("clothing," "electronics"). The specific product ("headphone,"
  "shoe") goes in `description`/`merchant`, not `category`.
- `merchant` and `description` are separate fields serving separate purposes:
  `merchant` is the structured value used for the merchant-cache lookup (so
  "Coseli Nepal" always maps to the same category next time); `description` is the
  human-readable summary and will often _also_ mention the merchant in prose. Both
  get populated â€” one doesn't replace the other.
- Check `merchant_category_map` before calling you at all for a known merchant;
  skip category classification when there's a cache hit.
- `savings_instrument` only valid when `type = "savings"` â€” reject otherwise.

---

### 3.2 `query_transactions`

```
query_transactions(
  filters: {
    type?: "expense" | "income" | "savings",
    category?: string,
    merchant?: string,
    description_contains?: string,  // fuzzy-matched (pg_trgm), see Â§4
    date_start?: string,
    date_end?: string,
    amount_min?: number,
    amount_max?: number
  },
  aggregate: "sum" | "count" | "avg" | "list" | "net",
  group_by?: "category" | "merchant" | "date" | "type" | "none",
  sort?: "date_desc" | "amount_desc" | "none",
  limit?: number
)
```

Unchanged from the earlier spec (generic filter object, `net` = income âˆ’ expense âˆ’
savings). The addition for this round is Â§5: **decompose multi-part questions into
multiple calls to this same tool** rather than merging unrelated filters into one.

---

### 3.3 `create_budget`

```
create_budget(
  name: string,
  target_amount?: number,
  target_date?: string   // ISO date, optional
)
```

- Before creating, the backend checks the injected budget list for a
  **near-duplicate active name** (fuzzy match, not just exact) â€” e.g. "laptop" vs.
  "laptop fund." Exact-same-name-while-active is already blocked at the DB level
  (`idx_budgets_active_name_unique` in `budget-schema.md`); this is the softer
  check for similar-but-not-identical names that constraint won't catch.
- On a near-duplicate hit, don't silently create a second budget â€” call `clarify`
  ("You already have an active budget called 'laptop fund' with Rs 150 saved â€” add
  to that one, or make this a separate budget?").
- Returns `{budget_id, name, target_amount, current_amount: 0, status: "active"}` on
  success â€” pass `budget_id` forward if the same message also allocates to it (see
  Â§6).

---

### 3.4 `allocate_to_budget`

```
allocate_to_budget(
  budget_id?: string,     // preferred â€” use this when you already have it (just
                          // created, or from a query_budgets call this turn)
  budget_name?: string,   // fallback â€” backend resolves by fuzzy match against the
                          // user's ACTIVE budgets; at least one of budget_id/budget_name required
  amount: number,
  occurred_at: string,
  note?: string,
  source_transaction_id?: string  // link to a savings transaction â€” see below
)
```

- If `budget_name` matches zero or more-than-one active budget, the backend returns
  a structured no-match/ambiguous-match result instead of guessing â€” call `clarify`.
- Allocating decreases `users.spendable_balance` and increases the budget's
  `current_amount` (DB trigger, already built in `budget-schema.md`) â€” this is the
  same "money leaving spendable cash" semantics as a `savings` transaction, now
  confirmed by your own example ("assign 200 from my **available money**").
- If the resolved budget's status isn't `active`, the DB trigger raises an
  exception â€” catch it and surface a clean message rather than a raw DB error (see
  Â§7).
- **`source_transaction_id`** â€” set this when the allocation _is_ a savings
  transaction you're also logging in the same message (e.g. "I put 5000 into my
  SIP for my house fund"), so the same rupee doesn't get pulled out of
  `spendable_balance` twice. Chain it: call `create_transaction` with
  `type: "savings"` first, then `allocate_to_budget` with `source_transaction_id`
  set to the returned transaction id and `amount` matching exactly â€” see Â§6 and the
  worked example in Â§8. The backend rejects a mismatch (wrong user, wrong type, or
  an amount that doesn't match the linked transaction) rather than silently
  ignoring it.

---

### 3.5 `query_budgets`

```
query_budgets(
  name_query?: string,          // fuzzy-matched against budget names
  status?: "active" | "completed" | "archived",
  allocation_date_start?: string,  // for "how much did I add last month" style questions
  allocation_date_end?: string,
  aggregate: "current_amount" | "target_amount" | "remaining" | "allocations_sum" | "list"
)
```

- `current_amount` / `target_amount` / `remaining` read directly from the `budgets`
  table (already-maintained running totals â€” no date range needed, since "how much
  is in my budget" means the total to date).
- `allocations_sum` aggregates over `budget_allocations` with the optional date
  range â€” this is the tool for "how much did I put into my laptop budget **last
  month**" as opposed to "how much is in it **total**." Same generic-tool
  philosophy as `query_transactions`: one tool, the filters carry the phrasing
  differences.
- `list` returns all matching budgets with their full state â€” for "what budgets do
  I have going."

---

### 3.6 `clarify`

```
clarify(question: string)
```

Called instead of guessing whenever: a category has no good match, a date is
genuinely ambiguous, a budget name matches zero or multiple budgets, or a
near-duplicate budget name is detected on creation.

---

### 3.7 `modify_transaction`

Edit, delete, and undo-delete are one tool, not three â€” a delete is just an update
that sets `deleted_at`, so this mirrors `schema.md`'s trigger design exactly.

```
modify_transaction(
  transaction_id: string,
  changes?: {
    type?: "expense" | "income" | "savings",
    amount?: number,
    category?: string,
    description?: string,
    merchant?: string,
    savings_instrument?: string,
    tags?: string[],
    notes?: string,
    is_recurring?: boolean,
    occurred_at?: string
  },
  delete?: boolean   // true = soft-delete now; false = restore a previously
                     // deleted transaction; omit = leave deletion status alone
)
```

- Require at least one of `changes` or `delete` â€” reject a call with neither.
- Any field being changed goes through the same validation as `create_transaction`
  (category `kind` must match the resulting `type`, `amount > 0`, etc.).
- You issue the `UPDATE`; the trigger in `schema.md` (`trg_transactions_update`)
  works out the balance delta from old vs. new automatically â€” never adjust
  `spendable_balance`/`total_saved` yourself here.
- A soft-deleted transaction disappears from `query_transactions` results and from
  balances immediately, as if it never happened, and comes back exactly the same
  way if restored.

---

### 3.8 `update_budget`

```
update_budget(
  budget_id?: string,
  budget_name?: string,   // fuzzy-resolved, same pattern as allocate_to_budget
  changes: {
    name?: string,
    target_amount?: number,
    target_date?: string,
    status?: "active" | "completed" | "archived"
  }
)
```

- No separate "delete budget" tool â€” archiving _is_ the delete. `budgets` already
  has a `status` enum for this (see `budget-schema.md`); there's no `deleted_at`
  column on that table.
- Setting `status: "active"` on a `completed`/`archived` budget is also how you
  manually reopen one â€” e.g. after undoing the purchase that auto-completed it
  (`budget-schema.md`'s noted open item: reversal restores the amount but not the
  status).
- Renaming to something that collides with another active budget is rejected by
  the DB's unique index â€” catch it and `clarify` rather than let the raw
  constraint error surface.

---

### 3.9 `modify_budget_allocation`

Same edit/delete/restore pattern as `modify_transaction`, for an individual
allocation row.

```
modify_budget_allocation(
  allocation_id: string,
  changes?: {
    amount?: number,
    note?: string,
    occurred_at?: string,
    source_transaction_id?: string | null   // set, change, or clear (null) the link
  },
  delete?: boolean   // true = soft-delete; false = restore; omit = leave alone
)
```

- Setting/changing `source_transaction_id` goes through the same link validation as
  `allocate_to_budget` (Â§3.4): must be the user's own `savings` transaction, amount
  must match exactly.
- This is also how a savings transaction gets linked to a budget _after the fact_
  â€” e.g. the user logged the SIP contribution normally, and only later says
  "actually, count that toward my house budget."

---

### 3.10 `spend_from_budget`

Answers "once a goal budget is fully funded and you buy the thing, how should that
be handled" â€” this is the tool for that moment.

```
spend_from_budget(
  budget_id?: string,
  budget_name?: string,   // fuzzy-resolved, same pattern as allocate_to_budget
  amount: number,
  category: string,        // expense category for the resulting purchase record
  description: string,
  merchant?: string,
  occurred_at: string
)
```

- Resolve the budget the same way as `allocate_to_budget` (id preferred, fuzzy name
  fallback, `clarify` on zero or multiple matches).
- **Before writing anything**, check `current_amount >= amount`. If the budget is
  short, don't silently block and don't silently allow it â€” call `clarify` with the
  two natural resolutions: spend what's saved and log the shortfall as a separate
  ordinary expense, or reduce the amount to what's actually available. There's no
  single obviously-correct default here, unlike the general expense case in Â§7.
- On success, this is a `create_transaction`-shaped insert under the hood â€”
  `type: "expense"`, `funded_by_budget_id` set to the resolved budget
  (`budget-schema.md`) â€” not a new table. The DB trigger draws down the budget's
  `current_amount` (not `spendable_balance`, since that money already left
  spendable cash back when it was allocated) and auto-completes the budget if it
  lands exactly on zero.
- The resulting row is a completely normal expense afterward â€” it shows up in
  `query_transactions` like any other purchase, so "how much did I spend on
  electronics this month" correctly includes it.

---

## 4. Category vs. item name â€” read this before wiring up extraction

This is the most common way these systems produce wrong aggregates, and your own
examples hit it directly:

- **Category** = a broad bucket drawn from the seeded/user category list
  (`clothing`, `electronics`, `groceries`...).
- **Item/product name** ("headphone," "shoe," "momo") is _not_ a category. It
  belongs in `description` (and `merchant` if a business is named), and gets
  matched at query time via `description_contains` (fuzzy/full-text search) â€” never
  via the `category` filter, unless the item happens to literally share a name with
  a seeded category.

Concretely: "how much did I spend on my headphone" should become
`{filters: {description_contains: "headphone"}, aggregate: "sum"}`, **not**
`{filters: {category: "headphone"}, ...}` â€” there is no `headphone` category, and
if the model guesses one into existence you'll get a category column full of
one-off item names instead of a small, meaningful set of buckets.

**Gap to flag**: your seeded expense categories (`schema.md`) don't currently
include anything like `electronics` or `shopping` â€” a headphone purchase has
nowhere clean to land except `other`. Worth adding `electronics` (and maybe
`shopping` as a catch-all for one-off purchases) to the seed list before you ship,
otherwise `other` will absorb a lot of real spending and your category breakdowns
will be less useful than they could be. Say the word and I'll patch `schema.md`.

---

## 5. Multi-intent decomposition (compound questions)

**Rule: if a message contains more than one distinct ask, emit one tool call per
ask â€” never merge unrelated filters into a single call.**

"How much did I spend on my headphone last week? And how much on shoe?" is two
independent questions sharing a date range, not one question with two categories.
Filters combine with AND semantics â€” cramming both items into one
`query_transactions` call would either match nothing (if you tried
`category IN (...)`, which isn't how the filter object works) or silently answer
only one of the two. The correct handling is two separate calls in the same turn:

```
query_transactions({ filters: { description_contains: "headphone", date_start: <last week start>, date_end: <last week end> }, aggregate: "sum" })
query_transactions({ filters: { description_contains: "shoe",      date_start: <last week start>, date_end: <last week end> }, aggregate: "sum" })
```

Then synthesize **one reply covering both**, in the order asked. If one call
fails or returns nothing, say so for that part specifically rather than dropping it
silently or failing the whole response.

This generalizes beyond two items â€” three merchants, "spending vs. saving this
month," "clothing and groceries last week" are all the same pattern: split by
distinct filter combination, not by sentence structure.

**One default worth stating explicitly**: "how much on clothing and groceries" is
genuinely ambiguous between _two separate totals_ and _one combined total_. Default
to two separate totals unless the phrasing says otherwise ("combined," "total,"
"altogether") â€” that's what your own examples actually wanted, and it's the safer
misread (easy to add, hard to silently under-answer).

**The same rule applies to writes, not just reads** â€” it's easy to only wire this
up for `query_transactions` since that's where the two-item example lived, but "I
spent 200 on lunch and 300 on a taxi today" is the identical shape: two
`create_transaction` calls, not one call somehow encoding two amounts. Any handler
that assumes "one message â†’ at most one write" will silently drop the second half
of a message like this.

---

## 6. Chained actions (create, then use the result)

Some messages contain a create-then-act sequence: "Create a budget for a laptop...
and assign 200 from my available money" is `create_budget` followed by
`allocate_to_budget`, where the second call needs the first call's `budget_id`.

Handle this as sequential tool calls within the same turn: call `create_budget`,
read its `budget_id` from the result, then call `allocate_to_budget` with that id
(not by re-resolving the name, which would work but is strictly redundant right
after creation â€” you already have the id). Don't ask the user to repeat the budget
name for the second call.

**Second chaining pattern â€” linked savings allocation.** "I put 5000 into my SIP
for my house fund" is `create_transaction` (type `savings`) followed by
`allocate_to_budget`, where the second call's `source_transaction_id` and `amount`
must both come from the first call's result:

```
create_transaction({ type: "savings", amount: 5000, category: "sip", description: "SIP contribution", occurred_at: today_date })
â†’ { transaction_id: "t_456" }

allocate_to_budget({ budget_name: "house", amount: 5000, source_transaction_id: "t_456", occurred_at: today_date })
```

Same principle as the first pattern: use the id you were just handed, don't
re-derive it, and keep the amount identical across both calls since the link
validation in `budget-schema.md` rejects a mismatch.

---

## 7. Validation & robustness

- **Type/enum/amount validation**: `amount > 0`, `type` in its enum, `occurred_at`
  parses and isn't in the future, category's `kind` matches the transaction `type`.
- **Insufficient `spendable_balance` â€” warn, don't block by default**: if an
  expense, income-less allocation, or unlinked savings transaction would drive
  `spendable_balance` negative, don't reject the write (real usage includes logging
  expenses before logging today's income, or planned spending) â€” insert it, but say
  so in the reply ("heads up, this puts you at -Rs 500"). Flag if you'd rather
  hard-block instead; that's a one-line change in the handler. This is a different
  situation from the next point.
- **Insufficient budget `current_amount` (`spend_from_budget`) â€” `clarify`, not
  warn-and-proceed, not silent block**: unlike overall cash flow, a specific
  budget's saved amount has no "real-world timing" excuse â€” it's a number your own
  app computed. But there are two equally reasonable resolutions to a shortfall
  (top up from spendable cash for the difference, or reduce the purchase amount),
  so guessing either way is worse than asking. See Â§3.10.
- **Edits and deletes never crash on the "normal" cases**: soft-deleting an
  already-deleted transaction, or restoring one that isn't deleted, should be a
  no-op the trigger handles gracefully (see `schema.md`'s `trg_transactions_update`
  branches) â€” not an error condition your handler needs to special-case.
- **Idempotency**: guard against duplicate inserts from client retries â€” either a
  client-supplied idempotency key, or a server-side check rejecting an identical
  `(user_id, amount, description, occurred_at)` insert within a short window (e.g.
  60 seconds).
- **Ambiguity â†’ `clarify`, never a silent guess**: unrecognized category with no
  reasonable fallback, unresolvable budget name, ambiguous relative date.
- **Errors surface as structured tool results, not crashes**: if a DB constraint
  fires (duplicate active budget name, allocate-to-inactive-budget), catch it in
  the handler and return a clean structured error for you to explain in plain
  language â€” never let a raw Postgres exception reach the user.
- **Security (recap from `schema.md`)**: parameterized queries only, every query
  scoped to `user_id`, row-level security as a second layer, you never emit raw
  SQL â€” only structured tool calls.
- **Concurrency**: the budget-allocation trigger already row-locks (`FOR UPDATE`)
  to prevent a race between two simultaneous allocations to the same budget.

---

## 8. Worked examples â€” your six cases, plus two exercising this round's additions

**1. "Bought a new pair of headphone @ 999"**

```
create_transaction({ type: "expense", amount: 999, category: "electronics" /* or "other" until seeded */, description: "Headphones", occurred_at: today_date })
```

**2. "Spent money on a shoe for Rs 1000 at Coseli Nepal"**

```
create_transaction({ type: "expense", amount: 1000, category: "clothing", merchant: "Coseli Nepal", description: "Shoe purchase at Coseli Nepal", occurred_at: today_date })
```

(Both `merchant` and `description` carry "Coseli Nepal" â€” see Â§3.1.)

**3. "Received salary for this month Rs 62k"**

```
create_transaction({ type: "income", amount: 62000, category: "salary", description: "Salary for July", occurred_at: today_date })
```

(No specific payday given, so `occurred_at` defaults to today â€” flag this
assumption in the reply if precision matters to you.)

**4. "I want a laptop. Create a budget for a laptop, it'll cost around 2000. Assign 200 from my available money."**

```
create_budget({ name: "laptop", target_amount: 2000 })
â†’ { budget_id: "b_123", current_amount: 0, status: "active" }

allocate_to_budget({ budget_id: "b_123", amount: 200, occurred_at: today_date })
â†’ budgets.current_amount = 200; users.spendable_balance -= 200
```

**5. "How much did I spend on my headphone last week? And how much on shoe?"**

```
query_transactions({ filters: { description_contains: "headphone", date_start: <last_week_start>, date_end: <last_week_end> }, aggregate: "sum" })
query_transactions({ filters: { description_contains: "shoe", date_start: <last_week_start>, date_end: <last_week_end> }, aggregate: "sum" })
```

â†’ "You spent Rs 999 on the headphone and Rs 1000 on the shoe last week."

**6. "How much money did I save for my budget of a laptop?"**

```
query_budgets({ name_query: "laptop", aggregate: "current_amount" })
```

â†’ "You've saved Rs 200 toward your laptop budget (target: Rs 2000)."

**7. "Actually that headphone was 1099, not 999"** (editing Case 1)

```
modify_transaction({ transaction_id: "<id from Case 1>", changes: { amount: 1099 } })
```

â†’ the trigger reverses the original -999 effect and reapplies -1099 â€” net an
extra Rs 100 off `spendable_balance`, no manual balance math in the handler.

**8. "I finally bought the laptop!"** â€” deliberately the _unhappy_ path, since it's
more useful than a number that happens to line up: across the running example, the
laptop budget only ever received the one Rs 200 allocation against a Rs 2000
target.

```
spend_from_budget({ budget_name: "laptop", amount: 2000, category: "electronics", description: "Laptop purchase", occurred_at: today_date })
```

â†’ backend checks `current_amount` (200) `< amount` (2000) **before** writing
anything, and calls `clarify`: "Your laptop budget only has Rs 200 saved toward a
Rs 2000 purchase â€” spend the Rs 200 and log the remaining Rs 1800 as a separate
expense, or is the actual price different?" â€” exactly the Â§3.10/Â§7 behavior, not a
crash and not a silent overdraw.

---

## 9. Sample system prompt

```
You are a finance-tracking assistant. Today's date is {today_date}, the user's
timezone is {user_timezone}, and amounts are in {user_currency}.

The user's categories, by type:
  expense: {expense_categories}
  income: {income_categories}
  savings: {savings_categories}

The user's current budgets:
  {budget_list}   // [{id, name, status, target_amount, current_amount}]

Rules:
- Use create_transaction / create_budget / allocate_to_budget / spend_from_budget
  for anything the user states as having happened or wanting to set up. Use
  modify_transaction / update_budget / modify_budget_allocation to correct or
  remove something that already exists. Use query_transactions / query_budgets for
  anything the user is asking about.
- category is a broad bucket, not the specific item purchased â€” put the item in
  description/merchant and match it at query time via description_contains.
- If a message contains more than one distinct question or action, emit one tool
  call per distinct part (this applies to writes as much as reads), then answer all
  parts in one reply. Default to separate totals, not a combined one, unless asked
  for "combined" or "total."
- If a savings transaction and a budget allocation are the same real money moving
  once, link them (allocate_to_budget's source_transaction_id) instead of logging
  both independently.
- If a budget name is new but similar to an existing active budget, a spend_from_budget
  amount exceeds what's saved, or a category/date/budget reference is ambiguous,
  call clarify instead of guessing.
- Never invent SQL. Never touch the database except through these tools.
```

---

## 10. Deliverables for the coding AI

1. TypeScript interfaces for all ten tool schemas above.
2. Handler functions: `createTransaction`, `modifyTransaction`, `queryTransactions`,
   `createBudget`, `updateBudget`, `allocateToBudget`, `modifyBudgetAllocation`,
   `spendFromBudget`, `queryBudgets`, `clarify` â€” implementing the validation,
   fuzzy-resolution, and error-translation behavior described in Â§3 and Â§7.
3. A date-range resolver utility (`"last week"`, `"this month"`, etc. â†’ ISO
   start/end), used server-side rather than trusted to LLM date math.
4. The system prompt assembly function that fills in Â§9's template from live user
   state each turn.
5. A test suite exercising all eight worked examples in Â§8, plus:
   - an unrecognized category (â†’ `other` + suggestion)
   - an allocation to a budget name that matches nothing (â†’ `clarify`)
   - an expense that would take `spendable_balance` negative (â†’ inserted with a
     warning, not blocked)
   - a `spend_from_budget` shortfall (â†’ `clarify`, nothing written)
   - a `modify_transaction` edit that changes `amount` and confirms the balance
     delta is exactly the difference, not double-applied
   - a `modify_transaction` soft-delete followed by a restore, confirming the
     balance ends up identical to if the delete never happened
   - an `allocate_to_budget` call with a `source_transaction_id` whose amount
     doesn't match the linked transaction (â†’ rejected, not silently coerced)
   - a two-part message on both the read side ("X and Y last week") and the write
     side ("spent 200 on X and 300 on Y today"), confirming two tool calls each

Keep the same layering as before: LLM-facing tool schema â†’ validation â†’ database
access, cleanly separated.
