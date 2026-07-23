# Changelog

## 2026-07-21

- Added budget chat tools for creating, querying, updating, allocating to, and archiving budgets, including recurring monthly contributions, reminder schedules, notification audit logs, authenticated notification endpoints, and frontend app/browser notification delivery.
- Added a PostgreSQL transaction balance trigger so `users.spendable_balance` and `users.total_saved` are recalculated automatically whenever transactions are inserted, updated, soft-deleted, restored, or deleted.
- Added chat cancellation plumbing so the frontend can abort an in-flight AI request and the backend forwards that abort signal to the LLM provider fetch when the client disconnects.
- Fixed between-range transaction queries so "between NPR X and NPR Y" is not split at the range connector, and same-results grouping by category/merchant/date/type receives both lower and upper amount filters.
- Fixed compound AI transaction questions that mix net movement, record lists, and counts so the backend corrects all-list model output into separate net/list/count query_transactions calls with the same date context.
- Fixed compound AI transaction queries with explicit list and grouped tool calls so natural-language amount/date filters like "above NPR 1000 this month" are applied to every generated query, and added database coverage proving below-threshold expenses are excluded from list and merchant-grouped results.

## 2026-07-20

- Added local chart-demo seed and verification scripts that create monthly and past-week transaction history for every local user so the Transactions chart can be tested with realistic data.
- Made the Transactions net-money chart interactive with spline selection, a highlighted active point, vertical highlight band, and tooltip bubble.
- Simplified the Transactions portfolio card by removing redundant mini stat cards and replacing them with a large net money figure plus an integrated curved net-history chart.
- Refined the Transactions page closer to a mobile finance app reference with a curved line chart, pill-style transaction tabs, compact goal-like cards, and smaller card sizing.
- Redesigned the Transactions page into a card-forward analytics view with summary cards, category cards, a monthly spending chart, polished transaction rows, and smoother motion while preserving the existing color scheme and data API.
- Made all non-record AI tool status chips visible in chat, including repeated calls, and enabled the same JSON hover preview used by transaction queries for category, user, budget, and clarify tools.
- Refactored frontend app side navigation into a shared drawer so Chat, Transactions, and Family use the same navigation, real recent chat history, new-chat action, profile block, and sign-out controls.
- Loaded real user/global categories and budgets into the AI system prompt, converted foreign-currency transaction amounts into the user's currency before saving, and inferred saved categories from transaction text such as lunch -> food.
- Allowed AI transaction creation to use global saved categories as well as user-owned categories, matching category tool behavior and avoiding false category-needed prompts when a global category like food exists.
- Made `clarify` tool calls visible in chat tool status UI by returning a `Clarification requested` tool-call summary instead of only rendering the assistant text.
- Improved AI transaction query planning so amount comparisons and this-month filters are preserved when the user asks to list results and then group the same results by merchant/category/date/type.
- Made chat reply typing animation scale with response length so long AI answers and Markdown tables render quickly instead of crawling one character at a time.
- Improved chat Markdown rendering for AI responses with styled headings and responsive, bordered, zebra-striped tables.
- Extended query_transactions grouping to merchant, date, and type, and improved merchant/title/description extraction aliases and fallback parsing.
- Implemented `modify_transaction` for user-scoped transaction deletion and clarified the prompt so delete-transaction requests do not call category deletion tools.
- Improved AI chat response formatting guidance and backend tool responses with Markdown headings, bold labels, spacing, and scannable category/user summaries.
- Added the read-only `query_categories` chat tool so list/show category requests execute against saved user categories instead of falling through to no tool.
- Added a guard so AI category tools only execute when the user's message explicitly asks to manage categories.
- Added explicit title support for AI-created transactions so persisted expense records can keep separate title and description fields.
- Changed transaction creation to use only saved categories, infer from existing category names when possible, and ask the user to create a category instead of auto-creating one during transaction save.
- Reworded unauthenticated backend responses to reference missing sessions instead of `x-user-id`, and added a short backend-session retry after OTP sign-in to handle browser cookie propagation.
- Treated stale or invalid Better Auth session cookies as unauthorized instead of allowing `/api/app/me` to surface a 500 during login recovery.
- Fixed the auth proxy cookie handoff and made login confirm the backend `/api/app/me` session before showing successful sign-in.
- Removed client-trusted onboarding cookie gating, routed family settings through same-origin backend proxies, and hydrated continued AI conversations from authenticated backend chat history.
- Hardened authorization on transaction and category mutations by including user ownership predicates directly in write queries, not only in pre-read checks.
- Switched authentication to database-backed Better Auth sessions by default, configured local auth env values, and made protected backend routes reject sessions without a persisted user row.
- Scoped browser-stored recent chat history to the authenticated user id and removed the legacy shared localStorage key to prevent cross-account history leaks on shared browsers.
- Improved the transactions page UX by replacing the card-like type selector with an underline tab rail, removing nested list scrolling, and making transaction rows easier to scan.
- Restyled the add-new-transaction dropdown action as a polished full-width action card with clearer hierarchy and affordance.
- Refined the manual transaction modal to be smaller, remove the internal scrollbar on normal viewports, add breathing room, and replace the broken currency text field with a compact selector.
- Redesigned the manual transaction modal into a clearer grouped form with segmented transaction type controls, a prominent amount row, better visual hierarchy, and cleaner actions.
- Normalized add-transaction dropdown and modal padding to a single compact spacing scale for a more consistent chat composer experience.
- Added outside-click dismissal for the manual transaction modal and reduced the add-transaction dropdown height.
- Changed the add-transaction dropdown background away from the page background so the menu is visually distinct without adding shadow back.
- Matched the add-transaction dropdown to the full chat input width, lifted it above the composer, and removed the extra shadows from the manual transaction surfaces.
- Added a manual transaction entry flow from the chat composer plus menu, including a validated frontend modal and a protected backend route that persists the transaction and returns the same editable saved-transaction card shape used by AI-created records.
- Added `query_user` chat tool support for user balance/profile questions such as "How much money do I have?", with regression coverage for field normalization and default balance lookup.
- Added in-memory chat conversation history and frontend conversation id persistence so clarify follow-up answers keep prior context.
- Disabled browser caching for the bare test frontend so refreshed pages pick up chat client fixes immediately.

## 2026-07-19

- Started the backend implementation scaffold for the AI finance chat system.
- Added TypeScript, Fastify, Drizzle, PostgreSQL, Zod, and Vitest project configuration.
- Added initial Drizzle schema definitions for users, categories, transactions, budgets, allocations, and merchant category mapping based on the knowledge-base specs.
- Added LLM tool input/result contracts and Zod schemas for the ten-tool chat contract.
- Added a minimal authenticated chat route and system prompt smoke test so the first implementation slice can be typechecked and tested.
- Added local NVIDIA OpenAI-compatible LLM configuration, a chat completion gateway, and tests for the provider request shape.
- Added a real-user database smoke script that seeds a demo user, parses a headphone purchase message, inserts the expense, and reads it back from Postgres.
- Updated the real-user smoke script to create the app database through the default `postgres` database before connecting to the app database.
- Added a bare minimum Fastify-served frontend for testing login with an `x-user-id` header and chatting with the AI through `/api/chat`.
