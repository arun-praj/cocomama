import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  categories,
  savingsInstruments,
  transactions,
  users,
} from "../db/schema.js";
import type {
  CreateTransactionInput,
  ModifyTransactionInput,
  TransactionType,
} from "../tools/types.js";
import { inferSpecificExpenseCategoryName } from "./expense-category-inference-service.js";
import { resolveCategoryEmoji } from "./category-emoji-service.js";
import { getRandomDiceBearFunEmojiAvatarUrl } from "./profile-avatar-service.js";

export interface TransactionUserContext {
  id: string;
  email?: string;
  name?: string;
  currency?: string;
  timezone?: string;
}

export interface FinancialRecordResult {
  expenseId?: string;
  incomeId?: string;
  savingId?: string;
  amountMinor?: number;
  originalAmountMinor?: number | null;
  originalCurrency?: string | null;
  exchangeRate?: string | null;
  exchangeRateSource?: string | null;
  targetAmountMinor?: number | null;
  currency?: string;
  formattedAmount?: string;
  formattedTargetAmount?: string | null;
  description?: string;
  category?: string;
  categoryEmoji?: string;
  sourceName?: string;
  title?: string;
  recordDatetime?: string;
  occurredAt?: string;
  receivedAt?: string;
  recurrenceStatus?: "one_time" | "recurring";
  recurrenceCadence?: "monthly" | null;
  status?: "active" | "completed" | "archived";
}

export interface ChatToolCallSummary {
  name:
    | "record_expense"
    | "record_income"
    | "prepare_saving_goal"
    | "query_transactions"
    | "query_user"
    | "query_categories"
    | "clarify"
    | "modify_transaction"
    | "create_category"
    | "update_category"
    | "delete_category"
    | "create_budget"
    | "allocate_to_budget"
    | "query_budgets"
    | "update_budget"
    | "delete_budget";
  label: string;
  status: "success" | "error";
  input: Record<string, unknown>;
  result?: FinancialRecordResult;
}

export class TransactionCategoryRequiredError extends Error {
  readonly code = "category_required";
  readonly category: string;
  readonly type: TransactionType;
  readonly availableCategories: string[];

  constructor({
    category,
    type,
    availableCategories,
  }: {
    category: string;
    type: TransactionType;
    availableCategories: string[];
  }) {
    super(`Category ${category} does not exist for ${type}`);
    this.category = category;
    this.type = type;
    this.availableCategories = availableCategories;
  }
}

const normalizeName = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

const tokenizeName = (value: string) =>
  normalizeName(value)
    .split(/[^a-z0-9]+/i)
    .filter((part) => part.length >= 3);

const genericCategoryTokens = new Set([
  "account",
  "category",
  "cash",
  "expense",
  "expenses",
  "fund",
  "income",
  "money",
  "other",
  "payment",
  "payments",
  "personal",
  "savings",
  "transaction",
]);

const tokenizeForCategoryMatch = (value: string) =>
  tokenizeName(value).filter((token) => !genericCategoryTokens.has(token));

const autoCreateCategoryDenyList = new Set([
  "misc",
  "miscellaneous",
  "other",
  "shopping",
  "uncategorized",
]);

const isAutoCreatableCategoryName = (value: string) => {
  const normalizedName = normalizeName(value);

  return (
    normalizedName.length >= 3 &&
    !autoCreateCategoryDenyList.has(normalizedName)
  );
};

