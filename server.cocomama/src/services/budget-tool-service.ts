import { and, eq, ilike, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { budgetAllocations, budgets, categories } from "../db/schema.js";
import type {
  AllocateToBudgetInput,
  CreateBudgetInput,
  DeleteBudgetInput,
  QueryBudgetsInput,
  ToolName,
  UpdateBudgetInput,
} from "../tools/types.js";
import type { ChatToolCallSummary } from "./transaction-record-service.js";
import { getInitialBudgetNotificationDate } from "./budget-notification-service.js";
import { resolveBudgetCategory } from "./budget-category-service.js";

export interface BudgetUserContext {
  id: string;
  currency?: string;
}

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

const normalizeBudgetName = (value: string) =>
  value.trim().replace(/\s+/g, " ");

const notificationValues = ({
  input,
  now,
}: {
  input?: CreateBudgetInput["notification"];
  now: Date;
}) => {
  const cadence = input?.cadence ?? "none";
  const enabled = cadence !== "none";
  const dayOfMonth = input?.day_of_month;
  const nextNotificationAt = enabled
    ? input?.next_notify_at
      ? new Date(input.next_notify_at)
      : getInitialBudgetNotificationDate({
          cadence,
          ...(dayOfMonth === undefined ? {} : { dayOfMonth }),
          now,
        })
    : null;

  return {
    notificationEnabled: enabled,
    notificationCadence: cadence,
    ...(dayOfMonth === undefined ? {} : { notificationDayOfMonth: dayOfMonth }),
    notificationUntilPaidOff: input?.until_paid_off ?? false,
    nextNotificationAt:
      nextNotificationAt && !Number.isNaN(nextNotificationAt.getTime())
        ? nextNotificationAt
        : null,
  };
};

const toolCall = ({
  name,
  label,
  input,
  budget,
}: {
  name: Extract<
    ToolName,
    | "create_budget"
    | "allocate_to_budget"
    | "query_budgets"
    | "update_budget"
    | "delete_budget"
  >;
  label: string;
  input: Record<string, unknown>;
  budget: {
    id: string;
    name: string;
    targetAmount?: string | null;
    currentAmount?: string | null;
    status?: string;
  };
}): ChatToolCallSummary => ({
  name,
  label,
  status: "success",
  input,
  result: {
    savingId: budget.id,
    title: budget.name,
    description: `${budget.status ?? "active"} budget`,
    targetAmountMinor: budget.targetAmount
      ? Math.round(Number(budget.targetAmount) * 100)
      : null,
    amountMinor: budget.currentAmount
      ? Math.round(Number(budget.currentAmount) * 100)
      : 0,
    status: budget.status === "completed" ? "completed" : "active",
  },
});

const findBudget = async ({
  userId,
  budgetId,
  budgetName,
}: {
  userId: string;
  budgetId?: string;
  budgetName?: string;
}) => {
  const conditions = [eq(budgets.userId, userId)];

  if (budgetId) {
    conditions.push(eq(budgets.id, budgetId));
  } else if (budgetName) {
    conditions.push(sql`lower(${budgets.name}) = ${budgetName.toLowerCase()}`);
  } else {
    return null;
  }

  const [budget] = await db
    .select()
    .from(budgets)
    .where(and(...conditions))
    .limit(1);

  return budget ?? null;
};

const budgetLookup = (input: {
  budget_id?: string | undefined;
  budget_name?: string | undefined;
}) => ({
  ...(input.budget_id ? { budgetId: input.budget_id } : {}),
  ...(input.budget_name ? { budgetName: input.budget_name } : {}),
});

export const createBudget = async ({
  user,
  input,
  now = new Date(),
}: {
  user: BudgetUserContext;
  input: CreateBudgetInput;
  now?: Date;
}) => {
  const name = normalizeBudgetName(input.name);
  const category = await resolveBudgetCategory({
    userId: user.id,
    categoryName: input.category,
    budgetName: name,
  });

  if (!category) {
    return {
      response:
        "### Budget category needed\n\nI could not create this budget because I could not match it to any saved category.",
      toolCalls: [],
    };
  }

  const [existingBudget] = await db
    .select()
    .from(budgets)
    .where(
      and(
        eq(budgets.userId, user.id),
        sql`lower(${budgets.name}) = ${name.toLowerCase()}`,
        eq(budgets.status, "active"),
      ),
    )
    .limit(1);

  if (existingBudget) {
    return {
      response: `### Budget already exists\n\n**Budget:** ${existingBudget.name}`,
      toolCalls: [
        toolCall({
          name: "create_budget",
          label: "Budget already exists",
          input: input as unknown as Record<string, unknown>,
          budget: existingBudget,
        }),
      ],
    };
  }

  const [budget] = await db
    .insert(budgets)
    .values({
      userId: user.id,
      categoryId: category.id,
      name,
      ...(input.target_amount
        ? { targetAmount: input.target_amount.toFixed(2) }
        : {}),
      ...(input.target_date ? { targetDate: input.target_date } : {}),
      ...(input.recurring_contribution
        ? { recurringContribution: input.recurring_contribution.toFixed(2) }
        : {}),
      contributionCadence:
        input.contribution_cadence ??
        (input.recurring_contribution ? "monthly" : "none"),
      ...notificationValues({ input: input.notification, now }),
      updatedAt: now,
    })
    .returning();

  if (!budget) {
    throw new Error("Could not create budget");
  }

  const currency = user.currency ?? "NPR";
  const lines = [
    "### Budget created",
    "",
    `**Budget:** ${budget.name}`,
    `**Category:** ${category.name}`,
    budget.targetAmount
      ? `**Target:** ${formatMoney(Number(budget.targetAmount), currency)}`
      : null,
    budget.recurringContribution
      ? `**Planned contribution:** ${formatMoney(
          Number(budget.recurringContribution),
          currency,
        )} ${budget.contributionCadence}`
      : null,
    budget.notificationEnabled && budget.nextNotificationAt
      ? `**Reminder:** ${budget.notificationCadence} starting ${budget.nextNotificationAt.toISOString().slice(0, 10)}`
      : null,
  ].filter(Boolean);

  return {
    response: lines.join("\n"),
    toolCalls: [
      toolCall({
        name: "create_budget",
        label: "Budget created",
        input: input as unknown as Record<string, unknown>,
        budget,
      }),
    ],
  };
};

export const allocateToBudget = async ({
  user,
  input,
  now = new Date(),
}: {
  user: BudgetUserContext;
  input: AllocateToBudgetInput;
  now?: Date;
}) => {
  const budget = await findBudget({
    userId: user.id,
    ...budgetLookup(input),
  });

  if (!budget) {
    return {
      response: "### Budget not found\n\nI could not find that budget.",
      toolCalls: [],
    };
  }

  const [allocation] = await db
    .insert(budgetAllocations)
    .values({
      budgetId: budget.id,
      userId: user.id,
      amount: input.amount.toFixed(2),
      occurredAt: input.occurred_at ? new Date(input.occurred_at) : now,
      ...(input.note ? { note: input.note } : {}),
      ...(input.source_transaction_id
        ? { sourceTransactionId: input.source_transaction_id }
        : {}),
    })
    .returning();

  const currentAmount = Number(budget.currentAmount) + input.amount;
  const status =
    budget.targetAmount && currentAmount >= Number(budget.targetAmount)
      ? "completed"
      : budget.status;
  const [updatedBudget] = await db
    .update(budgets)
    .set({
      currentAmount: currentAmount.toFixed(2),
      status,
      ...(status === "completed"
        ? {
            notificationEnabled: false,
            notificationCadence: "none" as const,
            nextNotificationAt: null,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(budgets.id, budget.id))
    .returning();

  if (!allocation || !updatedBudget) {
    throw new Error("Could not allocate to budget");
  }

  return {
    response: `### Budget allocation saved\n\n**Budget:** ${budget.name}\n**Amount:** ${formatMoney(input.amount, user.currency ?? "NPR")}`,
    toolCalls: [
      toolCall({
        name: "allocate_to_budget",
        label: "Budget allocation saved",
        input: input as unknown as Record<string, unknown>,
        budget: updatedBudget,
      }),
    ],
  };
};

export const queryBudgets = async ({
  user,
  input,
}: {
  user: BudgetUserContext;
  input: QueryBudgetsInput;
}) => {
  const conditions = [eq(budgets.userId, user.id)];

  if (input.status) {
    conditions.push(eq(budgets.status, input.status));
  }

  if (input.name_query) {
    conditions.push(ilike(budgets.name, `%${input.name_query}%`));
  }

  if (input.target_min !== undefined) {
    conditions.push(sql`${budgets.targetAmount} >= ${input.target_min}`);
  }

  if (input.target_max !== undefined) {
    conditions.push(sql`${budgets.targetAmount} <= ${input.target_max}`);
  }

  if (input.remaining_min !== undefined) {
    conditions.push(
      sql`coalesce(${budgets.targetAmount}, 0) - ${budgets.currentAmount} >= ${input.remaining_min}`,
    );
  }

  if (input.remaining_max !== undefined) {
    conditions.push(
      sql`coalesce(${budgets.targetAmount}, 0) - ${budgets.currentAmount} <= ${input.remaining_max}`,
    );
  }

  if (input.notification_due_before) {
    conditions.push(
      sql`${budgets.nextNotificationAt} <= ${new Date(input.notification_due_before)}`,
    );
  }

  const rows = await db
    .select({
      budget: budgets,
      category: {
        name: categories.name,
        emoji: categories.emoji,
      },
    })
    .from(budgets)
    .leftJoin(categories, eq(budgets.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(budgets.status, budgets.name)
    .limit(100);
  const currency = user.currency ?? "NPR";

  if (input.aggregate === "count") {
    return {
      response: `### Budget count\n\nFound **${rows.length}** matching budgets.`,
      toolCalls: [
        {
          name: "query_budgets" as const,
          label: "Budgets queried",
          status: "success" as const,
          input: input as unknown as Record<string, unknown>,
        },
      ],
    };
  }

  if (input.aggregate !== "list") {
    const total = rows.reduce((sum, row) => {
      if (input.aggregate === "current_amount") {
        return sum + Number(row.budget.currentAmount);
      }

      if (input.aggregate === "allocations_sum") {
        return sum + Number(row.budget.currentAmount);
      }

      if (input.aggregate === "target_amount") {
        return sum + Number(row.budget.targetAmount ?? 0);
      }

      if (input.aggregate === "remaining") {
        return (
          sum +
          Math.max(
            Number(row.budget.targetAmount ?? 0) -
              Number(row.budget.currentAmount),
            0,
          )
        );
      }

      return sum;
    }, 0);

    return {
      response: `### Budget ${input.aggregate.replace("_", " ")}\n\n**Total:** ${formatMoney(total, currency)}`,
      toolCalls: [
        {
          name: "query_budgets" as const,
          label: "Budgets queried",
          status: "success" as const,
          input: input as unknown as Record<string, unknown>,
        },
      ],
    };
  }

  const response = [
    "### Budgets",
    "",
    rows.length
      ? rows
          .map((row) => {
            const target = row.budget.targetAmount
              ? formatMoney(Number(row.budget.targetAmount), currency)
              : "no target";
            const saved = formatMoney(
              Number(row.budget.currentAmount),
              currency,
            );
            const reminder = row.budget.notificationEnabled
              ? `, reminder ${row.budget.notificationCadence}${
                  row.budget.notificationDayOfMonth
                    ? ` on day ${row.budget.notificationDayOfMonth}`
                    : ""
                }`
              : "";
            const category = row.category?.name
              ? `, ${row.category.emoji} ${row.category.name}`
              : "";

            return `- **${row.budget.name}:** ${saved} saved of ${target} (${row.budget.status}${category}${reminder})`;
          })
          .join("\n")
      : "No matching budgets found.",
  ].join("\n");

  return {
    response,
    toolCalls: [
      {
        name: "query_budgets" as const,
        label: "Budgets queried",
        status: "success" as const,
        input: input as unknown as Record<string, unknown>,
      },
    ],
  };
};

export const updateBudget = async ({
  user,
  input,
  now = new Date(),
}: {
  user: BudgetUserContext;
  input: UpdateBudgetInput;
  now?: Date;
}) => {
  const budget = await findBudget({
    userId: user.id,
    ...budgetLookup(input),
  });

  if (!budget) {
    return {
      response: "### Budget not found\n\nI could not find that budget.",
      toolCalls: [],
    };
  }

  const changes = input.changes;
  const [updatedBudget] = await db
    .update(budgets)
    .set({
      ...(changes.name ? { name: normalizeBudgetName(changes.name) } : {}),
      ...(changes.target_amount
        ? { targetAmount: changes.target_amount.toFixed(2) }
        : {}),
      ...(changes.target_date ? { targetDate: changes.target_date } : {}),
      ...(changes.recurring_contribution
        ? { recurringContribution: changes.recurring_contribution.toFixed(2) }
        : {}),
      ...(changes.contribution_cadence
        ? { contributionCadence: changes.contribution_cadence }
        : {}),
      ...(changes.status ? { status: changes.status } : {}),
      ...(changes.notification
        ? notificationValues({ input: changes.notification, now })
        : {}),
      updatedAt: now,
    })
    .where(eq(budgets.id, budget.id))
    .returning();

  if (!updatedBudget) {
    throw new Error("Could not update budget");
  }

  return {
    response: `### Budget updated\n\n**Budget:** ${updatedBudget.name}`,
    toolCalls: [
      toolCall({
        name: "update_budget",
        label: "Budget updated",
        input: input as unknown as Record<string, unknown>,
        budget: updatedBudget,
      }),
    ],
  };
};

export const deleteBudget = async ({
  user,
  input,
}: {
  user: BudgetUserContext;
  input: DeleteBudgetInput;
}) => {
  const budget = await findBudget({
    userId: user.id,
    ...budgetLookup(input),
  });

  if (!budget) {
    return {
      response: "### Budget not found\n\nI could not find that budget.",
      toolCalls: [],
    };
  }

  const [updatedBudget] = await db
    .update(budgets)
    .set({
      status: "archived",
      notificationEnabled: false,
      notificationCadence: "none",
      nextNotificationAt: null,
      updatedAt: new Date(),
    })
    .where(eq(budgets.id, budget.id))
    .returning();

  const archivedBudget = updatedBudget ?? budget;

  return {
    response: `### Budget archived\n\n**Budget:** ${archivedBudget.name}`,
    toolCalls: [
      toolCall({
        name: "delete_budget",
        label: "Budget archived",
        input: input as unknown as Record<string, unknown>,
        budget: archivedBudget,
      }),
    ],
  };
};
