## Plan: Backend AI Chat

Build a backend-only AI finance chat implementation around the current ten-tool contract in `knowledge_base/CHAT-TOOL_SPEC.md`. The recommended approach is a Node.js + TypeScript + Fastify + Drizzle + PostgreSQL backend with strict separation between LLM-facing tool schemas, validation/domain services, repositories, database migrations/triggers, and chat orchestration. Because the workspace currently contains specs and agent guidance but no app code, the first implementation phase is scaffolding plus schema alignment.

**Steps**

1. Contract and scope baseline
   - Treat the newer ten-tool section of `knowledge_base/CHAT-TOOL_SPEC.md` as authoritative: `create_transaction`, `query_transactions`, `create_budget`, `allocate_to_budget`, `query_budgets`, `clarify`, `modify_transaction`, `update_budget`, `modify_budget_allocation`, and `spend_from_budget`.
   - Keep backend-only scope: API, LLM gateway/orchestration, tool schemas, validators, services, repositories, migrations, seeds, and tests. Exclude frontend UI, mobile clients, and production infrastructure provisioning.
   - Follow local backend guidance: strict TypeScript, single quotes, no semicolons, no trailing commas, Fastify/Drizzle/PostgreSQL patterns, user-scoped data access, structured errors, and focused tests.

2. Scaffold backend project foundation
   - Create Node.js TypeScript project files: `package.json`, `tsconfig.json`, lint/format config if desired, environment config, and test setup.
   - Add Fastify server entry points: `src/server.ts`, `src/app.ts`, and plugin registration under `src/plugins/`.
   - Add configuration modules for database URL, LLM provider settings, request limits, idempotency window, and test mode.
   - Add database bootstrap: `src/db/client.ts`, `src/db/transaction.ts`, and a helper that runs each user-scoped request inside a transaction with `SET LOCAL app.current_user_id = <authenticated_user_id>`.
   - Dependency: none. This can run in parallel with initial schema file drafting once package choices are settled.

3. Align database schema and migrations with the chat contract
   - Translate `knowledge_base/SCHEMA.md` into Drizzle schema modules for users, categories, savings instruments, transactions, merchant category map, budgets, and budget allocations.
   - Add migrations for `pgcrypto`, `pg_trgm`, enums, tables, indexes, seed categories, RLS policies, and balance triggers.
   - Resolve current spec gaps needed by the ten-tool contract:
     - Add `deleted_at` to `transactions` and `budget_allocations` for soft-delete/restore behavior.
     - Add `source_transaction_id` to `budget_allocations` so linked savings allocations do not double-deduct spendable balance.
     - Add `funded_by_budget_id` to `transactions` so `spend_from_budget` can create a normal expense funded by budget balance instead of spendable balance.
     - Add or extend update triggers for transaction edit/delete/restore balance deltas, allocation edit/delete/restore budget/balance deltas, and budget-funded expense drawdown.
   - Decide in migration comments that general spendable-balance insufficiency warns but does not block, while budget shortfall for `spend_from_budget` clarifies before writing.
   - Depends on step 1. Can run partly in parallel with step 4 type/schema definitions.

4. Define API contracts, tool schemas, and result envelope
   - Create `src/tools/types.ts` for TypeScript interfaces and JSON schemas for all ten tool inputs.
   - Define stable result envelopes such as success, validation_error, clarification_required, not_found, conflict, insufficient_budget, idempotent_duplicate, and internal_error.
   - Create request/response contracts for `POST /api/chat` and, if useful for tests/admin diagnostics, an internal `POST /api/chat/tools/execute` route guarded by auth.
   - Represent money at boundaries as decimal strings after validation; accept numeric LLM input only at the tool boundary and normalize before persistence.
   - Depends on step 1. Should complete before handlers in steps 6-9.

5. Implement shared backend utilities and repositories
   - Add user context assembly: `src/services/user-context-service.ts` loads user timezone/currency, categories grouped by kind, and active budgets for prompt injection.
   - Add `src/services/system-prompt-service.ts` to assemble the prompt from `CHAT-TOOL_SPEC.md` rules.
   - Add date resolver utility for `today_date`, user timezone, `last week`, `this month`, and explicit date validation.
   - Add merchant normalizer and merchant-category cache service backed by `merchant_category_map`.
   - Add fuzzy budget/category resolution helpers using `pg_trgm` where appropriate, plus a clear fallback to `clarify` when zero or multiple matches exist.
   - Add repositories for users, categories, transactions, budgets, allocations, and merchant cache. All repository methods must require `userId` and use Drizzle expressions or parameterized SQL only.
   - Depends on steps 2-4. Repository work depends on schema modules from step 3.

