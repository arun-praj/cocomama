export const transactionTypes = ["expense", "income", "savings"] as const;
export const budgetStatuses = ["active", "completed", "archived"] as const;
export const transactionAggregates = [
  "sum",
  "count",
  "avg",
  "list",
  "net",
] as const;
export const transactionGroupBys = [
  "category",
  "merchant",
  "date",
  "type",
  "none",
] as const;
export const transactionSorts = ["date_desc", "amount_desc", "none"] as const;
export const budgetAggregates = [
  "current_amount",
  "target_amount",
  "remaining",
  "allocations_sum",
  "list",
  "count",
] as const;
export const budgetContributionCadences = ["none", "monthly"] as const;
export const budgetNotificationCadences = [
  "none",
  "once",
  "daily",
  "monthly",
] as const;
export const userQueryFields = [
  "balance",
  "profile",
  "currency",
  "timezone",
  "all",
] as const;

export type TransactionType = (typeof transactionTypes)[number];
export type BudgetStatus = (typeof budgetStatuses)[number];
export type TransactionAggregate = (typeof transactionAggregates)[number];
export type TransactionGroupBy = (typeof transactionGroupBys)[number];
export type TransactionSort = (typeof transactionSorts)[number];
export type BudgetAggregate = (typeof budgetAggregates)[number];
export type BudgetContributionCadence =
  (typeof budgetContributionCadences)[number];
export type BudgetNotificationCadence =
  (typeof budgetNotificationCadences)[number];
export type UserQueryField = (typeof userQueryFields)[number];

export interface BudgetNotificationInput {
  cadence?: BudgetNotificationCadence | undefined;
  day_of_month?: number | undefined;
  until_paid_off?: boolean | undefined;
  next_notify_at?: string | undefined;
}

export interface CreateTransactionInput {
  type: TransactionType;
  amount: number;
  currency?: string | undefined;
  original_amount?: number | undefined;
  original_currency?: string | undefined;
  exchange_rate?: number | undefined;
  category: string;
  title?: string;
  description: string;
  merchant?: string;
  savings_instrument?: string;
  tags?: string[];
  is_recurring?: boolean;
  occurred_at: string;
  suggested_new_category?: string;
}

export interface QueryTransactionsInput {
  filters: {
    type?: TransactionType;
    category?: string;
    merchant?: string;
    description_contains?: string;
    date_start?: string;
    date_end?: string;
    amount_min?: number;
    amount_max?: number;
  };
  aggregate: TransactionAggregate;
  group_by?: TransactionGroupBy;
  sort?: TransactionSort;
  limit?: number;
}

export interface CreateBudgetInput {
  name: string;
  category?: string | undefined;
  target_amount?: number | undefined;
  target_date?: string | undefined;
  recurring_contribution?: number | undefined;
  contribution_cadence?: BudgetContributionCadence | undefined;
  notification?: BudgetNotificationInput | undefined;
}

export interface AllocateToBudgetInput {
  budget_id?: string | undefined;
  budget_name?: string | undefined;
  amount: number;
  occurred_at?: string | undefined;
  note?: string | undefined;
  source_transaction_id?: string | undefined;
}

export interface QueryBudgetsInput {
  name_query?: string | undefined;
  status?: BudgetStatus | undefined;
  target_min?: number | undefined;
  target_max?: number | undefined;
  remaining_min?: number | undefined;
  remaining_max?: number | undefined;
  notification_due_before?: string | undefined;
  allocation_date_start?: string | undefined;
  allocation_date_end?: string | undefined;
  aggregate: BudgetAggregate;
}

export interface QueryUserInput {
  fields?: UserQueryField[];
}

export interface QueryCategoriesInput {
  kind?: TransactionType;
}

export interface ClarifyInput {
  question: string;
  suggestions?: string[];
}

export interface CreateCategoryInput {
  kind: TransactionType;
  name: string;
}

export interface UpdateCategoryInput {
  kind: TransactionType;
  name: string;
  new_name: string;
}

export interface DeleteCategoryInput {
  kind: TransactionType;
  name: string;
}

export interface ModifyTransactionInput {
  transaction_id: string;
  changes?: Partial<Omit<CreateTransactionInput, "suggested_new_category">> & {
    notes?: string;
  };
  delete?: boolean;
}

export interface UpdateBudgetInput {
  budget_id?: string | undefined;
  budget_name?: string | undefined;
  changes: {
    name?: string | undefined;
    category?: string | undefined;
    target_amount?: number | undefined;
    target_date?: string | undefined;
    recurring_contribution?: number | undefined;
    contribution_cadence?: BudgetContributionCadence | undefined;
    notification?: BudgetNotificationInput | undefined;
    status?: BudgetStatus | undefined;
  };
}

export interface DeleteBudgetInput {
  budget_id?: string | undefined;
  budget_name?: string | undefined;
}

export interface ModifyBudgetAllocationInput {
  allocation_id: string;
  changes?: {
    amount?: number;
    note?: string;
    occurred_at?: string;
    source_transaction_id?: string | null;
  };
  delete?: boolean;
}

export interface SpendFromBudgetInput {
  budget_id?: string;
  budget_name?: string;
  amount: number;
  category: string;
  description: string;
  merchant?: string;
  occurred_at: string;
}

export interface ToolInputByName {
  create_transaction: CreateTransactionInput;
  query_transactions: QueryTransactionsInput;
  create_budget: CreateBudgetInput;
  allocate_to_budget: AllocateToBudgetInput;
  query_budgets: QueryBudgetsInput;
  query_user: QueryUserInput;
  query_categories: QueryCategoriesInput;
  clarify: ClarifyInput;
  create_category: CreateCategoryInput;
  update_category: UpdateCategoryInput;
  delete_category: DeleteCategoryInput;
  modify_transaction: ModifyTransactionInput;
  update_budget: UpdateBudgetInput;
  delete_budget: DeleteBudgetInput;
  modify_budget_allocation: ModifyBudgetAllocationInput;
  spend_from_budget: SpendFromBudgetInput;
}

export type ToolName = keyof ToolInputByName;

export type ToolErrorCode =
  | "validation_error"
  | "clarification_required"
  | "not_found"
  | "conflict"
  | "insufficient_budget"
  | "idempotent_duplicate"
  | "unauthorized"
  | "not_implemented"
  | "internal_error";

export interface ToolWarning {
  code: string;
  message: string;
}

export interface ToolError {
  code: ToolErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export type ToolResult<Data = unknown> =
  | {
      ok: true;
      data: Data;
      warnings?: ToolWarning[];
    }
  | {
      ok: false;
      error: ToolError;
    };
