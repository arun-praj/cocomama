import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { budgets, categories } from "../db/schema.js";
import {
  clarifyInputSchema,
  allocateToBudgetInputSchema,
  createCategoryInputSchema,
  createBudgetInputSchema,
  createTransactionInputSchema,
  deleteCategoryInputSchema,
  deleteBudgetInputSchema,
  modifyTransactionInputSchema,
  queryCategoriesInputSchema,
  queryBudgetsInputSchema,
  queryUserInputSchema,
  queryTransactionsInputSchema,
  updateBudgetInputSchema,
  updateCategoryInputSchema,
} from "../tools/schemas.js";
import type {
  AllocateToBudgetInput,
  CreateCategoryInput,
  CreateBudgetInput,
  CreateTransactionInput,
  DeleteCategoryInput,
  DeleteBudgetInput,
  ModifyTransactionInput,
  QueryBudgetsInput,
  QueryCategoriesInput,
  QueryUserInput,
  QueryTransactionsInput,
  ToolName,
  UpdateBudgetInput,
  UpdateCategoryInput,
} from "../tools/types.js";
import { buildSystemPrompt } from "./system-prompt-service.js";
import type { PromptCategory } from "./system-prompt-service.js";
import {
  allocateToBudget,
  createBudget,
  deleteBudget,
  queryBudgets,
  updateBudget,
  type BudgetUserContext,
} from "./budget-tool-service.js";
import {
  createCategory,
  deleteCategory,
  queryCategories,
  updateCategory,
  type CategoryUserContext,
} from "./category-tool-service.js";
import {
  createTransactionRecord,
  type ChatToolCallSummary,
  modifyTransactionRecord,
  TransactionCategoryRequiredError,
  type TransactionUserContext,
} from "./transaction-record-service.js";
import {
  queryTransactions,
  type TransactionQueryUserContext,
} from "./transaction-query-service.js";
import { queryUser, type UserQueryContext } from "./user-query-service.js";
import {
  dateOnlyPattern,
  formatDateOnlyInTimeZone,
  resolveDateOnlyWithCurrentTime,
} from "./time-zone-date-service.js";
import {
  createLlmGateway,
  LlmGatewayError,
  type LlmChatCompletionRequest,
  type LlmChatCompletionResponse,
  type LlmMessage,
} from "./llm-gateway.js";

export interface ChatUserContext
  extends
    TransactionUserContext,
    CategoryUserContext,
    BudgetUserContext,
    TransactionQueryUserContext,
    UserQueryContext {}

export interface ChatRequest {
  userId: string;
  user?: ChatUserContext;
  message: string;
  conversationId?: string;
  history?: LlmMessage[];
  signal?: AbortSignal;
}

export interface ChatResponse {
  ok: boolean;
  data?: {
    response: string;
    model: string;
    conversationId: string;
    toolCalls?: ChatToolCallSummary[];
  };
  error?: {
    code: "llm_error" | "not_implemented";
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface ChatGateway {
  createChatCompletion(
    request: LlmChatCompletionRequest,
  ): Promise<LlmChatCompletionResponse>;
}

export type CreateTransactionRecorder = (request: {
  user: ChatUserContext;
  input: CreateTransactionInput;
}) => Promise<{
  toolCall: ChatToolCallSummary;
}>;

export type ModifyTransactionExecutor = (request: {
  user: ChatUserContext;
  input: ModifyTransactionInput;
}) => Promise<{ response: string; toolCalls: ChatToolCallSummary[] }>;

export interface CategoryToolExecutor {
  createCategory(request: {
    user: ChatUserContext;
    input: CreateCategoryInput;
  }): Promise<{ response: string; toolCalls: ChatToolCallSummary[] }>;
  updateCategory(request: {
    user: ChatUserContext;
    input: UpdateCategoryInput;
  }): Promise<{ response: string; toolCalls: ChatToolCallSummary[] }>;
  deleteCategory(request: {
    user: ChatUserContext;
    input: DeleteCategoryInput;
  }): Promise<{ response: string; toolCalls: ChatToolCallSummary[] }>;
  queryCategories(request: {
    user: ChatUserContext;
    input: QueryCategoriesInput;
  }): Promise<{ response: string; toolCalls: ChatToolCallSummary[] }>;
}

export interface BudgetToolExecutor {
  createBudget(request: {
    user: ChatUserContext;
    input: CreateBudgetInput;
    now?: Date;
  }): Promise<{ response: string; toolCalls: ChatToolCallSummary[] }>;
  allocateToBudget(request: {
    user: ChatUserContext;
    input: AllocateToBudgetInput;
    now?: Date;
  }): Promise<{ response: string; toolCalls: ChatToolCallSummary[] }>;
  queryBudgets(request: {
    user: ChatUserContext;
    input: QueryBudgetsInput;
  }): Promise<{ response: string; toolCalls: ChatToolCallSummary[] }>;
  updateBudget(request: {
    user: ChatUserContext;
    input: UpdateBudgetInput;
    now?: Date;
  }): Promise<{ response: string; toolCalls: ChatToolCallSummary[] }>;
  deleteBudget(request: {
    user: ChatUserContext;
    input: DeleteBudgetInput;
  }): Promise<{ response: string; toolCalls: ChatToolCallSummary[] }>;
}

export type QueryTransactionsExecutor = (request: {
  user: ChatUserContext;
  input: QueryTransactionsInput;
}) => Promise<{ response: string; toolCalls: ChatToolCallSummary[] }>;

export type QueryUserExecutor = (request: {
  user: ChatUserContext;
  input: QueryUserInput;
}) => Promise<{ response: string; toolCalls: ChatToolCallSummary[] }>;

interface ConversationRecord {
  userId: string;
  messages: LlmMessage[];
}

interface ToolPayload {
  tool: ToolName;
  input: Record<string, unknown>;
}

type ToolExecutionResult =
  | {
      ok: true;
      response: string;
      toolCalls: ChatToolCallSummary[];
    }
  | {
      ok: false;
      error: NonNullable<ChatResponse["error"]>;
    };

export interface ChatOrchestratorOptions {
  gateway?: ChatGateway;
  recordTransaction?: CreateTransactionRecorder;
  modifyTransactionTool?: ModifyTransactionExecutor;
  categoryTools?: CategoryToolExecutor;
  budgetTools?: BudgetToolExecutor;
  queryTransactionsTool?: QueryTransactionsExecutor;
  queryUserTool?: QueryUserExecutor;
  now?: () => Date;
  maxHistoryMessages?: number;
}

const conversations = new Map<string, ConversationRecord>();

const trimHistory = (messages: LlmMessage[], maxHistoryMessages: number) =>
  messages.slice(Math.max(0, messages.length - maxHistoryMessages));

const providerUnavailableMessage =
  "The AI provider is temporarily at capacity, so I could not generate a fresh answer right now. Your message was received, but no finance action was applied. Please try again in a minute.";

const toolNames = new Set<ToolName>([
  "create_transaction",
  "query_transactions",
  "query_categories",
  "create_budget",
  "allocate_to_budget",
  "query_budgets",
  "query_user",
  "clarify",
  "create_category",
  "update_category",
  "delete_category",
  "delete_budget",
  "modify_transaction",
  "update_budget",
  "modify_budget_allocation",
  "spend_from_budget",
]);

const parseJsonValue = (content: string) => {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return null;
  }
};

const extractJsonValues = (content: string) => {
  const trimmedContent = content.trim();
  const fencedMatch = trimmedContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmedContent;
  const parsedCandidate = parseJsonValue(candidate);

  if (parsedCandidate) {
    return [parsedCandidate];
  }

  const values: unknown[] = [];
  let startIndex = -1;
  let depth = 0;
  let isInsideString = false;
  let isEscaped = false;

  for (let index = 0; index < candidate.length; index += 1) {
    const character = candidate[index];

    if (isInsideString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (character === "\\") {
        isEscaped = true;
      } else if (character === '"') {
        isInsideString = false;
      }

      continue;
    }

    if (character === '"') {
      isInsideString = true;
      continue;
    }

    if (character === "{" || character === "[") {
      if (depth === 0) {
        startIndex = index;
      }

      depth += 1;
      continue;
    }

    if (character === "}" || character === "]") {
      depth -= 1;

      if (depth === 0 && startIndex !== -1) {
        const parsed = parseJsonValue(candidate.slice(startIndex, index + 1));

        if (parsed) {
          values.push(parsed);
        }

        startIndex = -1;
      }
    }
  }

  return values;
};

const getInputFromRecord = (record: Record<string, unknown>) => {
  if (record.input && typeof record.input === "object") {
    return record.input as Record<string, unknown>;
  }

  if (record.arguments && typeof record.arguments === "object") {
    return record.arguments as Record<string, unknown>;
  }

  return Object.fromEntries(
    Object.entries(record).filter(
      ([key]) => key !== "tool" && key !== "name" && key !== "arguments",
    ),
  );
};

const normalizeToolPayload = (value: unknown): ToolPayload[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeToolPayload(item));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;

