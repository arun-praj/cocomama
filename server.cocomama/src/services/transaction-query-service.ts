import { and, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { categories, transactions, users } from "../db/schema.js";
import type {
  QueryTransactionsInput,
  TransactionType,
} from "../tools/types.js";
import type { ChatToolCallSummary } from "./transaction-record-service.js";

export interface TransactionQueryUserContext {
  id: string;
  currency?: string;
}

type TransactionRow = {
  id: string;
  type: TransactionType;
  amount: string;
  title: string;
  description: string;
  merchant: string | null;
  category: string | null;
  occurredAt: Date;
};

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

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);

const toStartDate = (value: string) => new Date(value);

const toEndDate = (value: string) => {
  const date = new Date(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setUTCHours(23, 59, 59, 999);
  }

  return date;
};

const describeFilters = (input: QueryTransactionsInput) => {
  const parts = [
    input.filters.type,
    input.filters.category ? `${input.filters.category} category` : null,
    input.filters.merchant ? `merchant ${input.filters.merchant}` : null,
    input.filters.description_contains
      ? `matching ${input.filters.description_contains}`
      : null,
    input.filters.date_start && input.filters.date_end
      ? `${input.filters.date_start} to ${input.filters.date_end}`
      : input.filters.date_start
        ? `from ${input.filters.date_start}`
        : input.filters.date_end
          ? `until ${input.filters.date_end}`
          : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "all transactions";
};

const totalRows = (rows: TransactionRow[]) =>
  rows.reduce((total, row) => total + Number(row.amount), 0);

const formatListResponse = ({
  rows,
  input,
  currency,
}: {
  rows: TransactionRow[];
  input: QueryTransactionsInput;
  currency: string;
}) => {
  const filterDescription = describeFilters(input);

  if (rows.length === 0) {
    return `No ${filterDescription} found.`;
  }

  const total = totalRows(rows);
  const lines = rows.map((row) => {
    const details = [row.category, row.merchant].filter(Boolean).join(" | ");

    return `- ${formatDate(row.occurredAt)}: ${row.title} — ${formatMoney(
      Number(row.amount),
      currency,
    )}${details ? ` (${details})` : ""}`;
  });

  return [
    `Found ${rows.length} ${filterDescription} totaling ${formatMoney(
      total,
      currency,
    )}:`,
    ...lines,
  ].join("\n");
};

const formatAggregateResponse = ({
  rows,
  input,
  currency,
}: {
  rows: TransactionRow[];
  input: QueryTransactionsInput;
  currency: string;
}) => {
  const filterDescription = describeFilters(input);
  const total = totalRows(rows);

  if (input.aggregate === "count") {
    return `Found ${rows.length} ${filterDescription}.`;
  }

  if (input.aggregate === "avg") {
    const average = rows.length > 0 ? total / rows.length : 0;

    return `Average for ${filterDescription}: ${formatMoney(
      average,
      currency,
    )}.`;
  }

  if (input.aggregate === "net") {
    const net = rows.reduce((totalAmount, row) => {
      if (row.type === "income") {
        return totalAmount + Number(row.amount);
      }

      return totalAmount - Number(row.amount);
    }, 0);

    return `Net for ${filterDescription}: ${formatMoney(net, currency)}.`;
  }

  return `Total for ${filterDescription}: ${formatMoney(total, currency)}.`;
};

const formatGroupedCategoryResponse = ({
  rows,
  currency,
}: {
  rows: Array<{ category: string | null; total: string; count: number }>;
  currency: string;
}) => {
  if (rows.length === 0) {
    return "No category totals found.";
  }

  const [leader] = rows;

  if (rows.length === 1 && leader) {
    return `${leader.category ?? "uncategorized"} was the leading category at ${formatMoney(
      Number(leader.total),
      currency,
    )}.`;
  }

  return rows
    .map(
      (row) =>
        `- ${row.category ?? "uncategorized"}: ${formatMoney(
          Number(row.total),
          currency,
        )}`,
    )
    .join("\n");
};

const formatGroupedResponse = ({
  label,
  emptyLabel,
  rows,
  currency,
}: {
  label: string;
  emptyLabel: string;
  rows: Array<{ group: string | null; total: string; count: number }>;
  currency: string;
}) => {
  if (rows.length === 0) {
    return `No ${label} totals found.`;
  }

  const [leader] = rows;

  if (rows.length === 1 && leader) {
    return `${leader.group ?? emptyLabel} was the leading ${label} at ${formatMoney(
      Number(leader.total),
      currency,
    )}.`;
  }

  return rows
    .map(
      (row) =>
        `- ${row.group ?? emptyLabel}: ${formatMoney(
          Number(row.total),
          currency,
        )} (${row.count})`,
    )
    .join("\n");
};

export const queryTransactions = async ({
  user,
  input,
}: {
  user: TransactionQueryUserContext;
  input: QueryTransactionsInput;
}) => {
  const [userRow] = await db
    .select({ currency: users.currency })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const currency = userRow?.currency ?? user.currency ?? "NPR";
  const conditions = [
    eq(transactions.userId, user.id),
    isNull(transactions.deletedAt),
  ];

  if (input.filters.type) {
    conditions.push(eq(transactions.type, input.filters.type));
  }

  if (input.filters.category) {
    conditions.push(
      sql`lower(${categories.name}) = ${input.filters.category.toLowerCase()}`,
    );
  }

  if (input.filters.merchant) {
    conditions.push(
      ilike(transactions.merchant, `%${input.filters.merchant}%`),
    );
  }

  if (input.filters.description_contains) {
    conditions.push(
      ilike(
        transactions.description,
        `%${input.filters.description_contains}%`,
      ),
    );
  }

  if (input.filters.date_start) {
    conditions.push(
      sql`${transactions.occurredAt} >= ${toStartDate(input.filters.date_start)}`,
    );
  }

  if (input.filters.date_end) {
    conditions.push(
      sql`${transactions.occurredAt} <= ${toEndDate(input.filters.date_end)}`,
    );
  }

  if (input.filters.amount_min !== undefined) {
    conditions.push(sql`${transactions.amount} >= ${input.filters.amount_min}`);
  }

  if (input.filters.amount_max !== undefined) {
    conditions.push(sql`${transactions.amount} <= ${input.filters.amount_max}`);
  }

  if (input.group_by === "category") {
    const groupedRows = await db
      .select({
        category: categories.name,
        total: sql<string>`sum(${transactions.amount})`,
        count: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(...conditions))
      .groupBy(categories.name)
      .orderBy(sql`sum(${transactions.amount}) desc`)
      .limit(input.limit ?? 50);
    const response = formatGroupedCategoryResponse({
      rows: groupedRows,
      currency,
    });
    const toolCall: ChatToolCallSummary = {
      name: "query_transactions",
      label: "Transactions queried",
      status: "success",
      input: input as unknown as Record<string, unknown>,
    };

    return {
      response,
      toolCalls: [toolCall],
    };
  }

  if (input.group_by === "merchant") {
    const groupedRows = await db
      .select({
        group: transactions.merchant,
        total: sql<string>`sum(${transactions.amount})`,
        count: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(...conditions))
      .groupBy(transactions.merchant)
      .orderBy(sql`sum(${transactions.amount}) desc`)
      .limit(input.limit ?? 50);
    const toolCall: ChatToolCallSummary = {
      name: "query_transactions",
      label: "Transactions queried",
      status: "success",
      input: input as unknown as Record<string, unknown>,
    };

    return {
      response: formatGroupedResponse({
        label: "merchant",
        emptyLabel: "unknown merchant",
        rows: groupedRows,
        currency,
      }),
      toolCalls: [toolCall],
    };
  }

  if (input.group_by === "date") {
    const dateGroup = sql<string>`to_char(${transactions.occurredAt}, 'YYYY-MM-DD')`;
    const groupedRows = await db
      .select({
        group: dateGroup,
        total: sql<string>`sum(${transactions.amount})`,
        count: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(...conditions))
      .groupBy(dateGroup)
      .orderBy(sql`${dateGroup} desc`)
      .limit(input.limit ?? 50);
    const toolCall: ChatToolCallSummary = {
      name: "query_transactions",
      label: "Transactions queried",
      status: "success",
      input: input as unknown as Record<string, unknown>,
    };

    return {
      response: formatGroupedResponse({
        label: "date",
        emptyLabel: "unknown date",
        rows: groupedRows,
        currency,
      }),
      toolCalls: [toolCall],
    };
  }

  if (input.group_by === "type") {
    const groupedRows = await db
      .select({
        group: transactions.type,
        total: sql<string>`sum(${transactions.amount})`,
        count: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(...conditions))
      .groupBy(transactions.type)
      .orderBy(sql`sum(${transactions.amount}) desc`)
      .limit(input.limit ?? 50);
    const toolCall: ChatToolCallSummary = {
      name: "query_transactions",
      label: "Transactions queried",
      status: "success",
      input: input as unknown as Record<string, unknown>,
    };

    return {
      response: formatGroupedResponse({
        label: "type",
        emptyLabel: "unknown type",
        rows: groupedRows,
        currency,
      }),
      toolCalls: [toolCall],
    };
  }

  const rows = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      title: transactions.title,
      description: transactions.description,
      merchant: transactions.merchant,
      category: categories.name,
      occurredAt: transactions.occurredAt,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(
      input.sort === "amount_desc"
        ? desc(transactions.amount)
        : desc(transactions.occurredAt),
    )
    .limit(input.limit ?? 50);
  const response =
    input.aggregate === "list"
      ? formatListResponse({ rows, input, currency })
      : formatAggregateResponse({ rows, input, currency });
  const toolCall: ChatToolCallSummary = {
    name: "query_transactions",
    label: "Transactions queried",
    status: "success",
    input: input as unknown as Record<string, unknown>,
  };

  return {
    response,
    toolCalls: [toolCall],
  };
};