6. Implement core transaction tools first
   - Implement `createTransaction` with validation for type, amount, non-future occurred_at, category kind match, savings instrument only for savings, merchant cache lookup/upsert, idempotency guard, and structured negative-balance warning.
   - Implement `queryTransactions` with user-scoped filters, date range handling, category/merchant/description fuzzy matching, aggregate modes, grouping, sorting, bounded limits, and exclusion of soft-deleted rows.
   - Implement `modifyTransaction` with field validation, soft-delete/restore, no manual balance math, and DB constraint translation.
   - Depends on steps 3-5.

7. Implement budget tools
   - Implement `createBudget` with near-duplicate active-name detection and clean clarify result on ambiguity.
   - Implement `allocateToBudget` with id-preferred resolution, fuzzy active name fallback, source transaction validation, inactive-budget error translation, and negative spendable warning when unlinked.
   - Implement `queryBudgets` for list/current_amount/target_amount/remaining/allocations_sum with date filters over allocation history.
   - Implement `updateBudget` for rename, target amount/date, archive/complete/reopen, and duplicate-name conflict translation.
   - Implement `modifyBudgetAllocation` with edit/delete/restore and source transaction link validation.
   - Depends on steps 3-5. Can begin after transaction creation exists if source transaction linking is implemented later in the same phase.

8. Implement `spendFromBudget` and budget-funded expense behavior
   - Resolve budget by id or fuzzy active name, clarifying on zero/multiple matches.
   - Validate budget `current_amount >= amount` before any write. If short, return `clarification_required` with the two recommended paths from the spec.
   - On success, create an expense transaction with `funded_by_budget_id`, validate expense category, and rely on the DB trigger to reduce budget balance rather than spendable balance.
   - Decide whether exact zero budget balance auto-completes the budget in the trigger or service; prefer trigger for consistency with the spec, and document reversal behavior for undo.
   - Depends on steps 3, 5, 6, and 7.

9. Implement chat orchestration and LLM gateway
   - Add `src/services/llm-gateway.ts` as an OpenAI-compatible adapter so provider details remain replaceable.
   - Add `src/services/chat-orchestrator.ts` to assemble context, call the LLM, execute tool calls through a dispatcher, append tool results, and continue until a final assistant response or clarification is produced.
   - Ensure ordered tool execution for chained actions: create-budget then allocate, savings transaction then linked allocation, independent multi-part reads/writes, and edit flows.
   - Add safeguards: max tool-call iterations per request, timeout budget, correlation IDs, redacted structured logs, no raw prompt/financial detail logging unless explicitly redacted.
   - Depends on steps 4-8.

10. Add authentication, authorization, idempotency, and error handling

- Add Fastify auth middleware or a placeholder adapter that resolves authenticated `userId` before any chat/tool route runs.
- Enforce user scope in middleware, service calls, repository calls, and RLS `app.current_user_id`.
- Add idempotency support via a client-provided key if available, otherwise a server-derived duplicate guard over `(user_id, tool_name, amount, description, occurred_at)` within the configured short window.
- Add centralized error mapping for validation failures, database constraint failures, RLS failures, LLM provider failures, and timeouts.
- Depends on steps 2-5, then integrates with steps 6-9.

11. Add tests in risk order

- Unit tests for validators, money normalization, date resolver, merchant normalization, prompt assembly, result envelopes, and fuzzy resolution decisions.
- Migration/integration tests for seed data, indexes, RLS isolation, transaction balance triggers, allocation triggers, edit/delete/restore triggers, and budget-funded expense drawdown.
- Tool handler tests for all eight worked examples from `CHAT-TOOL_SPEC.md` plus the listed edge cases: unknown category, missing budget match, negative spendable warning, spend-from-budget shortfall, transaction amount edit delta, soft-delete/restore, source transaction amount mismatch, and two-part read/write decomposition.
- Chat orchestrator tests using a fake LLM gateway that emits known tool calls and validates ordered execution and final response/clarify behavior.
- Depends on each implemented phase; write focused tests alongside each tool family rather than saving all tests for the end.