  for (const key of ["tool_calls", "toolCalls", "tools", "calls", "actions"]) {
    if (Array.isArray(record[key])) {
      return record[key].flatMap((item) => normalizeToolPayload(item));
    }
  }

  const tool = record.tool ?? record.name;

  if (
    !tool &&
    typeof record.type === "string" &&
    typeof record.amount === "number" &&
    typeof record.category === "string" &&
    typeof record.description === "string"
  ) {
    const { date: bareDate, ...transactionInput } = record;

    return [
      {
        tool: "create_transaction" as const,
        input: {
          ...transactionInput,
          occurred_at: record.occurred_at ?? bareDate,
        },
      } satisfies ToolPayload,
    ];
  }

  if (typeof tool !== "string" || !toolNames.has(tool as ToolName)) {
    return [];
  }

  return [
    {
      tool: tool as ToolName,
      input: getInputFromRecord(record),
    },
  ];
};

const queryPayloadKey = (payload: ToolPayload) =>
  JSON.stringify({ tool: payload.tool, input: payload.input });

const numberWords = new Map([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
]);

const getTopLimit = (message: string) => {
  const numericMatch = message.match(
    /\b(?:top\s+)?(\d{1,2})\s+(?:biggest|largest|highest|top)\b/i,
  );

  if (numericMatch?.[1]) {
    return Math.min(Number(numericMatch[1]), 50);
  }

  const topNumericMatch = message.match(/\btop\s+(\d{1,2})\b/i);

  if (topNumericMatch?.[1]) {
    return Math.min(Number(topNumericMatch[1]), 50);
  }

  for (const [word, value] of numberWords) {
    if (
      new RegExp(
        `\\b(?:top\\s+)?${word}\\s+(?:biggest|largest|highest|top)\\b`,
        "i",
      ).test(message)
    ) {
      return value;
    }
  }

  return /\b(?:top|biggest|largest|highest)\b/i.test(message) ? 3 : null;
};

const getLeaderGroupBy = (
  message: string,
): QueryTransactionsInput["group_by"] => {
  const normalizedMessage = message.toLowerCase();
  const hasLeaderIntent =
    /\b(?:lead|leader|leading|highest|biggest|largest|most|top)\b/.test(
      normalizedMessage,
    ) || /\bwhich\b/.test(normalizedMessage);

  if (!hasLeaderIntent) {
    return undefined;
  }

  if (/\bmerchant|vendor|store|payee\b/.test(normalizedMessage)) {
    return "merchant";
  }

  if (/\bdate|day\b/.test(normalizedMessage)) {
    return "date";
  }

  if (/\btype\b/.test(normalizedMessage)) {
    return "type";
  }

  if (/\bcategor(?:y|ies)\b/.test(normalizedMessage)) {
    return "category";
  }

  return undefined;
};

const getExplicitGroupBy = (
  message: string,
): QueryTransactionsInput["group_by"] => {
  const normalizedMessage = message.toLowerCase();
  const hasGroupIntent = /\b(?:group|break\s*down|breakdown|split)\b/.test(
    normalizedMessage,
  );

  if (!hasGroupIntent) {
    return undefined;
  }

  if (/\bmerchant|vendor|store|payee\b/.test(normalizedMessage)) {
    return "merchant";
  }

  if (/\bdate|day\b/.test(normalizedMessage)) {
    return "date";
  }

  if (/\btype\b/.test(normalizedMessage)) {
    return "type";
  }

  if (/\bcategor(?:y|ies)\b/.test(normalizedMessage)) {
    return "category";
  }

  return undefined;
};

const toIsoDateOnly = (date: Date) => date.toISOString().slice(0, 10);

const getThisMonthRange = (todayDate: string) => {
  const date = new Date(`${todayDate}T00:00:00.000Z`);
  const startDate = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
  );
  const endDate = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  );

  return {
    date_start: toIsoDateOnly(startDate),
    date_end: toIsoDateOnly(endDate),
  };
};

const getAmountComparisons = (message: string) => {
  const normalizedMessage = message.toLowerCase();
  const amountPattern = "(?:npr|rs\\.?|रु)?\\s*(\\d[\\d,]*(?:\\.\\d{1,2})?)";
  const toAmount = (value: string) => Number(value.replaceAll(",", ""));
  const aboveMatch = normalizedMessage.match(
    new RegExp(
      `\\b(?:above|over|more than|greater than|at least)\\s+${amountPattern}`,
    ),
  );
  const belowMatch = normalizedMessage.match(
    new RegExp(
      `\\b(?:below|under|less than|lower than|at most)\\s+${amountPattern}`,
    ),
  );
  const betweenMatch = normalizedMessage.match(
    new RegExp(
      `\\bbetween\\s+${amountPattern}\\s+(?:and|to)\\s+${amountPattern}`,
    ),
  );
  const equalMatch = normalizedMessage.match(
    new RegExp(`\\b(?:equal(?:s| to)?|exactly|exact)\\s+${amountPattern}`),
  );

  return {
    ...(aboveMatch?.[1] ? { amount_min: toAmount(aboveMatch[1]) } : {}),
    ...(belowMatch?.[1] ? { amount_max: toAmount(belowMatch[1]) } : {}),
    ...(betweenMatch?.[1] ? { amount_min: toAmount(betweenMatch[1]) } : {}),
    ...(betweenMatch?.[2] ? { amount_max: toAmount(betweenMatch[2]) } : {}),
    ...(equalMatch?.[1]
      ? {
          amount_min: toAmount(equalMatch[1]),
          amount_max: toAmount(equalMatch[1]),
        }
      : {}),
  };
};

const enrichQueryInputFromQuestion = ({
  input,
  userMessage,
  todayDate,
}: {
  input: Record<string, unknown>;
  userMessage: string;
  todayDate: string;
}) => {
  const filters =
    input.filters && typeof input.filters === "object"
      ? { ...(input.filters as Record<string, unknown>) }
      : Object.fromEntries(
          Object.entries(input).filter(([key]) =>
            [
              "type",
              "category",
              "merchant",
              "description_contains",
              "date_start",
              "date_end",
              "amount_min",
              "amount_max",
            ].includes(key),
          ),
        );
  const amountComparisons: Record<string, number> =
    getAmountComparisons(userMessage);
  const thisMonthRange: Partial<{
    date_start: string;
    date_end: string;
  }> = /\bthis month\b/i.test(userMessage) ? getThisMonthRange(todayDate) : {};

  return {
    ...input,
    filters: {
      ...filters,
      ...(filters.date_start === undefined && thisMonthRange.date_start
        ? { date_start: thisMonthRange.date_start }
        : {}),
      ...(filters.date_end === undefined && thisMonthRange.date_end
        ? { date_end: thisMonthRange.date_end }
        : {}),
      ...(filters.amount_min === undefined &&
      amountComparisons.amount_min !== undefined
        ? { amount_min: amountComparisons.amount_min }
        : {}),
      ...(filters.amount_max === undefined &&
      amountComparisons.amount_max !== undefined
        ? { amount_max: amountComparisons.amount_max }
        : {}),
    },
  };
};

