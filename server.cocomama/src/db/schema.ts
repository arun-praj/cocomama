import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const transactionType = pgEnum("transaction_type", [
  "expense",
  "income",
  "savings",
]);
export const categoryKind = pgEnum("category_kind", [
  "expense",
  "income",
  "savings",
]);
export const savingsInstrumentKind = pgEnum("savings_instrument_kind", [
  "pension",
  "ssf",
  "sip",
  "fixed_deposit",
  "other",
]);
export const budgetStatus = pgEnum("budget_status", [
  "active",
  "completed",
  "archived",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  userProfile: text("user_profile"),
  country: text("country").notNull().default("NP"),
  currency: text("currency").notNull().default("NPR"),
  timezone: text("timezone").notNull().default("Asia/Kathmandu"),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  spendableBalance: numeric("spendable_balance", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  totalSaved: numeric("total_saved", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    kind: categoryKind("kind").notNull(),
    name: text("name").notNull(),
    keywords: text("keywords")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userNameUnique: uniqueIndex("idx_categories_user_name_unique")
      .on(table.userId, sql`lower(${table.name})`)
      .where(sql`${table.userId} IS NOT NULL`),
    globalNameUnique: uniqueIndex("idx_categories_global_name_unique")
      .on(sql`lower(${table.name})`)
      .where(sql`${table.userId} IS NULL`),
  }),
);

export const savingsInstruments = pgTable(
  "savings_instruments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: savingsInstrumentKind("kind").notNull(),
    name: text("name").notNull(),
    provider: text("provider"),
    openedAt: date("opened_at"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIndex: index("idx_savings_instruments_user").on(table.userId),
  }),
);

export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    targetAmount: numeric("target_amount", { precision: 14, scale: 2 }),
    currentAmount: numeric("current_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    recurringContribution: numeric("recurring_contribution", {
      precision: 14,
      scale: 2,
    }),
    contributionCadence: text("contribution_cadence")
      .$type<"none" | "monthly">()
      .notNull()
      .default("none"),
    targetDate: date("target_date"),
    status: budgetStatus("status").notNull().default("active"),
    notificationEnabled: boolean("notification_enabled")
      .notNull()
      .default(false),
    notificationCadence: text("notification_cadence")
      .$type<"none" | "once" | "daily" | "monthly">()
      .notNull()
      .default("none"),
    notificationDayOfMonth: integer("notification_day_of_month"),
    notificationUntilPaidOff: boolean("notification_until_paid_off")
      .notNull()
      .default(false),
    nextNotificationAt: timestamp("next_notification_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    targetAmountPositive: check(
      "budgets_target_amount_positive",
      sql`${table.targetAmount} IS NULL OR ${table.targetAmount} > 0`,
    ),
    recurringContributionPositive: check(
      "budgets_recurring_contribution_positive",
      sql`${table.recurringContribution} IS NULL OR ${table.recurringContribution} > 0`,
    ),
    contributionCadenceValid: check(
      "budgets_contribution_cadence_valid",
      sql`${table.contributionCadence} IN ('none', 'monthly')`,
    ),
    notificationCadenceValid: check(
      "budgets_notification_cadence_valid",
      sql`${table.notificationCadence} IN ('none', 'once', 'daily', 'monthly')`,
    ),
    notificationDayValid: check(
      "budgets_notification_day_valid",
      sql`${table.notificationDayOfMonth} IS NULL OR (${table.notificationDayOfMonth} >= 1 AND ${table.notificationDayOfMonth} <= 31)`,
    ),
    userStatusIndex: index("idx_budgets_user_status").on(
      table.userId,
      table.status,
    ),
    userNextNotificationIndex: index("idx_budgets_user_next_notification").on(
      table.userId,
      table.nextNotificationAt,
    ),
    activeNameUnique: uniqueIndex("idx_budgets_active_name_unique")
      .on(table.userId, sql`lower(${table.name})`)
      .where(sql`${table.status} = 'active'`),
  }),
);

export const budgetNotificationLogs = pgTable(
  "budget_notification_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    budgetId: uuid("budget_id")
      .notNull()
      .references(() => budgets.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    appDeliveredAt: timestamp("app_delivered_at", { withTimezone: true }),
    browserDeliveredAt: timestamp("browser_delivered_at", {
      withTimezone: true,
    }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    budgetScheduledUnique: uniqueIndex(
      "idx_budget_notification_logs_budget_scheduled",
    ).on(table.budgetId, table.scheduledFor),
    userCreatedIndex: index("idx_budget_notification_logs_user_created").on(
      table.userId,
      table.createdAt,
    ),
  }),
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: transactionType("type").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    categoryId: uuid("category_id").references(() => categories.id),
    savingsInstrumentId: uuid("savings_instrument_id").references(
      () => savingsInstruments.id,
    ),
    fundedByBudgetId: uuid("funded_by_budget_id").references(() => budgets.id),
    merchant: text("merchant"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    notes: text("notes"),
    tags: text("tags").array(),
    isRecurring: boolean("is_recurring").notNull().default(false),
    receiptImageUrl: text("receipt_image_url"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    amountPositive: check(
      "transactions_amount_positive",
      sql`${table.amount} > 0`,
    ),
    savingsInstrumentOnlyForSavings: check(
      "savings_instrument_only_for_savings",
      sql`${table.type} = 'savings' OR ${table.savingsInstrumentId} IS NULL`,
    ),
    fundedBudgetOnlyForExpenses: check(
      "funded_budget_only_for_expenses",
      sql`${table.fundedByBudgetId} IS NULL OR ${table.type} = 'expense'`,
    ),
    userIdIndex: index("idx_transactions_user_id").on(table.userId),
    userTypeDateIndex: index("idx_transactions_user_type_date").on(
      table.userId,
      table.type,
      table.occurredAt,
    ),
    userCategoryIndex: index("idx_transactions_user_category").on(
      table.userId,
      table.categoryId,
    ),
  }),
);

export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    titleStatus: text("title_status").notNull().default("fallback"),
    titleModel: text("title_model"),
    messageCount: integer("message_count").notNull().default(0),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userUpdatedIndex: index("idx_chat_sessions_user_updated").on(
      table.userId,
      table.updatedAt,
    ),
  }),
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<"assistant" | "user">().notNull(),
    content: text("content").notNull(),
    toolCalls: jsonb("tool_calls").$type<Record<string, unknown>[] | null>(),
    isError: boolean("is_error").notNull().default(false),
    excludedFromAi: boolean("excluded_from_ai").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    sessionCreatedIndex: index("idx_chat_messages_session_created").on(
      table.sessionId,
      table.createdAt,
    ),
    userCreatedIndex: index("idx_chat_messages_user_created").on(
      table.userId,
      table.createdAt,
    ),
  }),
);

export const merchantCategoryMap = pgTable(
  "merchant_category_map",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    merchantNormalized: text("merchant_normalized").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.merchantNormalized] }),
  }),
);

export const budgetAllocations = pgTable(
  "budget_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    budgetId: uuid("budget_id")
      .notNull()
      .references(() => budgets.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceTransactionId: uuid("source_transaction_id").references(
      () => transactions.id,
    ),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    note: text("note"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    amountPositive: check(
      "budget_allocations_amount_positive",
      sql`${table.amount} > 0`,
    ),
    budgetIndex: index("idx_budget_allocations_budget").on(table.budgetId),
    userIndex: index("idx_budget_allocations_user").on(table.userId),
  }),
);