12. Documentation and handoff

- Update backend README or implementation notes with setup, environment variables, migration commands, test commands, tool result envelope, and known schema decisions.
- Add a concise implementation checklist matching the ten tools so future backend work can see what is complete.
- Keep existing knowledge-base docs unchanged unless the implementation intentionally resolves a contradiction, then update the docs to reflect the final backend behavior.
- Depends on the implementation phases being complete.

**Relevant files**

- `c:\Users\arun.prajapati\Documents\cocomama\knowledge_base\CHAT-TOOL_SPEC.md` — authoritative backend chat tool contract, validation rules, examples, prompt template, and deliverables.
- `c:\Users\arun.prajapati\Documents\cocomama\knowledge_base\SCHEMA.md` — base Drizzle/Postgres schema, indexes, RLS, seeds, and trigger requirements.
- `c:\Users\arun.prajapati\Documents\cocomama\.github\agents\backend-engineer.agent.md` — backend stack, coding, API, database, security, observability, and testing guidance.
- `c:\Users\arun.prajapati\Documents\cocomama\.github\agents\finance-feature-agent.agent.md` — finance chat tool safety, validation, merchant cache, prompt, and query behavior guidance.
- `c:\Users\arun.prajapati\Documents\cocomama\.github\agents\AGENTS.md` — local TypeScript/style constraints.
- Proposed implementation files include `src/app.ts`, `src/server.ts`, `src/config/*`, `src/db/*`, `src/db/schema/*`, `src/db/migrations/*`, `src/tools/*`, `src/services/*`, `src/repositories/*`, `src/routes/chat.ts`, `src/plugins/auth.ts`, and `tests/**/*`.

**Verification**

1. Scaffold verification: run package install, `npm run typecheck`, and the narrowest empty test command once scripts exist.
2. Migration verification: run Drizzle migration generation and migration application against a local/test Postgres database; verify extensions, indexes, seed categories, RLS policies, and triggers exist.
3. Trigger verification: insert income/expense/savings transactions, linked/unlinked budget allocations, budget-funded expense transactions, and edit/delete/restore operations; assert balances and budget current amounts are exact decimal deltas.
4. Tool unit/integration verification: run focused tests per tool family, then the full tool suite covering all worked examples and edge cases from the spec.
5. Security verification: run cross-user tests proving user A cannot query, update, allocate, or spend from user B data at service and RLS levels.
6. Chat orchestration verification: run fake-LLM tests for sequential chained actions, independent multi-tool read/write messages, clarification paths, max-iteration protection, and provider failure handling.
7. Manual backend smoke test: start the Fastify server locally and send representative `POST /api/chat` requests for logging an expense, querying spending, creating/allocating a budget, editing a transaction, and budget shortfall clarification.

**Decisions**

- Use the current ten-tool contract, not the older six-tool deliverable section repeated earlier in the chat spec.
- Include schema and migration work because backend handlers cannot satisfy edit/delete/restore, source transaction linking, or budget-funded spending without database support.
- Keep a modular monolith backend first; no microservices, queues, or separate workers are needed for v1.
- Use OpenAI-compatible tool schemas behind an adapter, but avoid hard-coding one provider into service logic.
- Let DB triggers own balance and budget amount mutation; services validate and insert/update, then translate trigger or constraint failures into structured tool results.
- Treat general spendable balance overdraft as inserted-with-warning, but budget shortfall as clarification-before-write.
- Keep all reads/writes authenticated-user scoped in code and backed by Postgres RLS.

**Further Considerations**

1. The schema spec lacks several fields required by the current ten-tool chat spec. Recommended default: implement the fields/triggers required by `CHAT-TOOL_SPEC.md`, then update `SCHEMA.md` once behavior is finalized.
2. Budget name synonym handling cannot be solved by trigram search alone. Recommended default: use LLM prompt context to normalize against known budget names first, then backend fuzzy matching for typos and clarification for uncertainty.
3. Idempotency can start with a backend-derived duplicate guard for speed, but a client-supplied idempotency key should be added before production clients retry requests automatically.
