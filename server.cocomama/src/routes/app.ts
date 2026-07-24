import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  budgets,
  categories,
  savingsInstruments,
  transactions,
  users,
} from "../db/schema.js";
import {
  getAuthenticatedSession,
  getAuthenticatedUserId,
  requireAuth,
} from "../plugins/auth.js";
import {
  createTransactionRecord,
  TransactionCategoryRequiredError,
} from "../services/transaction-record-service.js";
import { resolveTransactionDateRange } from "../services/transaction-date-range-service.js";
import {
  dismissBudgetNotification,
  listBudgetNotificationAuditLogs,
  listDueBudgetNotifications,
  markBudgetNotificationDelivered,
} from "../services/budget-notification-service.js";
import { createBudget } from "../services/budget-tool-service.js";
import {
  getRandomDiceBearFunEmojiAvatarUrl,
  isAllowedUserProfile,
} from "../services/profile-avatar-service.js";
import { resolveCategoryEmoji } from "../services/category-emoji-service.js";
import { createBudgetInputSchema } from "../tools/schemas.js";

const transactionTypes = ["expense", "income", "savings"] as const;

const onboardingSchema = z
  .object({
    displayName: z.string().trim().min(1),
    country: z.string().length(2),
    currency: z.string().length(3),
  })
  .strict();

const profileUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    country: z
      .string()
      .trim()
      .length(2)
      .regex(/^[a-zA-Z]{2}$/)
      .transform((country) => country.toUpperCase())
      .optional(),
    currency: z
      .string()
      .trim()
      .length(3)
      .regex(/^[a-zA-Z]{3}$/)
      .transform((currency) => currency.toUpperCase())
      .optional(),
    userProfile: z
      .string()
      .trim()
      .max(600_000)
      .refine(isAllowedUserProfile, {
        message: "Choose a supported profile photo or fun emoji avatar.",
      })
      .nullable()
      .optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.name !== undefined ||
      data.country !== undefined ||
      data.currency !== undefined ||
      data.userProfile !== undefined,
    {
      message: "At least one profile field is required.",
    },
  );

const recordUpdateSchema = z
  .object({
    amount: z.number().positive().optional(),
    currency: z.string().length(3).optional(),
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    category: z.string().trim().min(1).optional(),
    sourceName: z.string().trim().min(1).optional(),
    recordDatetime: z.string().min(1).optional(),
    occurredAt: z.string().min(1).optional(),
    receivedAt: z.string().min(1).optional(),
    recurrenceStatus: z.enum(["unknown", "one_time", "recurring"]).optional(),
    recurrenceCadence: z
      .enum(["weekly", "monthly", "yearly"])
      .nullable()
      .optional(),
    status: z.enum(["draft", "active", "completed"]).optional(),
    targetAmount: z.number().positive().optional(),
    recurringContribution: z.number().positive().nullable().optional(),
  })
  .strict();

const manualTransactionSchema = z
  .object({
    type: z.enum(transactionTypes),
    amount: z.number().positive(),
    currency: z.string().length(3).optional(),
    category: z.string().trim().min(1),
    description: z.string().trim().min(1),
    merchant: z.string().trim().min(1).optional(),
    savingsInstrument: z.string().trim().min(1).optional(),
    isRecurring: z.boolean().optional(),
    occurredAt: z.string().min(1),
  })
  .strict();

const categoryCreateSchema = z
  .object({
    kind: z.enum(transactionTypes),
    name: z.string().trim().min(1).max(80),
    keywords: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
  })
  .strict();

const transactionRangeQuerySchema = z
  .object({
    period: z.string().trim().optional(),
    startDate: z.string().trim().optional(),
    endDate: z.string().trim().optional(),
  })
  .strict();

const notificationDeliverySchema = z
  .object({
    channel: z.enum(["app", "browser"]),
  })
  .strict();

const onboardingCompletedCookieName = "cocomama_onboarding_completed";

type TransactionType = (typeof transactionTypes)[number];
type TransactionListItem = {
  id: string;
  type: TransactionType;
  title: string;
  description: string;
  amount: number;
  merchant: string | null;
  category: string | null;
  categoryEmoji: string | null;
  savingsInstrument: string | null;
  isRecurring: boolean;
  occurredAt: string;
  createdAt: string;
};