const enrichQueryPayloadFromQuestion = ({
  payload,
  userMessage,
  todayDate,
}: {
  payload: ToolPayload;
  userMessage: string;
  todayDate: string;
}): ToolPayload => {
  if (payload.tool !== "query_transactions") {
    return payload;
  }

  return {
    ...payload,
    input: enrichQueryInputFromQuestion({
      input: payload.input,
      userMessage,
      todayDate,
    }),
  };
};

const hasTotalAmountIntent = (message: string) =>
  /\b(?:how much|total|sum|overall|amount)\b/i.test(message);

const hasTransactionListIntent = (message: string) =>
  /\b(?:show|list|display|give me|what are)\b/i.test(message) ||
  /\b(?:biggest|largest|highest|top)\b/i.test(message);

const getTransactionTypeFromText = (
  text: string,
): QueryTransactionsInput["filters"]["type"] => {
  if (/\b(?:expense|expenses|spend|spent|spending)\b/i.test(text)) {
    return "expense";
  }

  if (/\b(?:income|incomes|earning|earnings|salary|salaries)\b/i.test(text)) {
    return "income";
  }

  if (/\b(?:saving|savings|saved)\b/i.test(text)) {
    return "savings";
  }

  return undefined;
};

const getAggregateFromText = (
  text: string,
): QueryTransactionsInput["aggregate"] | undefined => {
  if (/\b(?:net|money movement|cash\s*flow|cashflow)\b/i.test(text)) {
    return "net";
  }

  if (/\b(?:count|how many|number of)\b/i.test(text)) {
    return "count";
  }

  if (/\b(?:average|avg)\b/i.test(text)) {
    return "avg";
  }

  if (hasTransactionListIntent(text)) {
    return "list";
  }

  if (
    /\b(?:how much|total|sum|overall|amount|spend|spent|spending)\b/i.test(text)
  ) {
    return "sum";
  }

  return undefined;
};

const splitQuestionClauses = (message: string) => {
  const protectedMessage = message.replace(
    /\bbetween\s+((?:npr|rs\.?|रु)?\s*\d[\d,]*(?:\.\d{1,2})?)\s+(and|to)\s+((?:npr|rs\.?|रु)?\s*\d[\d,]*(?:\.\d{1,2})?)/gi,
    (_match, firstAmount: string, connector: string, secondAmount: string) =>
      `between ${firstAmount} __range_${connector.toLowerCase()}__ ${secondAmount}`,
  );

  return protectedMessage
    .split(/\s*(?:,|;|\bthen\b|\band\b)\s*/i)
    .map((clause) =>
      clause
        .replaceAll("__range_and__", "and")
        .replaceAll("__range_to__", "to")
        .trim(),
    )
    .filter(Boolean);
};

const getQueryPayloadsFromQuestionIntents = ({
  userMessage,
  todayDate,
}: {
  userMessage: string;
  todayDate: string;
}) => {
  const fallbackType = getTransactionTypeFromText(userMessage);
  const clauses = splitQuestionClauses(userMessage);
  const plannedPayloads = clauses.flatMap((clause) => {
    const leaderGroupBy = getLeaderGroupBy(clause);
    const explicitGroupBy = getExplicitGroupBy(clause);
    const topLimit = getTopLimit(clause);
    const aggregate =
      leaderGroupBy || explicitGroupBy ? "sum" : getAggregateFromText(clause);

    if (!aggregate) {
      return [];
    }

    const type = getTransactionTypeFromText(clause) ?? fallbackType;
    const input = enrichQueryInputFromQuestion({
      input: {
        filters: {
          ...(type && aggregate !== "net" ? { type } : {}),
        },
        aggregate,
        ...(leaderGroupBy
          ? {
              group_by: leaderGroupBy,
              sort: "amount_desc",
              limit: 1,
            }
          : {}),
        ...(explicitGroupBy
          ? {
              group_by: explicitGroupBy,
              sort: "amount_desc",
            }
          : {}),
        ...(topLimit && aggregate === "list"
          ? {
              sort: "amount_desc",
              limit: topLimit,
            }
          : {}),
      },
      userMessage,
      todayDate,
    });

    return [
      {
        tool: "query_transactions" as const,
        input,
      },
    ];
  });
  const seenPayloads = new Set<string>();

  return plannedPayloads.filter((plannedPayload) => {
    const key = queryPayloadKey(plannedPayload);

    if (seenPayloads.has(key)) {
      return false;
    }

    seenPayloads.add(key);
    return true;
  });
};

const queryIntentSignature = (payload: ToolPayload) => {
  const input = payload.input;
  const filters =
    input.filters && typeof input.filters === "object"
      ? (input.filters as Record<string, unknown>)
      : input;

  return JSON.stringify({
    aggregate: typeof input.aggregate === "string" ? input.aggregate : "list",
    type: typeof filters.type === "string" ? filters.type : undefined,
    group_by: typeof input.group_by === "string" ? input.group_by : undefined,
  });
};

const matchesQuestionQueryIntents = ({
  payloads,
  questionIntentPayloads,
}: {
  payloads: ToolPayload[];
  questionIntentPayloads: ToolPayload[];
}) => {
  const payloadSignatures = payloads.map(queryIntentSignature).sort();
  const questionSignatures = questionIntentPayloads
    .map(queryIntentSignature)
    .sort();

  return (
    payloadSignatures.length === questionSignatures.length &&
    payloadSignatures.every(
      (signature, index) => signature === questionSignatures[index],
    )
  );
};

const expandQueryPayloadByQuestionIntent = ({
  payload,
  userMessage,
  todayDate,
}: {
  payload: ToolPayload;
  userMessage: string;
  todayDate: string;
}) => {
  if (payload.tool !== "query_transactions") {
    return [payload];
  }

  const questionIntentPayloads = getQueryPayloadsFromQuestionIntents({
    userMessage,
    todayDate,
  });

  if (questionIntentPayloads.length > 1) {
    return questionIntentPayloads;
  }

  const expandedPayloads = expandQueryPayload(payload);

  if (expandedPayloads.length > 1) {
    return expandedPayloads.map((expandedPayload) =>
      enrichQueryPayloadFromQuestion({
        payload: expandedPayload,
        userMessage,
        todayDate,
      }),
    );
  }

  const [expandedPayload] = expandedPayloads;

  if (!expandedPayload) {
    return [];
  }

  const input: Record<string, unknown> = enrichQueryInputFromQuestion({
    input: expandedPayload.input,
    userMessage,
    todayDate,
  });
  const plannedPayloads: ToolPayload[] = [];
  const leaderGroupBy = getLeaderGroupBy(userMessage);
  const explicitGroupBy = getExplicitGroupBy(userMessage);
  const topLimit = getTopLimit(userMessage);

  if (hasTotalAmountIntent(userMessage)) {
    plannedPayloads.push({
      tool: "query_transactions",
      input: {
        ...input,
        aggregate: "sum",
      },
    });
  }

  if (leaderGroupBy) {
    plannedPayloads.push({
      tool: "query_transactions",
      input: {
        ...input,
        aggregate: "sum",
        group_by: leaderGroupBy,
        sort: "amount_desc",
        limit: typeof input.limit === "number" ? input.limit : 1,
      },
    });
  }

  if (explicitGroupBy && hasTransactionListIntent(userMessage)) {
    plannedPayloads.push({
      tool: "query_transactions",
      input: {
        ...input,
        aggregate: "list",
        ...(typeof input.sort === "string" ? { sort: input.sort } : {}),
        ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
      },
    });
  }

  if (explicitGroupBy) {
    plannedPayloads.push({
      tool: "query_transactions",
      input: {
        ...input,
        aggregate: "sum",
        group_by: explicitGroupBy,
        sort: "amount_desc",
        ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
      },
    });
  }

  if (topLimit && hasTransactionListIntent(userMessage)) {
    plannedPayloads.push({
      tool: "query_transactions",
      input: {
        ...input,
        aggregate: "list",
        sort: "amount_desc",
        limit: topLimit,
      },
    });
  }

  if (plannedPayloads.length === 0) {
    return [{ ...expandedPayload, input }];
  }

  const seenPayloads = new Set<string>();

  return plannedPayloads.filter((plannedPayload) => {
    const key = queryPayloadKey(plannedPayload);

    if (seenPayloads.has(key)) {
      return false;
    }

    seenPayloads.add(key);
    return true;
  });
};