const titleCase = (value: string) =>
  value
    .split(" ")
    .filter(Boolean)
    .map(
      (part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`,
    )
    .join(" ");

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

const currencyRatesToNpr: Record<string, number> = {
  NPR: 1,
  USD: 135,
  INR: 1.6,
  EUR: 150,
};

const normalizeCurrency = (currency?: string) =>
  currency?.trim().toUpperCase() ?? "NPR";

const convertCurrencyAmount = ({
  amount,
  sourceCurrency,
  targetCurrency,
}: {
  amount: number;
  sourceCurrency?: string;
  targetCurrency: string;
}) => {
  const normalizedSourceCurrency = normalizeCurrency(sourceCurrency);
  const normalizedTargetCurrency = normalizeCurrency(targetCurrency);

  if (normalizedSourceCurrency === normalizedTargetCurrency) {
    return {
      amount,
      originalAmount: null,
      originalCurrency: null,
      exchangeRate: null,
    };
  }

  const sourceRate = currencyRatesToNpr[normalizedSourceCurrency];
  const targetRate = currencyRatesToNpr[normalizedTargetCurrency];

  if (!sourceRate || !targetRate) {
    return {
      amount,
      originalAmount: null,
      originalCurrency: null,
      exchangeRate: null,
    };
  }

  const exchangeRate = sourceRate / targetRate;

  return {
    amount: Math.round(amount * exchangeRate * 100) / 100,
    originalAmount: amount,
    originalCurrency: normalizedSourceCurrency,
    exchangeRate,
  };
};

const getCategoryMatchScore = ({
  category,
  candidates,
}: {
  category: { name: string; keywords: string[] };
  candidates: string[];
}) => {
  const normalizedCandidates = candidates.map(normalizeName).filter(Boolean);
  const categoryName = normalizeName(category.name);
  const categoryNameTokens = new Set(tokenizeForCategoryMatch(category.name));
  const keywordEntries = category.keywords.map((keyword) => ({
    phrase: normalizeName(keyword),
    tokens: new Set(tokenizeForCategoryMatch(keyword)),
  }));
  let bestScore = 0;

  for (const candidate of normalizedCandidates) {
    const candidateTokens = new Set(tokenizeForCategoryMatch(candidate));

    if (candidate === categoryName) {
      bestScore = Math.max(bestScore, 1_000);
    }

    if (
      candidate.length >= 4 &&
      categoryName.length >= 4 &&
      (candidate.includes(categoryName) || categoryName.includes(candidate))
    ) {
      bestScore = Math.max(bestScore, 700);
    }

    const categoryNameOverlap = [...categoryNameTokens].filter((token) =>
      candidateTokens.has(token),
    ).length;

    if (categoryNameOverlap > 0) {
      bestScore = Math.max(bestScore, 100 + categoryNameOverlap * 20);
    }

    for (const keyword of keywordEntries) {
      if (!keyword.phrase) {
        continue;
      }

      if (candidate === keyword.phrase) {
        bestScore = Math.max(bestScore, 900);
      }

      if (
        candidate.length >= 4 &&
        keyword.phrase.length >= 4 &&
        (candidate.includes(keyword.phrase) ||
          keyword.phrase.includes(candidate))
      ) {
        bestScore = Math.max(bestScore, 500);
      }

      const keywordOverlap = [...keyword.tokens].filter((token) =>
        candidateTokens.has(token),
      ).length;

      if (keywordOverlap > 0) {
        bestScore = Math.max(bestScore, 40 + keywordOverlap * 10);
      }
    }
  }

  return bestScore;
};

const getToolName = (type: TransactionType): ChatToolCallSummary["name"] => {
  if (type === "expense") {
    return "record_expense";
  }

  if (type === "income") {
    return "record_income";
  }

  return "prepare_saving_goal";
};

const getRecordIdKey = (type: TransactionType) => {
  if (type === "expense") {
    return "expenseId" as const;
  }

  if (type === "income") {
    return "incomeId" as const;
  }

  return "savingId" as const;
};

export const ensureUserForTransactions = async (
  user: TransactionUserContext,
) => {
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (existingUser) {
    return existingUser;
  }

  const email = user.email ?? `${user.id}@local.cocomama`;
  const [insertedUser] = await db
    .insert(users)
    .values({
      id: user.id,
      name: user.name ?? email.split("@")[0] ?? "Cocomama member",
      email,
      currency: user.currency ?? "NPR",
      timezone: user.timezone ?? "Asia/Kathmandu",
      userProfile: getRandomDiceBearFunEmojiAvatarUrl(),
      onboardingCompleted: true,
    })
    .onConflictDoNothing()
    .returning();

  if (insertedUser) {
    return insertedUser;
  }

  const [createdByRaceUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!createdByRaceUser) {
    throw new Error("Could not ensure transaction user exists");
  }

  return createdByRaceUser;
};

const resolveCategory = async (
  userId: string,
  type: TransactionType,
  categoryName: string,
  candidates: string[] = [],
  suggestedNewCategory?: string,
) => {
  const normalizedCategory = normalizeName(categoryName || "other");
  const categoryRows = await db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.kind, type),
        sql`(${categories.userId} = ${userId} OR ${categories.userId} IS NULL)`,
      ),
    );
  const userCategories = [...categoryRows].sort((left, right) => {
    if (left.userId === right.userId) {
      return left.name.localeCompare(right.name);
    }

    return left.userId === null ? 1 : -1;
  });
  const exactCategory = userCategories.find(
    (category) => normalizeName(category.name) === normalizedCategory,
  );
  const specificExpenseCategory =
    type === "expense"
      ? inferSpecificExpenseCategoryName([
          categoryName,
          suggestedNewCategory,
          ...candidates,
        ])
      : undefined;
  const autoCreateCategoryName =
    specificExpenseCategory ?? suggestedNewCategory?.trim();

  if (
    autoCreateCategoryName &&
    isAutoCreatableCategoryName(autoCreateCategoryName)
  ) {
    const normalizedAutoCreateCategory = normalizeName(autoCreateCategoryName);
    const existingAutoCreateCategory = userCategories.find(
      (category) =>
        normalizeName(category.name) === normalizedAutoCreateCategory,
    );

    if (existingAutoCreateCategory) {
      return existingAutoCreateCategory;
    }

    const displayName = titleCase(autoCreateCategoryName);
    const [insertedCategory] = await db
      .insert(categories)
      .values({
        userId,
        kind: type,
        name: displayName,
        emoji: resolveCategoryEmoji({ kind: type, name: displayName }),
        keywords: [displayName],
      })
      .onConflictDoNothing()
      .returning();

    if (insertedCategory) {
      return insertedCategory;
    }

    const [createdByRaceCategory] = await db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.userId, userId),
          eq(categories.kind, type),
          sql`lower(${categories.name}) = ${normalizedAutoCreateCategory}`,
        ),
      )
      .limit(1);

    if (createdByRaceCategory) {
      return createdByRaceCategory;
    }
  }

  if (exactCategory) {
    return exactCategory;
  }

  const [inferredCategory] = userCategories
    .map((category) => ({
      category,
      score: getCategoryMatchScore({
        category,
        candidates: [normalizedCategory, ...candidates],
      }),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score);

  if (inferredCategory) {
    return inferredCategory.category;
  }

  throw new TransactionCategoryRequiredError({
    category: normalizedCategory,
    type,
    availableCategories: userCategories.map((category) => category.name),
  });
};

const ensureSavingsInstrument = async (
  userId: string,
  savingsInstrumentName?: string,
) => {
  if (!savingsInstrumentName) {
    return null;
  }

  const normalizedName = normalizeName(savingsInstrumentName);
  const [existingInstrument] = await db
    .select()
    .from(savingsInstruments)
    .where(
      and(
        eq(savingsInstruments.userId, userId),
        sql`lower(${savingsInstruments.name}) = ${normalizedName}`,
      ),
    )
    .limit(1);

  if (existingInstrument) {
    return existingInstrument;
  }

  const [insertedInstrument] = await db
    .insert(savingsInstruments)
    .values({
      userId,
      kind: "other",
      name: normalizedName,
    })
    .returning();

  if (!insertedInstrument) {
    throw new Error("Could not create savings instrument");
  }

  return insertedInstrument;
};

const buildRecordResult = ({
  id,
  input,
  currency,
  category,
  categoryEmoji,
  convertedAmount,
}: {
  id: string;
  input: CreateTransactionInput;
  currency: string;
  category: string;
  categoryEmoji: string;
  convertedAmount: ReturnType<typeof convertCurrencyAmount>;
}): FinancialRecordResult => {
  const amountMinor = toMinor(convertedAmount.amount);
  const recordDate = new Date(input.occurred_at).toISOString();
  const title = input.title ?? titleCase(input.description);
  const recordIdKey = getRecordIdKey(input.type);
  const result: FinancialRecordResult = {
    [recordIdKey]: id,
    amountMinor,
    originalAmountMinor:
      convertedAmount.originalAmount === null
        ? null
        : toMinor(convertedAmount.originalAmount),
    originalCurrency: convertedAmount.originalCurrency,
    exchangeRate:
      convertedAmount.exchangeRate === null
        ? null
        : convertedAmount.exchangeRate.toFixed(6),
    exchangeRateSource:
      convertedAmount.exchangeRate === null ? null : "static_fallback",
    targetAmountMinor: input.type === "savings" ? amountMinor : null,
    currency,
    formattedAmount: formatMoney(convertedAmount.amount, currency),
    formattedTargetAmount:
      input.type === "savings"
        ? formatMoney(convertedAmount.amount, currency)
        : null,
    description: input.description,
    category,
    categoryEmoji,
    title,
    recordDatetime: recordDate,
    occurredAt: recordDate,
    recurrenceStatus: input.is_recurring ? "recurring" : "one_time",
    recurrenceCadence: input.is_recurring ? "monthly" : null,
  };

  if (input.type === "income") {
    result.sourceName = input.description;
    result.receivedAt = recordDate;
  }

  if (input.type === "savings") {
    result.status = "active";
  }

  return result;
};

export const createTransactionRecord = async ({
  user,
  input,
}: {
  user: TransactionUserContext;
  input: CreateTransactionInput;
}) => {
  const transactionUser = await ensureUserForTransactions(user);
  const targetCurrency = normalizeCurrency(transactionUser.currency);
  const sourceCurrency = input.original_currency ?? input.currency;
  const convertedAmount = convertCurrencyAmount({
    amount: input.amount,
    ...(sourceCurrency ? { sourceCurrency } : {}),
    targetCurrency,
  });
  const category = await resolveCategory(
    transactionUser.id,
    input.type,
    input.category || "other",
    [input.title, input.description, input.merchant].filter(
      (candidate): candidate is string => Boolean(candidate),
    ),
    input.suggested_new_category,
  );
  const savingsInstrument = await ensureSavingsInstrument(
    transactionUser.id,
    input.savings_instrument,
  );
  const occurredAt = new Date(input.occurred_at);

  if (Number.isNaN(occurredAt.getTime())) {
    throw new Error("Invalid transaction date");
  }

  const [insertedTransaction] = await db
    .insert(transactions)
    .values({
      userId: transactionUser.id,
      type: input.type,
      amount: convertedAmount.amount.toFixed(2),
      categoryId: category.id,
      savingsInstrumentId: savingsInstrument?.id,
      merchant: input.merchant,
      title: input.title ?? titleCase(input.description),
      description: input.description,
      tags: input.tags,
      isRecurring: input.is_recurring ?? false,
      occurredAt,
    })
    .returning();

  if (!insertedTransaction) {
    throw new Error("Could not save transaction");
  }

  const result = buildRecordResult({
    id: insertedTransaction.id,
    input,
    currency: targetCurrency,
    category: category.name,
    categoryEmoji: category.emoji,
    convertedAmount,
  });
  const toolCall: ChatToolCallSummary = {
    name: getToolName(input.type),
    label:
      input.type === "expense"
        ? "Expense saved"
        : input.type === "income"
          ? "Income saved"
          : "Saving saved",
    status: "success",
    input: input as unknown as Record<string, unknown>,
    result,
  };

  return {
    transaction: insertedTransaction,
    result,
    toolCall,
  };
};

export const modifyTransactionRecord = async ({
  user,
  input,
}: {
  user: TransactionUserContext;
  input: ModifyTransactionInput;
}) => {
  await ensureUserForTransactions(user);

  if (input.delete) {
    const [deletedTransaction] = await db
      .update(transactions)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(transactions.id, input.transaction_id),
          eq(transactions.userId, user.id),
          isNull(transactions.deletedAt),
        ),
      )
      .returning();

    if (!deletedTransaction) {
      return {
        response: `### Transaction not found\n\nI could not find an active transaction with id **${input.transaction_id}**.`,
        toolCalls: [],
      };
    }

    const toolCall: ChatToolCallSummary = {
      name: "modify_transaction",
      label: "Transaction deleted",
      status: "success",
      input: input as unknown as Record<string, unknown>,
      result: {
        title: deletedTransaction.title,
        description: deletedTransaction.description,
        amountMinor: toMinor(Number(deletedTransaction.amount)),
        occurredAt: deletedTransaction.occurredAt.toISOString(),
      },
    };

    return {
      response: `### Transaction deleted\n\n**Title:** ${deletedTransaction.title}\n**Amount:** ${formatMoney(Number(deletedTransaction.amount), user.currency ?? "NPR")}`,
      toolCalls: [toolCall],
    };
  }

  return {
    response:
      "### Transaction update not supported yet\n\nI can delete transactions now. Editing transaction fields will be added separately.",
    toolCalls: [],
  };
};
