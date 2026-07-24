import { z } from "zod";
import {
  budgetAggregates,
  budgetContributionCadences,
  budgetNotificationCadences,
  budgetStatuses,
  transactionAggregates,
  transactionGroupBys,
  transactionSorts,
  transactionTypes,
  userQueryFields,
  type ToolName,
} from "./types.js";

const positiveAmountSchema = z.number().positive();
const isoDateSchema = z.string().min(1);
const uuidSchema = z.string().uuid();
const optionalNameSchema = z.string().min(1).optional();

const budgetNotificationSchema = z
  .object({
    cadence: z.enum(budgetNotificationCadences).optional(),
    day_of_month: z.number().int().min(1).max(31).optional(),
    until_paid_off: z.boolean().optional(),
    next_notify_at: isoDateSchema.optional(),
  })
  .strict();

export const createTransactionInputSchema = z
  .object({
    type: z.enum(transactionTypes),
    amount: positiveAmountSchema,
    currency: z.string().length(3).optional(),
    original_amount: positiveAmountSchema.optional(),
    original_currency: z.string().length(3).optional(),
    exchange_rate: positiveAmountSchema.optional(),
    category: z.string().min(1),
    title: z.string().min(1).optional(),
    description: z.string().min(1),
    merchant: optionalNameSchema,
    savings_instrument: optionalNameSchema,
    tags: z.array(z.string().min(1)).optional(),
    is_recurring: z.boolean().optional(),
    occurred_at: isoDateSchema,
    suggested_new_category: optionalNameSchema,
  })
  .strict();

export const queryTransactionsInputSchema = z
  .object({
    filters: z
      .object({
        type: z.enum(transactionTypes).optional(),
        category: optionalNameSchema,
        merchant: optionalNameSchema,
        description_contains: optionalNameSchema,
        date_start: isoDateSchema.optional(),
        date_end: isoDateSchema.optional(),
        amount_min: positiveAmountSchema.optional(),
        amount_max: positiveAmountSchema.optional(),
      })
      .strict(),
    aggregate: z.enum(transactionAggregates),
    group_by: z.enum(transactionGroupBys).optional(),
    sort: z.enum(transactionSorts).optional(),
    limit: z.number().int().positive().max(200).optional(),
  })
  .strict();

export const createBudgetInputSchema = z
  .object({
    name: z.string().min(1),
    category: optionalNameSchema,
    target_amount: positiveAmountSchema.optional(),
    target_date: isoDateSchema.optional(),
    recurring_contribution: positiveAmountSchema.optional(),
    contribution_cadence: z.enum(budgetContributionCadences).optional(),
    notification: budgetNotificationSchema.optional(),
  })
  .strict();

export const allocateToBudgetInputSchema = z
  .object({
    budget_id: uuidSchema.optional(),
    budget_name: optionalNameSchema,
    amount: positiveAmountSchema,
    occurred_at: isoDateSchema.optional(),
    note: optionalNameSchema,
    source_transaction_id: uuidSchema.optional(),
  })
  .strict();

export const queryBudgetsInputSchema = z
  .object({
    name_query: optionalNameSchema,
    status: z.enum(budgetStatuses).optional(),
    target_min: positiveAmountSchema.optional(),
    target_max: positiveAmountSchema.optional(),
    remaining_min: z.number().min(0).optional(),
    remaining_max: z.number().min(0).optional(),
    notification_due_before: isoDateSchema.optional(),
    allocation_date_start: isoDateSchema.optional(),
    allocation_date_end: isoDateSchema.optional(),
    aggregate: z.enum(budgetAggregates),
  })
  .strict();

export const queryUserInputSchema = z
  .object({
    fields: z.array(z.enum(userQueryFields)).optional(),
  })
  .strict();

export const queryCategoriesInputSchema = z
  .object({
    kind: z.enum(transactionTypes).optional(),
  })
  .strict();

export const clarifyInputSchema = z
  .object({
    question: z.string().min(1),
    suggestions: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const createCategoryInputSchema = z
  .object({
    kind: z.enum(transactionTypes),
    name: z.string().min(1),
  })
  .strict();

export const updateCategoryInputSchema = z
  .object({
    kind: z.enum(transactionTypes),
    name: z.string().min(1),
    new_name: z.string().min(1),
  })
  .strict();

export const deleteCategoryInputSchema = z
  .object({
    kind: z.enum(transactionTypes),
    name: z.string().min(1),
  })
  .strict();

export const modifyTransactionInputSchema = z
  .object({
    transaction_id: uuidSchema,
    changes: createTransactionInputSchema
      .omit({ suggested_new_category: true })
      .partial()
      .extend({ notes: z.string().min(1).optional() })
      .optional(),
    delete: z.boolean().optional(),
  })
  .strict();

export const updateBudgetInputSchema = z
  .object({
    budget_id: uuidSchema.optional(),
    budget_name: optionalNameSchema,
    changes: z
      .object({
        name: optionalNameSchema,
        target_amount: positiveAmountSchema.optional(),
        target_date: isoDateSchema.optional(),
        recurring_contribution: positiveAmountSchema.optional(),
        contribution_cadence: z.enum(budgetContributionCadences).optional(),
        notification: budgetNotificationSchema.optional(),
        status: z.enum(budgetStatuses).optional(),
      })
      .strict(),
  })
  .strict();

export const deleteBudgetInputSchema = z
  .object({
    budget_id: uuidSchema.optional(),
    budget_name: optionalNameSchema,
  })
  .strict();

export const modifyBudgetAllocationInputSchema = z
  .object({
    allocation_id: uuidSchema,
    changes: z
      .object({
        amount: positiveAmountSchema.optional(),
        note: optionalNameSchema,
        occurred_at: isoDateSchema.optional(),
        source_transaction_id: uuidSchema.nullable().optional(),
      })
      .strict()
      .optional(),
    delete: z.boolean().optional(),
  })
  .strict();

export const spendFromBudgetInputSchema = z
  .object({
    budget_id: uuidSchema.optional(),
    budget_name: optionalNameSchema,
    amount: positiveAmountSchema,
    category: z.string().min(1),
    description: z.string().min(1),
    merchant: optionalNameSchema,
    occurred_at: isoDateSchema,
  })
  .strict();

export const toolInputSchemas = {
  create_transaction: createTransactionInputSchema,
  query_transactions: queryTransactionsInputSchema,
  create_budget: createBudgetInputSchema,
  allocate_to_budget: allocateToBudgetInputSchema,
  query_budgets: queryBudgetsInputSchema,
  query_user: queryUserInputSchema,
  query_categories: queryCategoriesInputSchema,
  clarify: clarifyInputSchema,
  create_category: createCategoryInputSchema,
  update_category: updateCategoryInputSchema,
  delete_category: deleteCategoryInputSchema,
  modify_transaction: modifyTransactionInputSchema,
  update_budget: updateBudgetInputSchema,
  delete_budget: deleteBudgetInputSchema,
  modify_budget_allocation: modifyBudgetAllocationInputSchema,
  spend_from_budget: spendFromBudgetInputSchema,
} satisfies Record<ToolName, z.ZodTypeAny>;

export const parseToolInput = (toolName: ToolName, input: unknown) =>
  toolInputSchemas[toolName].safeParse(input);