const getToolPayloads = (
  content: string,
  userMessage: string,
  todayDate: string,
) => {
  const payloads = extractJsonValues(content).flatMap((value) =>
    normalizeToolPayload(value).flatMap(expandToolPayload),
  );

  if (payloads.length !== 1) {
    const questionIntentPayloads = getQueryPayloadsFromQuestionIntents({
      userMessage,
      todayDate,
    });

    if (
      questionIntentPayloads.length > 1 &&
      payloads.every((payload) => payload.tool === "query_transactions") &&
      !matchesQuestionQueryIntents({ payloads, questionIntentPayloads })
    ) {
      return questionIntentPayloads;
    }

    return payloads.map((payload) =>
      enrichQueryPayloadFromQuestion({ payload, userMessage, todayDate }),
    );
  }

  return payloads.flatMap((payload) =>
    expandQueryPayloadByQuestionIntent({ payload, userMessage, todayDate }),
  );
};

const getArrayValue = (value: unknown) =>
  Array.isArray(value) && value.length > 0 ? value : null;

const withQueryValue = ({
  input,
  key,
  removeKeys = [],
  value,
  isFilter,
}: {
  input: Record<string, unknown>;
  key: string;
  removeKeys?: readonly string[];
  value: unknown;
  isFilter: boolean;
}) => {
  const cleanedInput = Object.fromEntries(
    Object.entries(input).filter(
      ([inputKey]) => !removeKeys.includes(inputKey),
    ),
  );

  if (!isFilter) {
    return {
      ...cleanedInput,
      [key]: value,
    };
  }

  const filters = input.filters as Record<string, unknown>;
  const cleanedFilters = Object.fromEntries(
    Object.entries(filters).filter(
      ([filterKey]) => !removeKeys.includes(filterKey),
    ),
  );

  return {
    ...cleanedInput,
    filters: {
      ...cleanedFilters,
      [key]: value,
    },
  };
};

function expandQueryPayload(payload: ToolPayload): ToolPayload[] {
  const filterInput =
    payload.input.filters && typeof payload.input.filters === "object"
      ? (payload.input.filters as Record<string, unknown>)
      : null;
  const sources = filterInput
    ? [{ input: filterInput, isFilter: true }]
    : [{ input: payload.input, isFilter: false }];

  for (const { input, isFilter } of sources) {
    for (const [canonicalKey, aliases] of [
      ["type", ["type", "types"]],
      ["category", ["category", "categories"]],
      ["merchant", ["merchant", "merchants"]],
      ["description_contains", ["description_contains", "items", "item"]],
    ] as const) {
      for (const alias of aliases) {
        const values = getArrayValue(input[alias]);

        if (values) {
          return values.flatMap((value) =>
            expandQueryPayload({
              tool: payload.tool,
              input: withQueryValue({
                input: payload.input,
                key: canonicalKey,
                removeKeys: aliases,
                value,
                isFilter,
              }),
            }),
          );
        }
      }
    }
  }

  return [payload];
}

function expandToolPayload(payload: ToolPayload): ToolPayload[] {
  if (payload.tool === "query_transactions") {
    return expandQueryPayload(payload);
  }

  return [payload];
}

const isTransactionCategoryRequiredError = (
  error: unknown,
): error is TransactionCategoryRequiredError =>
  Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "category_required" &&
    "category" in error &&
    typeof error.category === "string" &&
    "type" in error &&
    typeof error.type === "string" &&
    "availableCategories" in error &&
    Array.isArray(error.availableCategories),
  );

const isProviderUnavailableError = (error: unknown) =>
  Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "provider_unavailable",
  );

const applyCreateTransactionTool = async ({
  recordTransaction,
  user,
  input,
}: {
  recordTransaction: CreateTransactionRecorder;
  user: ChatUserContext;
  input: CreateTransactionInput;
}) => {
  const noun =
    input.type === "expense"
      ? "expense"
      : input.type === "income"
        ? "income"
        : "savings transaction";

  try {
    const saved = await recordTransaction({ user, input });
    const titleLine = input.title ? `\n**Title:** ${input.title}` : "";

    return {
      response: `### Transaction saved\n\n**Type:** ${noun}${titleLine}\n**Description:** ${input.description}\n**Amount:** ${input.amount}`,
      toolCalls: [saved.toolCall],
    };
  } catch (error) {
    if (isTransactionCategoryRequiredError(error)) {
      const availableCategories = error.availableCategories.length
        ? ` Existing ${error.type} categories: ${error.availableCategories.join(
            ", ",
          )}.`
        : ` You do not have any ${error.type} categories yet.`;

      return {
        response: `### Category needed\n\nI could not save this **${noun}** because **"${error.category}"** is not in your saved categories.${availableCategories}\n\n**Next step:** Create this category first, or choose one of your saved categories.`,
        toolCalls: [],
      };
    }

    throw error;
  }
};

const formatClarifyQuestion = (input: {
  question: string;
  suggestions?: string[] | undefined;
}) => {
  const question = input.question.trim();

  if (!input.suggestions?.length) {
    return `### Need a bit more detail\n\n${question}`;
  }

  return `### Need a bit more detail\n\n${question}\n\n**Suggestions:** ${input.suggestions.join(", ")}`;
};

const normalizeClarifyInput = (input: Record<string, unknown>) => {
  if (input.suggestions !== undefined || input.options === undefined) {
    return input;
  }

  const { options, ...rest } = input;

  return {
    ...rest,
    suggestions: options,
  };
};

const toCreateCategoryInput = (input: {
  kind: CreateCategoryInput["kind"];
  name: string;
}): CreateCategoryInput => ({
  kind: input.kind,
  name: input.name,
});

const toUpdateCategoryInput = (input: {
  kind: UpdateCategoryInput["kind"];
  name: string;
  new_name: string;
}): UpdateCategoryInput => ({
  kind: input.kind,
  name: input.name,
  new_name: input.new_name,
});

const toDeleteCategoryInput = (input: {
  kind: DeleteCategoryInput["kind"];
  name: string;
}): DeleteCategoryInput => ({
  kind: input.kind,
  name: input.name,
});

const needsCategoryKindClarification = (input: Record<string, unknown>) =>
  typeof input.name === "string" && typeof input.kind !== "string";

const categoryKindClarification = (categoryName: string) =>
  `Should ${categoryName} be an expense, income, or savings category?`;

const hasExplicitCategoryMutationIntent = (message: string) => {
  const normalizedMessage = message.toLowerCase();
  const mentionsCategory = /\bcategor(?:y|ies)\b/.test(normalizedMessage);
  const hasMutationVerb =
    /\b(add|create|make|new|rename|edit|update|change|delete|remove)\b/.test(
      normalizedMessage,
    );

  return mentionsCategory && hasMutationVerb;
};