type TransactionGroups = Record<TransactionType, TransactionListItem[]>;

type BudgetListItem = {
  id: string;
  name: string;
  targetAmount: number | null;
  currentAmount: number;
  progressPercent: number;
  category: string | null;
  categoryEmoji: string | null;
  recurringContribution: number | null;
  contributionCadence: "none" | "monthly";
  targetDate: string | null;
  notificationCadence: "none" | "once" | "daily" | "monthly";
  nextNotificationAt: string | null;
  status: "active" | "completed" | "archived";
  createdAt: string;
};

const defaultUserTimeZone = "Asia/Kathmandu";

const setOnboardingCompletedCookie = (reply: {
  header: (name: string, value: string) => unknown;
}) => {
  reply.header(
    "set-cookie",
    `${onboardingCompletedCookieName}=1; Path=/; Max-Age=31536000; SameSite=Lax`,
  );
};

const toAppUser = (user: typeof users.$inferSelect) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  userProfile: user.userProfile,
  country: user.country,
  currency: user.currency,
  timezone: user.timezone,
  spendableAmount: Number(user.spendableBalance ?? 0),
  onboardingCompleted: user.onboardingCompleted,
});

const ensureUserProfile = async (user: typeof users.$inferSelect) => {
  if (user.userProfile) {
    return user;
  }

  const userProfile = getRandomDiceBearFunEmojiAvatarUrl();
  const [updatedUser] = await db
    .update(users)
    .set({
      userProfile,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
    .returning();

  return updatedUser ?? { ...user, userProfile };
};

const toMinor = (amount: number) => Math.round(amount * 100);

const formatMoney = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
};

const updateRecord = async ({
  request,
  reply,
  recordId,
  type,
}: {
  request: FastifyRequest;
  reply: FastifyReply;
  recordId: string;
  type: "expense" | "income" | "savings";
}) => {
  const parsed = recordUpdateSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({
      error: "validation_error",
      details: parsed.error.flatten(),
    });
  }

  const data = parsed.data;
  const [existingTransaction] = await db
    .select({
      id: transactions.id,
      amount: transactions.amount,
      title: transactions.title,
      description: transactions.description,
      categoryId: transactions.categoryId,
      occurredAt: transactions.occurredAt,
      isRecurring: transactions.isRecurring,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.id, recordId),
        eq(transactions.userId, getAuthenticatedUserId(request)),
        eq(transactions.type, type),
        isNull(transactions.deletedAt),
      ),
    )
    .limit(1);

  if (!existingTransaction) {
    return reply.code(404).send({ error: "record_not_found" });
  }

  let categoryId = existingTransaction.categoryId;
  let categoryName = data.category;
  let categoryEmoji: string | undefined;

  if (data.category) {
    const normalizedCategory = data.category.trim().toLowerCase();
    const [existingCategory] = await db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.userId, getAuthenticatedUserId(request)),
          eq(categories.kind, type),
          sql`lower(${categories.name}) = ${normalizedCategory}`,
        ),
      )
      .limit(1);

    if (existingCategory) {
      categoryId = existingCategory.id;
      categoryName = existingCategory.name;
      categoryEmoji = existingCategory.emoji;
    } else {
      const [insertedCategory] = await db
        .insert(categories)
        .values({
          userId: getAuthenticatedUserId(request),
          kind: type,
          name: normalizedCategory,
          emoji: resolveCategoryEmoji({ kind: type, name: normalizedCategory }),
        })
        .returning();

      categoryId = insertedCategory?.id ?? categoryId;
      categoryName = insertedCategory?.name ?? categoryName;
      categoryEmoji = insertedCategory?.emoji ?? categoryEmoji;
    }
  }

  if (categoryId && (!categoryName || !categoryEmoji)) {
    const [category] = await db
      .select({ name: categories.name, emoji: categories.emoji })
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1);

    categoryName = categoryName ?? category?.name;
    categoryEmoji = category?.emoji;
  }

  const nextOccurredAt =
    data.occurredAt ?? data.receivedAt ?? data.recordDatetime;
  const amount = data.amount ?? data.targetAmount;
  const title = data.title ?? data.sourceName;
  const [updatedTransaction] = await db
    .update(transactions)
    .set({
      ...(amount === undefined ? {} : { amount: amount.toFixed(2) }),
      ...(title ? { title } : {}),
      ...(data.description ? { description: data.description } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(nextOccurredAt ? { occurredAt: new Date(nextOccurredAt) } : {}),
      ...(data.recurrenceStatus
        ? { isRecurring: data.recurrenceStatus === "recurring" }
        : {}),
    })
    .where(
      and(
        eq(transactions.id, recordId),
        eq(transactions.userId, getAuthenticatedUserId(request)),
        eq(transactions.type, type),
        isNull(transactions.deletedAt),
      ),
    )
    .returning();

  if (!updatedTransaction) {
    return reply.code(404).send({ error: "record_not_found" });
  }

  const currency = data.currency ?? "NPR";
  const updatedAmount = Number(updatedTransaction.amount);
  const amountMinor = toMinor(updatedAmount);

  return {
    record: {
      ...(type === "expense" ? { expenseId: updatedTransaction.id } : {}),
      ...(type === "income" ? { incomeId: updatedTransaction.id } : {}),
      ...(type === "savings" ? { savingId: updatedTransaction.id } : {}),
      amountMinor,
      targetAmountMinor: type === "savings" ? amountMinor : null,
      currency,
      formattedAmount: formatMoney(updatedAmount, currency),
      formattedTargetAmount:
        type === "savings" ? formatMoney(updatedAmount, currency) : null,
      description: updatedTransaction.description,
      category: categoryName,
      categoryEmoji,
      sourceName: type === "income" ? updatedTransaction.title : undefined,
      title: updatedTransaction.title,
      recordDatetime: updatedTransaction.occurredAt.toISOString(),
      occurredAt: updatedTransaction.occurredAt.toISOString(),
      receivedAt:
        type === "income"
          ? updatedTransaction.occurredAt.toISOString()
          : undefined,
      recurrenceStatus: updatedTransaction.isRecurring
        ? "recurring"
        : "one_time",
      recurrenceCadence: updatedTransaction.isRecurring ? "monthly" : null,
      status: type === "savings" ? "active" : undefined,
    },
  };
};