const categoryMutationNotRequestedResponse =
  "### Category action needed\n\nI will not create, edit, or delete categories unless you explicitly ask me to manage categories.\n\n**To save a transaction:** choose one of your saved categories, or ask me to create the category first.";

const inferCurrencyFromMessage = (message: string, userCurrency: string) => {
  if (/\$\s*\d|\bUSD\b/i.test(message)) {
    return "USD";
  }

  if (/€\s*\d|\bEUR\b/i.test(message)) {
    return "EUR";
  }

  if (/₹\s*\d|\bINR\b/i.test(message)) {
    return "INR";
  }

  if (/\b(?:NPR|रु|Rs\.?)\b/i.test(message)) {
    return userCurrency;
  }

  return userCurrency;
};

const normalizeCreateTransactionInput = ({
  input,
  userMessage,
  userCurrency,
  userTimezone,
  now,
}: {
  input: Record<string, unknown>;
  userMessage: string;
  userCurrency: string;
  userTimezone: string;
  now: Date;
}) => {
  const normalizedInput = { ...input };

  for (const [sourceKey, targetKey] of [
    ["merchant_name", "merchant"],
    ["vendor", "merchant"],
    ["store", "merchant"],
    ["payee", "merchant"],
    ["item", "description"],
    ["item_name", "description"],
    ["memo", "description"],
    ["details", "description"],
    ["name", "title"],
    ["label", "title"],
  ] as const) {
    if (
      normalizedInput[targetKey] === undefined &&
      normalizedInput[sourceKey] !== undefined
    ) {
      normalizedInput[targetKey] = normalizedInput[sourceKey];
    }

    delete normalizedInput[sourceKey];
  }

  if (typeof normalizedInput.amount === "string") {
    const normalizedAmount = Number(normalizedInput.amount.replaceAll(",", ""));

    if (Number.isFinite(normalizedAmount)) {
      normalizedInput.amount = normalizedAmount;
    }
  }

  const sourceCurrency =
    typeof normalizedInput.original_currency === "string"
      ? normalizedInput.original_currency
      : typeof normalizedInput.source_currency === "string"
        ? normalizedInput.source_currency
        : typeof normalizedInput.currency === "string"
          ? normalizedInput.currency
          : inferCurrencyFromMessage(userMessage, userCurrency);

  normalizedInput.original_currency = sourceCurrency.toUpperCase();

  if (typeof normalizedInput.original_amount !== "number") {
    normalizedInput.original_amount = normalizedInput.amount;
  }

  delete normalizedInput.source_currency;

  if (
    typeof normalizedInput.occurred_at === "string" &&
    dateOnlyPattern.test(normalizedInput.occurred_at)
  ) {
    normalizedInput.occurred_at = resolveDateOnlyWithCurrentTime({
      value: normalizedInput.occurred_at,
      now,
      timeZone: userTimezone,
    }).toISOString();
  }

  return normalizedInput;
};

const toCreateTransactionInput = (input: {
  type: CreateTransactionInput["type"];
  amount: number;
  currency?: string | undefined;
  original_amount?: number | undefined;
  original_currency?: string | undefined;
  exchange_rate?: number | undefined;
  category: string;
  title?: string | undefined;
  description: string;
  occurred_at: string;
  merchant?: string | undefined;
  savings_instrument?: string | undefined;
  tags?: string[] | undefined;
  is_recurring?: boolean | undefined;
  suggested_new_category?: string | undefined;
}): CreateTransactionInput => ({
  type: input.type,
  amount: input.amount,
  ...(input.currency ? { currency: input.currency } : {}),
  ...(input.original_amount === undefined
    ? {}
    : { original_amount: input.original_amount }),
  ...(input.original_currency
    ? { original_currency: input.original_currency }
    : {}),
  ...(input.exchange_rate === undefined
    ? {}
    : { exchange_rate: input.exchange_rate }),
  category: input.category,
  ...(input.title ? { title: input.title } : {}),
  description: input.description,
  occurred_at: input.occurred_at,
  ...(input.merchant ? { merchant: input.merchant } : {}),
  ...(input.savings_instrument
    ? { savings_instrument: input.savings_instrument }
    : {}),
  ...(input.tags ? { tags: input.tags } : {}),
  ...(input.is_recurring === undefined
    ? {}
    : { is_recurring: input.is_recurring }),
  ...(input.suggested_new_category
    ? { suggested_new_category: input.suggested_new_category }
    : {}),
});

const normalizeQueryTransactionsInput = (
  input: Record<string, unknown>,
): unknown => {
  const filters: Record<string, unknown> =
    input.filters && typeof input.filters === "object"
      ? { ...(input.filters as Record<string, unknown>) }
      : {};

  for (const [sourceKey, targetKey] of [
    ["type", "type"],
    ["category", "category"],
    ["merchant", "merchant"],
    ["merchant_name", "merchant"],
    ["vendor", "merchant"],
    ["store", "merchant"],
    ["payee", "merchant"],
    ["description_contains", "description_contains"],
    ["description", "description_contains"],
    ["title", "description_contains"],
    ["item", "description_contains"],
    ["items", "description_contains"],
    ["item_name", "description_contains"],
    ["memo", "description_contains"],
    ["start_date", "date_start"],
    ["date_start", "date_start"],
    ["end_date", "date_end"],
    ["date_end", "date_end"],
    ["amount_min", "amount_min"],
    ["amount_max", "amount_max"],
  ] as const) {
    if (input[sourceKey] !== undefined && filters[targetKey] === undefined) {
      filters[targetKey] = input[sourceKey];
    }
  }

  return {
    filters,
    aggregate: typeof input.aggregate === "string" ? input.aggregate : "list",
    ...(typeof input.group_by === "string" ? { group_by: input.group_by } : {}),
    ...(typeof input.sort === "string" ? { sort: input.sort } : {}),
    ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
  };
};

const toQueryTransactionsInput = (input: {
  filters: {
    type?: QueryTransactionsInput["filters"]["type"] | undefined;
    category?: string | undefined;
    merchant?: string | undefined;
    description_contains?: string | undefined;
    date_start?: string | undefined;
    date_end?: string | undefined;
    amount_min?: number | undefined;
    amount_max?: number | undefined;
  };
  aggregate: QueryTransactionsInput["aggregate"];
  group_by?: QueryTransactionsInput["group_by"] | undefined;
  sort?: QueryTransactionsInput["sort"] | undefined;
  limit?: number | undefined;
}): QueryTransactionsInput => ({
  filters: {
    ...(input.filters.type ? { type: input.filters.type } : {}),
    ...(input.filters.category ? { category: input.filters.category } : {}),
    ...(input.filters.merchant ? { merchant: input.filters.merchant } : {}),
    ...(input.filters.description_contains
      ? { description_contains: input.filters.description_contains }
      : {}),
    ...(input.filters.date_start
      ? { date_start: input.filters.date_start }
      : {}),
    ...(input.filters.date_end ? { date_end: input.filters.date_end } : {}),
    ...(input.filters.amount_min === undefined
      ? {}
      : { amount_min: input.filters.amount_min }),
    ...(input.filters.amount_max === undefined
      ? {}
      : { amount_max: input.filters.amount_max }),
  },
  aggregate: input.aggregate,
  ...(input.group_by ? { group_by: input.group_by } : {}),
  ...(input.sort ? { sort: input.sort } : {}),
  ...(input.limit === undefined ? {} : { limit: input.limit }),
});

const toQueryUserInput = (input: {
  fields?: QueryUserInput["fields"] | undefined;
}): QueryUserInput => ({
  ...(input.fields ? { fields: input.fields } : {}),
});

const toModifyTransactionInput = (input: {
  transaction_id: string;
  changes?: Record<string, unknown> | undefined;
  delete?: boolean | undefined;
}): ModifyTransactionInput => {
  const normalizedInput: ModifyTransactionInput = {
    transaction_id: input.transaction_id,
  };

  if (input.changes) {
    normalizedInput.changes = Object.fromEntries(
      Object.entries(input.changes).filter(([, value]) => value !== undefined),
    ) as NonNullable<ModifyTransactionInput["changes"]>;
  }

  if (input.delete !== undefined) {
    normalizedInput.delete = input.delete;
  }

  return normalizedInput;
};

const normalizeQueryUserInput = (input: Record<string, unknown>) => {
  if (Array.isArray(input.fields)) {
    return input;
  }

  if (typeof input.field === "string") {
    const { field, ...rest } = input;

    return {
      ...rest,
      fields: [field],
    };
  }

  if (typeof input.fields === "string") {
    const { fields, ...rest } = input;

    return {
      ...rest,
      fields: [fields],
    };
  }

  return input;
};

const toNumber = (value: unknown) => {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const normalizedValue = Number(value.replaceAll(",", ""));

    return Number.isFinite(normalizedValue) ? normalizedValue : undefined;
  }

  return undefined;
};

const getBudgetAmountFromMessage = (message: string) => {
  const normalizedMessage = message.toLowerCase();
  const amountPattern = "(?:npr|rs\\.?|रु)?\\s*(\\d[\\d,]*(?:\\.\\d{1,2})?)";
  const budgetMatch = normalizedMessage.match(
    new RegExp(`\\b(?:budget|target)(?:\\s+(?:of|for))?\\s+${amountPattern}`),
  );

  return budgetMatch?.[1]
    ? Number(budgetMatch[1].replaceAll(",", ""))
    : undefined;
};

const getRecurringContributionFromMessage = (message: string) => {
  const normalizedMessage = message.toLowerCase();
  const amountPattern = "(?:npr|rs\\.?|रु)?\\s*(\\d[\\d,]*(?:\\.\\d{1,2})?)";
  const contributionMatch = normalizedMessage.match(
    new RegExp(
      `\\b(?:allocate|save|contribute|put aside)\\s+${amountPattern}\\s+(?:per month|monthly|each month)`,
    ),
  );

  return contributionMatch?.[1]
    ? Number(contributionMatch[1].replaceAll(",", ""))
    : undefined;
};

const getBudgetNameFromMessage = (message: string) => {
  const buyMatch = message.match(
    /\b(?:buy|purchase|get)\s+(?:a|an|the)?\s*([^,.]+?)(?:\s+(?:create|with|for|and|i\b)|[,.]|$)/i,
  );

  if (buyMatch?.[1]) {
    return buyMatch[1].trim().replace(/\s+/g, " ");
  }

  const budgetMatch = message.match(
    /\bbudget\s+(?:for|called|named)\s+([^,.]+?)(?:\s+(?:with|of|and|i\b)|[,.]|$)/i,
  );

  return budgetMatch?.[1]?.trim().replace(/\s+/g, " ");
};