const createEmptyTransactionGroups = (): TransactionGroups => ({
  expense: [],
  income: [],
  savings: [],
});

const buildTransactionSummary = (groups: TransactionGroups) => ({
  expense: summarizeTransactions(groups.expense),
  income: summarizeTransactions(groups.income),
  savings: summarizeTransactions(groups.savings),
  net:
    summarizeTransactions(groups.income).totalAmount -
    summarizeTransactions(groups.expense).totalAmount -
    summarizeTransactions(groups.savings).totalAmount,
});

const summarizeTransactions = (items: TransactionListItem[]) => ({
  count: items.length,
  totalAmount: items.reduce((total, item) => total + item.amount, 0),
});

const toBudgetListItem = (row: {
  id: string;
  name: string;
  targetAmount: string | null;
  currentAmount: string;
  category: string | null;
  categoryEmoji: string | null;
  recurringContribution: string | null;
  contributionCadence: "none" | "monthly";
  targetDate: string | null;
  notificationCadence: "none" | "once" | "daily" | "monthly";
  nextNotificationAt: Date | null;
  status: BudgetListItem["status"];
  createdAt: Date;
}): BudgetListItem => {
  const targetAmount =
    row.targetAmount === null ? null : Number(row.targetAmount);
  const currentAmount = Number(row.currentAmount);

  return {
    id: row.id,
    name: row.name,
    targetAmount,
    currentAmount,
    progressPercent:
      targetAmount && targetAmount > 0
        ? Math.min(100, Math.round((currentAmount / targetAmount) * 100))
        : 0,
    category: row.category,
    categoryEmoji: row.categoryEmoji,
    recurringContribution:
      row.recurringContribution === null
        ? null
        : Number(row.recurringContribution),
    contributionCadence: row.contributionCadence,
    targetDate: row.targetDate,
    notificationCadence: row.notificationCadence,
    nextNotificationAt: row.nextNotificationAt?.toISOString() ?? null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
};

const optionalString = (value: unknown) =>
  typeof value === "string" ? value : undefined;

const normalizeCategoryName = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

const dedupeKeywords = (keywords: string[] = []) =>
  Array.from(
    new Map(
      keywords
        .map((keyword) => keyword.trim())
        .filter(Boolean)
        .map((keyword) => [keyword.toLowerCase(), keyword] as const),
    ).values(),
  );

export const appRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/api/app/budget-notifications/due",
    {
      preHandler: requireAuth,
    },
    async (request) => {
      const session = getAuthenticatedSession(request);
      const currency = optionalString(session.user.currency) ?? "NPR";

      return {
        ok: true,
        notifications: await listDueBudgetNotifications({
          user: { id: getAuthenticatedUserId(request) },
          currency,
        }),
      };
    },
  );

  app.get(
    "/api/app/budget-notifications/audit",
    {
      preHandler: requireAuth,
    },
    async (request) => ({
      ok: true,
      logs: await listBudgetNotificationAuditLogs({
        user: { id: getAuthenticatedUserId(request) },
      }),
    }),
  );

  app.post(
    "/api/app/budget-notifications/:notificationId/delivery",
    {
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const parsed = notificationDeliverySchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          error: "validation_error",
          details: parsed.error.flatten(),
        });
      }

      const notificationId = (request.params as { notificationId?: string })
        .notificationId;

      if (!notificationId) {
        return reply.code(400).send({ ok: false, error: "missing_id" });
      }

      const log = await markBudgetNotificationDelivered({
        user: { id: getAuthenticatedUserId(request) },
        notificationId,
        channel: parsed.data.channel,
      });

      if (!log) {
        return reply
          .code(404)
          .send({ ok: false, error: "notification_not_found" });
      }

      return { ok: true };
    },
  );

  app.post(
    "/api/app/budget-notifications/:notificationId/dismiss",
    {
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const notificationId = (request.params as { notificationId?: string })
        .notificationId;

      if (!notificationId) {
        return reply.code(400).send({ ok: false, error: "missing_id" });
      }

      const log = await dismissBudgetNotification({
        user: { id: getAuthenticatedUserId(request) },
        notificationId,
      });

      if (!log) {
        return reply
          .code(404)
          .send({ ok: false, error: "notification_not_found" });
      }

      return { ok: true };
    },
  );

  app.get(
    "/api/app/me",
    {
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, getAuthenticatedUserId(request)))
        .limit(1);

      if (!user) {
        return reply.code(404).send({ error: "user_not_found" });
      }

      return {
        user: toAppUser(await ensureUserProfile(user)),
      };
    },
  );

  app.patch(
    "/api/app/me",
    {
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const parsed = profileUpdateSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          error: "validation_error",
          details: parsed.error.flatten(),
        });
      }

      const updates: {
        name?: string;
        country?: string;
        currency?: string;
        userProfile?: string | null;
        updatedAt: Date;
      } = {
        updatedAt: new Date(),
      };

      if (parsed.data.name !== undefined) {
        updates.name = parsed.data.name;
      }

      if (parsed.data.country !== undefined) {
        updates.country = parsed.data.country;
      }

      if (parsed.data.currency !== undefined) {
        updates.currency = parsed.data.currency;
      }

      if (parsed.data.userProfile !== undefined) {
        updates.userProfile = parsed.data.userProfile;
      }

      const [updatedUser] = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, getAuthenticatedUserId(request)))
        .returning();

      if (!updatedUser) {
        return reply.code(404).send({ error: "user_not_found" });
      }

      return { user: toAppUser(updatedUser) };
    },
  );

  app.patch(
    "/api/app/me/onboarding",
    {
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const parsed = onboardingSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          error: "validation_error",
          details: parsed.error.flatten(),
        });
      }

      setOnboardingCompletedCookie(reply);

      const [updatedUser] = await db
        .update(users)
        .set({
          name: parsed.data.displayName,
          country: parsed.data.country,
          currency: parsed.data.currency.toUpperCase(),
          onboardingCompleted: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, getAuthenticatedUserId(request)))
        .returning();

      if (!updatedUser) {
        return reply.code(404).send({ error: "user_not_found" });
      }

      return { user: toAppUser(updatedUser) };
    },
  );

  app.get(
    "/api/app/categories",
    {
      preHandler: requireAuth,
    },
    async (request) => {
      const rows = await db
        .select({
          id: categories.id,
          kind: categories.kind,
          name: categories.name,
          emoji: categories.emoji,
          keywords: categories.keywords,
          isDefault: sql<boolean>`${categories.userId} IS NULL`,
        })
        .from(categories)
        .where(
          sql`${categories.userId} = ${getAuthenticatedUserId(request)} OR ${categories.userId} IS NULL`,
        )
        .orderBy(categories.kind, categories.name);

      return {
        categories: rows,
      };
    },
  );

  app.get(
    "/api/app/budgets",
    {
      preHandler: requireAuth,
    },
    async (request) => {
      const rows = await db
        .select({
          id: budgets.id,
          name: budgets.name,
          targetAmount: budgets.targetAmount,
          currentAmount: budgets.currentAmount,
          category: categories.name,
          categoryEmoji: categories.emoji,
          recurringContribution: budgets.recurringContribution,
          contributionCadence: budgets.contributionCadence,
          targetDate: budgets.targetDate,
          notificationCadence: budgets.notificationCadence,
          nextNotificationAt: budgets.nextNotificationAt,
          status: budgets.status,
          createdAt: budgets.createdAt,
        })
        .from(budgets)
        .leftJoin(categories, eq(budgets.categoryId, categories.id))
        .where(
          and(
            eq(budgets.userId, getAuthenticatedUserId(request)),
            eq(budgets.status, "active"),
          ),
        )
        .orderBy(desc(budgets.updatedAt), desc(budgets.createdAt))
        .limit(12);

      return {
        budgets: rows.map(toBudgetListItem),
      };
    },
  );

  app.post(
    "/api/app/budgets",
    {
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const parsed = createBudgetInputSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          error: "validation_error",
          details: parsed.error.flatten(),
        });
      }

      const session = getAuthenticatedSession(request);
      const currency = optionalString(session.user.currency) ?? "NPR";
      const result = await createBudget({
        user: { id: getAuthenticatedUserId(request), currency },
        input: parsed.data,
        now: new Date(),
      });

      if (result.toolCalls.length === 0) {
        return reply.code(409).send({
          error: "budget_not_created",
          message: result.response,
        });
      }

      return {
        ok: true,
        message: result.response,
        toolCalls: result.toolCalls,
      };
    },
  );

  app.post(
    "/api/app/categories",
    {
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const parsed = categoryCreateSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          error: "validation_error",
          details: parsed.error.flatten(),
        });
      }

      const name = normalizeCategoryName(parsed.data.name);
      const [existingCategory] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            sql`lower(${categories.name}) = ${name}`,
            sql`(${categories.userId} = ${getAuthenticatedUserId(request)} OR ${categories.userId} IS NULL)`,
          ),
        )
        .limit(1);

      if (existingCategory) {
        return reply.code(409).send({
          error: "category_exists",
          message: "This category already exists.",
        });
      }

      const [category] = await db
        .insert(categories)
        .values({
          userId: getAuthenticatedUserId(request),
          kind: parsed.data.kind,
          name,
          emoji: resolveCategoryEmoji({ kind: parsed.data.kind, name }),
          keywords: dedupeKeywords(parsed.data.keywords),
        })
        .returning({
          id: categories.id,
          kind: categories.kind,
          name: categories.name,
          emoji: categories.emoji,
          keywords: categories.keywords,
        });

      return reply.code(201).send({
        category: category ? { ...category, isDefault: false } : null,
      });
    },
  );

  app.patch(
    "/api/app/records/expenses/:recordId",
    {
      preHandler: requireAuth,
    },
    async (request, reply) =>
      updateRecord({
        request,
        reply,
        recordId: (request.params as { recordId: string }).recordId,
        type: "expense",
      }),
  );

  app.patch(
    "/api/app/records/incomes/:recordId",
    {
      preHandler: requireAuth,
    },
    async (request, reply) =>
      updateRecord({
        request,
        reply,
        recordId: (request.params as { recordId: string }).recordId,
        type: "income",
      }),
  );

  app.patch(
    "/api/app/records/savings/:recordId",
    {
      preHandler: requireAuth,
    },
    async (request, reply) =>
      updateRecord({
        request,
        reply,
        recordId: (request.params as { recordId: string }).recordId,
        type: "savings",
      }),
  );

  app.post(
    "/api/app/records/transactions",
    {
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const parsed = manualTransactionSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          error: "validation_error",
          details: parsed.error.flatten(),
        });
      }

      const session = getAuthenticatedSession(request);
      const timezone = optionalString(session.user.timezone);
      let saved: Awaited<ReturnType<typeof createTransactionRecord>>;

      try {
        saved = await createTransactionRecord({
          user: {
            id: getAuthenticatedUserId(request),
            email: session.user.email,
            name: session.user.name,
            ...(parsed.data.currency ? { currency: parsed.data.currency } : {}),
            ...(timezone ? { timezone } : {}),
          },
          input: {
            type: parsed.data.type,
            amount: parsed.data.amount,
            category: parsed.data.category,
            description: parsed.data.description,
            occurred_at: parsed.data.occurredAt,
            ...(parsed.data.merchant ? { merchant: parsed.data.merchant } : {}),
            ...(parsed.data.savingsInstrument
              ? { savings_instrument: parsed.data.savingsInstrument }
              : {}),
            ...(parsed.data.isRecurring === undefined
              ? {}
              : { is_recurring: parsed.data.isRecurring }),
          },
        });
      } catch (error) {
        if (error instanceof TransactionCategoryRequiredError) {
          return reply.code(409).send({
            ok: false,
            error: "category_required",
            message: `Create ${error.category} as an ${error.type} category first, or choose one of your saved categories.`,
            availableCategories: error.availableCategories,
          });
        }

        throw error;
      }

      return {
        ok: true,
        message: "Transaction saved.",
        record: saved.result,
        toolCall: saved.toolCall,
      };
    },
  );

  app.get(
    "/api/app/transactions",
    {
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const parsedQuery = transactionRangeQuerySchema.safeParse(
        request.query ?? {},
      );

      if (!parsedQuery.success) {
        return reply.code(400).send({
          ok: false,
          error: "validation_error",
          details: parsedQuery.error.flatten(),
        });
      }

      const session = getAuthenticatedSession(request);
      const sessionCurrency =
        typeof session.user.currency === "string"
          ? session.user.currency
          : "NPR";
      const sessionTimeZone =
        optionalString(session.user.timezone) ?? defaultUserTimeZone;
      const [user] = await db
        .select({ currency: users.currency, timezone: users.timezone })
        .from(users)
        .where(eq(users.id, getAuthenticatedUserId(request)))
        .limit(1);
      const timeZone = user?.timezone ?? sessionTimeZone;
      const dateRange = resolveTransactionDateRange({
        ...parsedQuery.data,
        timeZone,
      });

      if (!dateRange.ok) {
        return reply.code(400).send({
          ok: false,
          error: dateRange.error,
          message: dateRange.message,
        });
      }

      const groups = createEmptyTransactionGroups();
      const rows = await db
        .select({
          id: transactions.id,
          type: transactions.type,
          amount: transactions.amount,
          title: transactions.title,
          description: transactions.description,
          merchant: transactions.merchant,
          category: categories.name,
          categoryEmoji: categories.emoji,
          savingsInstrument: savingsInstruments.name,
          isRecurring: transactions.isRecurring,
          occurredAt: transactions.occurredAt,
          createdAt: transactions.createdAt,
        })
        .from(transactions)
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .leftJoin(
          savingsInstruments,
          eq(transactions.savingsInstrumentId, savingsInstruments.id),
        )
        .where(
          and(
            eq(transactions.userId, getAuthenticatedUserId(request)),
            isNull(transactions.deletedAt),
            gte(transactions.occurredAt, dateRange.startDate),
            lt(transactions.occurredAt, dateRange.endDate),
          ),
        )
        .orderBy(desc(transactions.occurredAt), desc(transactions.createdAt))
        .limit(200);

      for (const row of rows) {
        groups[row.type].push({
          id: row.id,
          type: row.type,
          title: row.title,
          description: row.description,
          amount: Number(row.amount),
          merchant: row.merchant,
          category: row.category,
          categoryEmoji: row.categoryEmoji,
          savingsInstrument: row.savingsInstrument,
          isRecurring: row.isRecurring,
          occurredAt: row.occurredAt.toISOString(),
          createdAt: row.createdAt.toISOString(),
        });
      }

      return {
        currency: user?.currency ?? sessionCurrency,
        timeZone,
        range: {
          period: dateRange.period,
          startDate: dateRange.startDate.toISOString(),
          endDate: dateRange.endDate.toISOString(),
        },
        transactions: groups,
        summary: buildTransactionSummary(groups),
      };
    },
  );
};