const getBudgetNotificationFromMessage = (message: string) => {
  if (!/\b(?:remind|notify|notification)\b/i.test(message)) {
    return undefined;
  }

  const normalizedMessage = message.toLowerCase();
  const dayMatch = normalizedMessage.match(
    /\bevery\s+(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(?:each\s+)?month\b/i,
  );
  const cadence = /\b(?:every\s*day|daily)\b/i.test(normalizedMessage)
    ? "daily"
    : /\b(?:only once|just once|notify me once|remind me once)\b/i.test(
          normalizedMessage,
        )
      ? "once"
      : dayMatch ||
          /\b(?:monthly|each month|every month)\b/i.test(normalizedMessage)
        ? "monthly"
        : "once";

  return {
    cadence,
    ...(dayMatch?.[1] ? { day_of_month: Number(dayMatch[1]) } : {}),
    until_paid_off:
      /\buntil\b.*\b(?:paid off|complete|completed|target reached)\b/i.test(
        normalizedMessage,
      ),
  };
};

const normalizeCreateBudgetInput = ({
  input,
  userMessage,
}: {
  input: Record<string, unknown>;
  userMessage: string;
}) => {
  const normalizedInput = { ...input };
  const recurringContribution =
    toNumber(normalizedInput.recurring_contribution) ??
    toNumber(normalizedInput.monthly_allocation) ??
    getRecurringContributionFromMessage(userMessage);
  const notification =
    normalizedInput.notification &&
    typeof normalizedInput.notification === "object"
      ? (normalizedInput.notification as Record<string, unknown>)
      : getBudgetNotificationFromMessage(userMessage);

  if (typeof normalizedInput.name !== "string") {
    const budgetName = getBudgetNameFromMessage(userMessage);

    if (budgetName) {
      normalizedInput.name = budgetName;
    }
  }

  for (const [sourceKey, targetKey] of [
    ["category_name", "category"],
    ["budget_category", "category"],
  ] as const) {
    if (
      normalizedInput[targetKey] === undefined &&
      normalizedInput[sourceKey] !== undefined
    ) {
      normalizedInput[targetKey] = normalizedInput[sourceKey];
    }

    delete normalizedInput[sourceKey];
  }

  if (normalizedInput.target_amount === undefined) {
    const targetAmount =
      toNumber(normalizedInput.target) ??
      getBudgetAmountFromMessage(userMessage);

    if (targetAmount !== undefined) {
      normalizedInput.target_amount = targetAmount;
    }
  }

  if (recurringContribution !== undefined) {
    normalizedInput.recurring_contribution = recurringContribution;
    normalizedInput.contribution_cadence ??= "monthly";
  }

  if (notification) {
    normalizedInput.notification = notification;
  }

  delete normalizedInput.target;
  delete normalizedInput.monthly_allocation;

  return normalizedInput;
};

const normalizeUpdateBudgetInput = ({
  input,
  userMessage,
}: {
  input: Record<string, unknown>;
  userMessage: string;
}) => {
  const normalizedInput = { ...input };

  if (!normalizedInput.changes || typeof normalizedInput.changes !== "object") {
    normalizedInput.changes = {};
  }

  normalizedInput.changes = normalizeCreateBudgetInput({
    input: normalizedInput.changes as Record<string, unknown>,
    userMessage,
  });

  return normalizedInput;
};

const combineToolResponses = (responses: string[]) =>
  responses.filter(Boolean).join("\n\n");

const loadSystemPromptContext = async ({
  userId,
  userCurrency,
}: {
  userId: string;
  userCurrency: string;
}) => {
  const emptyCategories = { expense: [], income: [], savings: [] } as Record<
    "expense" | "income" | "savings",
    PromptCategory[]
  >;

  try {
    const categoryRows = await db
      .select({
        kind: categories.kind,
        name: categories.name,
        keywords: categories.keywords,
      })
      .from(categories)
      .where(
        sql`${categories.userId} = ${userId} OR ${categories.userId} IS NULL`,
      )
      .orderBy(categories.kind, categories.name);
    const budgetRows = await db
      .select({
        id: budgets.id,
        name: budgets.name,
        status: budgets.status,
        targetAmount: budgets.targetAmount,
        currentAmount: budgets.currentAmount,
      })
      .from(budgets)
      .where(eq(budgets.userId, userId))
      .limit(50);

    return {
      userCurrency,
      categories: categoryRows.reduce(
        (currentCategories, category) => ({
          ...currentCategories,
          [category.kind]: [
            ...currentCategories[category.kind],
            {
              name: category.name,
              keywords: category.keywords,
            },
          ],
        }),
        emptyCategories,
      ),
      budgets: budgetRows.map((budget) => ({
        id: budget.id,
        name: budget.name,
        status: budget.status,
        targetAmount: budget.targetAmount,
        currentAmount: budget.currentAmount,
      })),
    };
  } catch {
    return {
      userCurrency,
      categories: emptyCategories,
      budgets: [],
    };
  }
};

const executeToolPayload = async ({
  payload,
  request,
  conversationId,
  completionModel,
  recordTransaction,
  modifyTransactionTool,
  categoryTools,
  budgetTools,
  queryTransactionsTool,
  queryUserTool,
  now,
  userTimezone,
}: {
  payload: ToolPayload;
  request: ChatRequest;
  conversationId: string;
  completionModel: string;
  recordTransaction: CreateTransactionRecorder;
  modifyTransactionTool: ModifyTransactionExecutor;
  categoryTools: CategoryToolExecutor;
  budgetTools: BudgetToolExecutor;
  queryTransactionsTool: QueryTransactionsExecutor;
  queryUserTool: QueryUserExecutor;
  now: Date;
  userTimezone: string;
}): Promise<ToolExecutionResult> => {
  if (payload.tool === "create_transaction") {
    const parsedInput = createTransactionInputSchema.safeParse(
      normalizeCreateTransactionInput({
        input: payload.input,
        userMessage: request.message,
        userCurrency: request.user?.currency ?? "NPR",
        userTimezone,
        now,
      }),
    );

    if (!parsedInput.success) {
      return {
        ok: false,
        error: {
          code: "llm_error",
          message: "AI returned an invalid create_transaction payload",
          details: {
            validation: parsedInput.error.flatten(),
            conversationId,
          },
        },
      };
    }

    return {
      ok: true,
      ...(await applyCreateTransactionTool({
        recordTransaction,
        user: request.user ?? { id: request.userId },
        input: toCreateTransactionInput(parsedInput.data),
      })),
    };
  }

  if (payload.tool === "clarify") {
    const parsedInput = clarifyInputSchema.safeParse(
      normalizeClarifyInput(payload.input),
    );

    if (!parsedInput.success) {
      return {
        ok: false,
        error: {
          code: "llm_error",
          message: "AI returned an invalid clarify payload",
          details: {
            validation: parsedInput.error.flatten(),
            conversationId,
          },
        },
      };
    }

    return {
      ok: true,
      response: formatClarifyQuestion(parsedInput.data),
      toolCalls: [
        {
          name: "clarify",
          label: "Clarification requested",
          status: "success",
          input: parsedInput.data as unknown as Record<string, unknown>,
          result: {
            title: "Clarification requested",
            description: parsedInput.data.question,
          },
        },
      ],
    };
  }

  if (payload.tool === "query_transactions") {
    const parsedInput = queryTransactionsInputSchema.safeParse(
      normalizeQueryTransactionsInput(payload.input),
    );

    if (!parsedInput.success) {
      return {
        ok: false,
        error: {
          code: "llm_error",
          message: "AI returned an invalid query_transactions payload",
          details: {
            validation: parsedInput.error.flatten(),
            conversationId,
          },
        },
      };
    }

    return {
      ok: true,
      ...(await queryTransactionsTool({
        user: request.user ?? { id: request.userId },
        input: toQueryTransactionsInput(parsedInput.data),
      })),
    };
  }

  if (payload.tool === "modify_transaction") {
    const parsedInput = modifyTransactionInputSchema.safeParse(payload.input);

    if (!parsedInput.success) {
      return {
        ok: false,
        error: {
          code: "llm_error",
          message: "AI returned an invalid modify_transaction payload",
          details: {
            validation: parsedInput.error.flatten(),
            conversationId,
          },
        },
      };
    }

    return {
      ok: true,
      ...(await modifyTransactionTool({
        user: request.user ?? { id: request.userId },
        input: toModifyTransactionInput(parsedInput.data),
      })),
    };
  }

  if (payload.tool === "query_user") {
    const parsedInput = queryUserInputSchema.safeParse(
      normalizeQueryUserInput(payload.input),
    );

    if (!parsedInput.success) {
      return {
        ok: false,
        error: {
          code: "llm_error",
          message: "AI returned an invalid query_user payload",
          details: {
            validation: parsedInput.error.flatten(),
            conversationId,
          },
        },
      };
    }

    return {
      ok: true,
      ...(await queryUserTool({
        user: request.user ?? { id: request.userId },
        input: toQueryUserInput(parsedInput.data),
      })),
    };
  }

  if (payload.tool === "query_categories") {
    const parsedInput = queryCategoriesInputSchema.safeParse(payload.input);

    if (!parsedInput.success) {
      return {
        ok: false,
        error: {
          code: "llm_error",
          message: "AI returned an invalid query_categories payload",
          details: {
            validation: parsedInput.error.flatten(),
            conversationId,
          },
        },
      };
    }

    return {
      ok: true,
      ...(await categoryTools.queryCategories({
        user: request.user ?? { id: request.userId },
        input:
          parsedInput.data.kind === undefined
            ? {}
            : { kind: parsedInput.data.kind },
      })),
    };
  }

  if (payload.tool === "create_budget") {
    const parsedInput = createBudgetInputSchema.safeParse(
      normalizeCreateBudgetInput({
        input: payload.input,
        userMessage: request.message,
      }),
    );

    if (!parsedInput.success) {
      return {
        ok: false,
        error: {
          code: "llm_error",
          message: "AI returned an invalid create_budget payload",
          details: {
            validation: parsedInput.error.flatten(),
            conversationId,
          },
        },
      };
    }

    return {
      ok: true,
      ...(await budgetTools.createBudget({
        user: request.user ?? { id: request.userId },
        input: parsedInput.data,
        now: new Date(),
      })),
    };
  }

  if (payload.tool === "allocate_to_budget") {
    const parsedInput = allocateToBudgetInputSchema.safeParse(payload.input);

    if (!parsedInput.success) {
      return {
        ok: false,
        error: {
          code: "llm_error",
          message: "AI returned an invalid allocate_to_budget payload",
          details: {
            validation: parsedInput.error.flatten(),
            conversationId,
          },
        },
      };
    }

    return {
      ok: true,
      ...(await budgetTools.allocateToBudget({
        user: request.user ?? { id: request.userId },
        input: parsedInput.data,
        now: new Date(),
      })),
    };
  }

  if (payload.tool === "query_budgets") {
    const parsedInput = queryBudgetsInputSchema.safeParse(payload.input);

    if (!parsedInput.success) {
      return {
        ok: false,
        error: {
          code: "llm_error",
          message: "AI returned an invalid query_budgets payload",
          details: {
            validation: parsedInput.error.flatten(),
            conversationId,
          },
        },
      };
    }

    return {
      ok: true,
      ...(await budgetTools.queryBudgets({
        user: request.user ?? { id: request.userId },
        input: parsedInput.data,
      })),
    };
  }

  if (payload.tool === "update_budget") {
    const parsedInput = updateBudgetInputSchema.safeParse(
      normalizeUpdateBudgetInput({
        input: payload.input,
        userMessage: request.message,
      }),
    );

    if (!parsedInput.success) {
      return {
        ok: false,
        error: {
          code: "llm_error",
          message: "AI returned an invalid update_budget payload",
          details: {
            validation: parsedInput.error.flatten(),
            conversationId,
          },
        },
      };
    }

    return {
      ok: true,
      ...(await budgetTools.updateBudget({
        user: request.user ?? { id: request.userId },
        input: parsedInput.data,
        now: new Date(),
      })),
    };
  }

  if (payload.tool === "delete_budget") {
    const parsedInput = deleteBudgetInputSchema.safeParse(payload.input);

    if (!parsedInput.success) {
      return {
        ok: false,
        error: {
          code: "llm_error",
          message: "AI returned an invalid delete_budget payload",
          details: {
            validation: parsedInput.error.flatten(),
            conversationId,
          },
        },
      };
    }

    return {
      ok: true,
      ...(await budgetTools.deleteBudget({
        user: request.user ?? { id: request.userId },
        input: parsedInput.data,
      })),
    };
  }

  if (payload.tool === "create_category") {
    if (!hasExplicitCategoryMutationIntent(request.message)) {
      return {
        ok: true,
        response: categoryMutationNotRequestedResponse,
        toolCalls: [],
      };
    }

    if (needsCategoryKindClarification(payload.input)) {
      return {
        ok: true,
        response: categoryKindClarification(String(payload.input.name)),
        toolCalls: [],
      };
    }

    const parsedInput = createCategoryInputSchema.safeParse(payload.input);

    if (!parsedInput.success) {
      return {
        ok: false,
        error: {
          code: "llm_error",
          message: "AI returned an invalid create_category payload",
          details: {
            validation: parsedInput.error.flatten(),
            conversationId,
          },
        },
      };
    }

    return {
      ok: true,
      ...(await categoryTools.createCategory({
        user: request.user ?? { id: request.userId },
        input: toCreateCategoryInput(parsedInput.data),
      })),
    };
  }

  if (payload.tool === "update_category") {
    if (!hasExplicitCategoryMutationIntent(request.message)) {
      return {
        ok: true,
        response: categoryMutationNotRequestedResponse,
        toolCalls: [],
      };
    }

    if (needsCategoryKindClarification(payload.input)) {
      return {
        ok: true,
        response: categoryKindClarification(String(payload.input.name)),
        toolCalls: [],
      };
    }

    const parsedInput = updateCategoryInputSchema.safeParse(payload.input);

    if (!parsedInput.success) {
      return {
        ok: false,
        error: {
          code: "llm_error",
          message: "AI returned an invalid update_category payload",
          details: {
            validation: parsedInput.error.flatten(),
            conversationId,
          },
        },
      };
    }

    return {
      ok: true,
      ...(await categoryTools.updateCategory({
        user: request.user ?? { id: request.userId },
        input: toUpdateCategoryInput(parsedInput.data),
      })),
    };
  }

  if (payload.tool === "delete_category") {
    if (!hasExplicitCategoryMutationIntent(request.message)) {
      return {
        ok: true,
        response: categoryMutationNotRequestedResponse,
        toolCalls: [],
      };
    }

    if (needsCategoryKindClarification(payload.input)) {
      return {
        ok: true,
        response: categoryKindClarification(String(payload.input.name)),
        toolCalls: [],
      };
    }

    const parsedInput = deleteCategoryInputSchema.safeParse(payload.input);

    if (!parsedInput.success) {
      return {
        ok: false,
        error: {
          code: "llm_error",
          message: "AI returned an invalid delete_category payload",
          details: {
            validation: parsedInput.error.flatten(),
            conversationId,
          },
        },
      };
    }

    return {
      ok: true,
      ...(await categoryTools.deleteCategory({
        user: request.user ?? { id: request.userId },
        input: toDeleteCategoryInput(parsedInput.data),
      })),
    };
  }

  return {
    ok: false,
    error: {
      code: "not_implemented",
      message: `${payload.tool} is not implemented yet`,
      details: {
        conversationId,
        model: completionModel,
      },
    },
  };
};

const getOrCreateConversation = (userId: string, conversationId?: string) => {
  if (conversationId) {
    const existing = conversations.get(conversationId);

    if (existing?.userId === userId) {
      return {
        conversationId,
        conversation: existing,
      };
    }

    if (!existing) {
      const conversation: ConversationRecord = {
        userId,
        messages: [],
      };

      conversations.set(conversationId, conversation);

      return {
        conversationId,
        conversation,
      };
    }
  }

  const newConversationId = randomUUID();
  const conversation: ConversationRecord = {
    userId,
    messages: [],
  };

  conversations.set(newConversationId, conversation);

  return {
    conversationId: newConversationId,
    conversation,
  };
};

export const createChatOrchestrator = ({
  gateway = createLlmGateway(),
  recordTransaction = createTransactionRecord,
  modifyTransactionTool = modifyTransactionRecord,
  categoryTools = {
    createCategory,
    updateCategory,
    deleteCategory,
    queryCategories,
  },
  budgetTools = {
    createBudget,
    allocateToBudget,
    queryBudgets,
    updateBudget,
    deleteBudget,
  },
  queryTransactionsTool = queryTransactions,
  queryUserTool = queryUser,
  now = () => new Date(),
  maxHistoryMessages = 16,
}: ChatOrchestratorOptions = {}) => ({
  async handleChat(request: ChatRequest): Promise<ChatResponse> {
    const requestNow = now();
    const userTimezone = request.user?.timezone ?? "Asia/Kathmandu";
    const todayDate = formatDateOnlyInTimeZone(requestNow, userTimezone);
    const userCurrency = request.user?.currency ?? "NPR";
    const promptContext = await loadSystemPromptContext({
      userId: request.userId,
      userCurrency,
    });
    const systemPrompt = buildSystemPrompt({
      todayDate,
      userTimezone,
      userCurrency: promptContext.userCurrency,
      categories: promptContext.categories,
      budgets: promptContext.budgets,
    });
    const { conversationId, conversation } = getOrCreateConversation(
      request.userId,
      request.conversationId,
    );

    if (request.history) {
      conversation.messages = trimHistory(request.history, maxHistoryMessages);
    }

    const userMessage: LlmMessage = {
      role: "user",
      content: request.message,
    };

    try {
      const completion = await gateway.createChatCompletion({
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          ...conversation.messages,
          userMessage,
        ],
        ...(request.signal ? { signal: request.signal } : {}),
      });
      const assistantMessage: LlmMessage = {
        role: "assistant",
        content: completion.content,
      };
      const toolPayloads = getToolPayloads(
        completion.content,
        request.message,
        todayDate,
      );

      if (toolPayloads.length > 0) {
        const responses: string[] = [];
        const toolCalls: ChatToolCallSummary[] = [];

        for (const payload of toolPayloads) {
          const executedTool = await executeToolPayload({
            payload,
            request,
            conversationId,
            completionModel: completion.model,
            recordTransaction,
            modifyTransactionTool,
            categoryTools,
            budgetTools,
            queryTransactionsTool,
            queryUserTool,
            now: requestNow,
            userTimezone,
          });

          if (!executedTool.ok) {
            return {
              ok: false,
              error: executedTool.error,
            };
          }

          responses.push(executedTool.response);
          toolCalls.push(...executedTool.toolCalls);
        }

        const response = combineToolResponses(responses);
        const toolAssistantMessage: LlmMessage = {
          role: "assistant",
          content: response,
        };

        conversation.messages = trimHistory(
          [...conversation.messages, userMessage, toolAssistantMessage],
          maxHistoryMessages,
        );

        return {
          ok: true,
          data: {
            response,
            model: completion.model,
            conversationId,
            ...(toolCalls.length > 0 ? { toolCalls } : {}),
          },
        };
      }

      conversation.messages = trimHistory(
        [...conversation.messages, userMessage, assistantMessage],
        maxHistoryMessages,
      );

      return {
        ok: true,
        data: {
          response: completion.content,
          model: completion.model,
          conversationId,
        },
      };
    } catch (error) {
      if (isProviderUnavailableError(error)) {
        const assistantMessage: LlmMessage = {
          role: "assistant",
          content: providerUnavailableMessage,
        };

        conversation.messages = trimHistory(
          [...conversation.messages, userMessage, assistantMessage],
          maxHistoryMessages,
        );

        return {
          ok: true,
          data: {
            response: providerUnavailableMessage,
            model: "provider-unavailable",
            conversationId,
          },
        };
      }

      return {
        ok: false,
        error: {
          code: "llm_error",
          message:
            error instanceof LlmGatewayError
              ? error.message
              : "Unexpected LLM gateway failure",
          details: {
            nextStep: "Wire tool execution after the LLM gateway is stable",
            conversationId,
          },
        },
      };
    }
  },
});

const defaultOrchestrator = createChatOrchestrator();

export const handleChat = (request: ChatRequest) =>
  defaultOrchestrator.handleChat(request);
