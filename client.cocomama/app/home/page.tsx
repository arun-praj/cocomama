"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  CircleAlert,
  Flag,
  LoaderCircle,
  Menu,
  Plus,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { resolveTransactionEmoji } from "@/lib/transaction-emoji";
import { AppSideNavigation } from "../components/app-side-navigation";

type TransactionType = "expense" | "income" | "savings";
type TransactionRangePeriod = "weekly" | "month" | "yearly" | "custom";

type AppUser = {
  id?: string;
  email?: string;
  currency?: string;
  spendableAmount?: number;
};

type AppMeResponse = {
  user?: AppUser;
  error?: string;
};

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

type TransactionSummary = {
  count: number;
  totalAmount: number;
};

type TransactionsResponse = {
  currency: string;
  timeZone: string;
  range?: {
    period: TransactionRangePeriod;
    startDate: string;
    endDate: string;
  };
  transactions: Record<TransactionType, TransactionListItem[]>;
  summary: Record<TransactionType, TransactionSummary> & {
    net: number;
  };
};

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

type BudgetsResponse = {
  budgets: BudgetListItem[];
};

type CategoryKind = "expense" | "income" | "savings";

type CategoryItem = {
  id: string;
  kind: CategoryKind;
  name: string;
  emoji: string;
  keywords: string[];
  isDefault: boolean;
};

type CategoriesResponse = {
  categories?: CategoryItem[];
  error?: string;
  message?: string;
};

type GoalFormState = {
  name: string;
  category: string;
  targetAmount: string;
  targetDate: string;
  recurringContribution: string;
  reminderCadence: "none" | "once" | "daily" | "monthly";
  reminderDayOfMonth: string;
};

const transactionTypes: TransactionType[] = ["expense", "income", "savings"];
const budgetInsightStoragePrefix = "cocomama:home-budget-insight";
const initialHomeTransactionLimit = 100;
const budgetInsightPrefixPattern = /^AI insight:\s*/i;
const emptyGoalForm: GoalFormState = {
  name: "",
  category: "",
  targetAmount: "",
  targetDate: "",
  recurringContribution: "",
  reminderCadence: "none",
  reminderDayOfMonth: "1",
};

const needCategoryMatchers = [
  "housing",
  "rent",
  "mortgage",
  "utilities",
  "food",
  "grocery",
  "groceries",
  "transport",
  "fuel",
  "healthcare",
  "medical",
  "insurance",
  "education",
  "school",
  "family",
  "child",
  "debt",
  "loan",
];

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded-md bg-surface-muted ${className}`}
    />
  );
}

function HomeDashboardSkeleton() {
  return (
    <section
      className="relative overflow-hidden rounded-xl border border-primary/10 bg-linear-to-br from-[#f8fbf7] via-[#edf7f2] to-[#fff6dc] p-4 shadow-[0_16px_38px_rgba(36,92,87,0.09)] ring-1 ring-white/70 sm:p-5"
      aria-busy="true"
      aria-label="Loading account balance"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(116deg,rgba(255,255,255,0.74)_0%,rgba(255,255,255,0.18)_42%,rgba(255,255,255,0)_72%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-linear-to-r from-primary/35 via-[#d9a92f]/35 to-transparent"
        aria-hidden="true"
      />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <SkeletonBlock className="h-4 w-32" />
          <SkeletonBlock className="mt-2 h-9 w-60 max-w-full rounded-lg sm:h-11" />
          <SkeletonBlock className="mt-3 h-4 w-52 max-w-full" />
          <div className="mt-3 flex max-w-2xl items-start gap-1.5">
            <SkeletonBlock className="size-4 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <SkeletonBlock className="h-3 w-full max-w-lg" />
              <SkeletonBlock className="mt-2 h-3 w-4/5 max-w-md" />
            </div>
          </div>
        </div>
        <SkeletonBlock className="size-11 shrink-0 rounded-xl" />
      </div>
    </section>
  );
}

function BudgetStripSkeleton() {
  return (
    <section
      className="grid gap-1.5"
      aria-busy="true"
      aria-label="Loading active budgets"
    >
      <div className="flex items-center justify-between px-1">
        <SkeletonBlock className="h-4 w-10" />
        <SkeletonBlock className="h-3 w-16" />
      </div>
      <div className="scrollbar-none -mx-3 flex snap-x gap-2 overflow-hidden px-3 pb-1 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {[0, 1, 2].map((item) => (
          <article
            key={item}
            className="w-34 shrink-0 snap-start rounded-xl border border-border/60 bg-surface p-2.5 shadow-sm ring-1 ring-white/60 sm:w-38"
          >
            <div className="grid gap-2">
              <div className="flex items-start justify-between gap-2">
                <SkeletonBlock className="size-10 rounded-full" />
                <SkeletonBlock className="h-4 w-9 rounded-full" />
              </div>
              <div className="min-w-0">
                <SkeletonBlock className="h-3.5 w-20" />
                <SkeletonBlock className="mt-1.5 h-2.5 w-24" />
              </div>
              <div>
                <SkeletonBlock className="h-3.5 w-18" />
                <SkeletonBlock className="mt-1.5 h-2.5 w-22" />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function TransactionListSkeleton() {
  return (
    <section
      className="grid gap-2"
      aria-busy="true"
      aria-label="Loading transactions"
    >
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 px-0 py-0.5">
        <div className="min-w-0">
          <SkeletonBlock className="h-4 w-36" />
          <SkeletonBlock className="mt-1.5 h-3 w-48 max-w-full" />
        </div>
        <div className="shrink-0 text-right">
          <SkeletonBlock className="h-3.5 w-20" />
          <SkeletonBlock className="mt-1.5 h-2.5 w-14" />
        </div>
      </header>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {["w-28", "w-36", "w-24"].map((widthClass, index) => (
          <div
            key={`${widthClass}-${index}`}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5"
          >
            <SkeletonBlock className="size-9 rounded-full" />
            <div className="min-w-0">
              <SkeletonBlock className={`h-3.5 ${widthClass}`} />
              <SkeletonBlock className="mt-1.5 h-2.5 w-full max-w-48" />
            </div>
            <SkeletonBlock className="h-3.5 w-18" />
          </div>
        ))}
      </div>
    </section>
  );
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatDate(value: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      timeZone,
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatTime(value: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en", {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function formatBudgetDate(value: string | null) {
  if (!value) {
    return "No target date";
  }

  try {
    return new Intl.DateTimeFormat("en", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value}T00:00:00.000Z`));
  } catch {
    return value;
  }
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "0%";
  }

  return `${Math.round(value)}%`;
}

function getBudgetRemainingAmount(budget: BudgetListItem) {
  return Math.max(0, (budget.targetAmount ?? 0) - budget.currentAmount);
}

function getBudgetRemainingPercent(budget: BudgetListItem) {
  if (!budget.targetAmount || budget.targetAmount <= 0) {
    return 0;
  }

  return Math.max(0, 100 - budget.progressPercent);
}

function getBudgetDateDistance(value: string | null) {
  if (!value) {
    return "No date set";
  }

  const today = new Date();
  const targetDate = new Date(`${value}T00:00:00.000Z`);
  const days = Math.ceil((targetDate.getTime() - today.getTime()) / 86_400_000);

  if (Number.isNaN(days)) {
    return "No date set";
  }

  if (days < 0) {
    return `${Math.abs(days)} days overdue`;
  }

  if (days === 0) {
    return "Due today";
  }

  if (days === 1) {
    return "1 day left";
  }

  return `${days} days left`;
}

function getBudgetMonthlyPlanLabel(budget: BudgetListItem, currency: string) {
  if (!budget.recurringContribution || budget.contributionCadence === "none") {
    return "No monthly plan";
  }

  return `${formatMoney(budget.recurringContribution, currency)} monthly`;
}

function parsePositiveAmount(value: string) {
  const amount = Number(value);

  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function getTodayKey(timeZone: string) {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone,
      })
        .formatToParts(new Date())
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );

    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function getBudgetInsightStorageKey(user: AppUser | null, currency: string) {
  return `${budgetInsightStoragePrefix}:${user?.id ?? user?.email ?? "local"}:${currency}`;
}

function isNeedExpense(item: TransactionListItem) {
  const searchableText = [
    item.category,
    item.description,
    item.title,
    item.merchant,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return needCategoryMatchers.some((matcher) =>
    searchableText.includes(matcher),
  );
}

function buildBudgetRuleInsight(
  transactionsData: TransactionsResponse,
  currency: string,
) {
  const incomeTotal = transactionsData.summary.income.totalAmount;
  const savingsTotal = transactionsData.summary.savings.totalAmount;
  const expenseItems = transactionsData.transactions.expense;
  const needsTotal = expenseItems
    .filter(isNeedExpense)
    .reduce((total, item) => total + item.amount, 0);
  const wantsTotal = Math.max(
    0,
    transactionsData.summary.expense.totalAmount - needsTotal,
  );

  if (incomeTotal <= 0) {
    return "Add this month's income to compare your spending with the 50/30/20 rule.";
  }

  const needsPercent = (needsTotal / incomeTotal) * 100;
  const wantsPercent = (wantsTotal / incomeTotal) * 100;
  const savingsPercent = (savingsTotal / incomeTotal) * 100;
  const savingsGap = Math.max(0, incomeTotal * 0.2 - savingsTotal);
  const wantsOverage = Math.max(0, wantsTotal - incomeTotal * 0.3);
  const needsOverage = Math.max(0, needsTotal - incomeTotal * 0.5);
  const ratioText = `${formatPercent(needsPercent)} / ${formatPercent(
    wantsPercent,
  )} / ${formatPercent(savingsPercent)}`;

  if (savingsGap > 0) {
    return `50/30/20 is ${ratioText}. Savings are short by ${formatMoney(
      savingsGap,
      currency,
    )}; trim wants first if you can.`;
  }

  if (wantsOverage > 0) {
    return `Wants are ${formatPercent(
      wantsPercent,
    )} vs 30%. Cut about ${formatMoney(
      wantsOverage,
      currency,
    )} to stay balanced.`;
  }

  if (needsOverage > 0) {
    return `Needs are ${formatPercent(
      needsPercent,
    )} vs 50%. Review fixed bills before adding new wants.`;
  }

  return `You are aligned with 50/30/20 at ${ratioText}. Keep savings at 20%+.`;
}

function normalizeBudgetInsight(insight: string) {
  return insight.replace(budgetInsightPrefixPattern, "");
}

function getDailyBudgetInsight({
  transactionsData,
  user,
  currency,
}: {
  transactionsData: TransactionsResponse;
  user: AppUser | null;
  currency: string;
}) {
  const todayKey = getTodayKey(transactionsData.timeZone);
  const storageKey = getBudgetInsightStorageKey(user, currency);

  try {
    const cachedInsight = JSON.parse(
      localStorage.getItem(storageKey) ?? "null",
    ) as { dateKey?: string; insight?: string } | null;

    if (
      cachedInsight?.dateKey === todayKey &&
      typeof cachedInsight.insight === "string"
    ) {
      return normalizeBudgetInsight(cachedInsight.insight);
    }
  } catch {
    // Ignore bad local cache and regenerate below.
  }

  const insight = buildBudgetRuleInsight(transactionsData, currency);

  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ dateKey: todayKey, insight }),
    );
  } catch {
    // Local storage can be unavailable in private or restricted contexts.
  }

  return insight;
}

function emptyTransactions(): TransactionsResponse {
  return {
    currency: "NPR",
    timeZone: "Asia/Kathmandu",
    transactions: {
      expense: [],
      income: [],
      savings: [],
    },
    summary: {
      expense: { count: 0, totalAmount: 0 },
      income: { count: 0, totalAmount: 0 },
      savings: { count: 0, totalAmount: 0 },
      net: 0,
    },
  };
}

function getSortedTransactions(transactionsData: TransactionsResponse) {
  return transactionTypes
    .flatMap((type) => transactionsData.transactions[type])
    .sort((left, right) => {
      const occurredDifference =
        new Date(right.occurredAt).getTime() -
        new Date(left.occurredAt).getTime();

      if (occurredDifference !== 0) {
        return occurredDifference;
      }

      return (
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      );
    });
}

function TransactionRow({
  item,
  currency,
  timeZone,
}: {
  item: TransactionListItem;
  currency: string;
  timeZone: string;
}) {
  const isIncome = item.type === "income";
  const isSavings = item.type === "savings";
  const detailLabel =
    item.category ??
    item.savingsInstrument ??
    item.merchant ??
    item.description;
  const metaSubject = item.category
    ? (item.merchant ?? item.savingsInstrument ?? item.description)
    : null;
  const timestamp = [
    formatDate(item.occurredAt, timeZone),
    formatTime(item.occurredAt, timeZone),
  ]
    .filter(Boolean)
    .join(", ");
  const meta = [timestamp, detailLabel, metaSubject]
    .filter(Boolean)
    .join(" - ");
  const transactionEmoji = resolveTransactionEmoji(item);

  return (
    <motion.li
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 transition hover:bg-surface-muted/60 sm:px-3.5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <span
        className={`grid size-9 place-items-center rounded-full ${
          isIncome
            ? "bg-emerald-50 text-success"
            : isSavings
              ? "bg-blue-50 text-info"
              : "bg-red-50 text-danger"
        }`}
        aria-hidden="true"
      >
        <span className="text-lg leading-none">{transactionEmoji}</span>
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold leading-5 text-text">
          {item.title}
        </p>
        <p className="mt-0.5 truncate text-xs leading-4 text-text-soft">
          {meta || formatDate(item.occurredAt, timeZone)}
          {item.isRecurring ? " - Recurring" : ""}
        </p>
      </div>
      <div className="min-w-24 text-right">
        <p
          className={`whitespace-nowrap text-sm font-bold ${
            isIncome ? "text-success" : isSavings ? "text-info" : "text-danger"
          }`}
        >
          {isIncome ? "+" : isSavings ? "" : "-"}
          {formatMoney(item.amount, currency)}
        </p>
        <p className="mt-0.5 text-[11px] capitalize text-text-soft">
          {item.type}
        </p>
      </div>
    </motion.li>
  );
}

function BudgetCard({
  budget,
  currency,
  onSelect,
}: {
  budget: BudgetListItem;
  currency: string;
  onSelect: (budget: BudgetListItem) => void;
}) {
  const progressRadius = 14;
  const progressCircumference = 2 * Math.PI * progressRadius;
  const progressOffset =
    progressCircumference -
    (Math.min(100, Math.max(0, budget.progressPercent)) / 100) *
      progressCircumference;
  const targetLabel = budget.targetAmount
    ? `of ${formatMoney(budget.targetAmount, currency)}`
    : "target not set";

  return (
    <motion.button
      className="w-34 shrink-0 snap-start rounded-xl border border-border/60 bg-surface p-2.5 text-left shadow-sm ring-1 ring-white/60 transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_8px_18px_rgba(15,23,42,0.065)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 sm:w-38"
      type="button"
      aria-label={`Open ${budget.name} goal details`}
      onClick={() => onSelect(budget)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <div className="grid gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="relative grid size-10 place-items-center rounded-full bg-linear-to-br from-[#fff7d6] via-[#edf7ef] to-[#dff0ea] text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.86)]">
            <svg
              className="absolute inset-0 size-10 -rotate-90"
              viewBox="0 0 40 40"
              aria-hidden="true"
            >
              <circle
                cx="20"
                cy="20"
                r={progressRadius}
                fill="none"
                stroke="rgba(36,92,87,0.13)"
                strokeWidth="3.5"
              />
              <circle
                cx="20"
                cy="20"
                r={progressRadius}
                fill="none"
                stroke="var(--primary)"
                strokeLinecap="round"
                strokeWidth="3.5"
                strokeDasharray={progressCircumference}
                strokeDashoffset={progressOffset}
              />
            </svg>
            <span className="relative text-base leading-none">
              {budget.categoryEmoji ?? "B"}
            </span>
          </div>
          <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px] font-bold text-text-soft">
            {budget.progressPercent}%
          </span>
        </div>

        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold leading-4 text-text">
            {budget.name}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-text-soft">
            {budget.category ?? "Budget"} -{" "}
            {formatBudgetDate(budget.targetDate)}
          </p>
        </div>

        <div>
          <p className="text-[13px] font-bold text-primary">
            {formatMoney(budget.currentAmount, currency)}
          </p>
          <p className="mt-0.5 truncate text-[10px] font-semibold text-text-soft">
            {targetLabel}
          </p>
        </div>
      </div>
    </motion.button>
  );
}

export default function HomePage() {
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const [transactionsData, setTransactionsData] =
    useState<TransactionsResponse>(() => emptyTransactions());
  const [budgets, setBudgets] = useState<BudgetListItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [goalForm, setGoalForm] = useState<GoalFormState>(emptyGoalForm);
  const [goalFormError, setGoalFormError] = useState("");
  const [isAddGoalOpen, setIsAddGoalOpen] = useState(false);
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<BudgetListItem | null>(
    null,
  );
  const [isShowingAllTransactions, setIsShowingAllTransactions] =
    useState(false);
  const [budgetInsight, setBudgetInsight] = useState(
    "Preparing your 50/30/20 check.",
  );
  const allTransactions = getSortedTransactions(transactionsData);
  const visibleTransactions = isShowingAllTransactions
    ? allTransactions
    : allTransactions.slice(0, initialHomeTransactionLimit);
  const hiddenTransactionCount =
    allTransactions.length - visibleTransactions.length;
  const currency = user?.currency ?? transactionsData.currency;
  const spendableAmount = user?.spendableAmount ?? 0;
  const budgetCategories = categories.filter(
    (category) => category.kind === "expense" || category.kind === "savings",
  );

  async function refreshBudgets() {
    const response = await fetch("/api/app/budgets", {
      cache: "no-store",
      credentials: "include",
    });
    const body = (await response.json().catch(() => null)) as
      | BudgetsResponse
      | { error?: string }
      | null;

    if (!response.ok || !body || !("budgets" in body)) {
      throw new Error("Goals could not load.");
    }

    setBudgets(body.budgets);
  }

  function openAddGoalSheet() {
    setGoalForm({
      ...emptyGoalForm,
      category: budgetCategories[0]?.name ?? categories[0]?.name ?? "",
    });
    setGoalFormError("");
    setIsAddGoalOpen(true);
  }

  async function handleAddGoalSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const targetAmount = parsePositiveAmount(goalForm.targetAmount);
    const recurringContribution = goalForm.recurringContribution.trim()
      ? parsePositiveAmount(goalForm.recurringContribution)
      : null;

    if (!goalForm.name.trim()) {
      setGoalFormError("Enter a goal name.");
      return;
    }

    if (!goalForm.category.trim()) {
      setGoalFormError("Choose a category.");
      return;
    }

    if (!targetAmount) {
      setGoalFormError("Enter a target amount greater than 0.");
      return;
    }

    if (goalForm.recurringContribution.trim() && !recurringContribution) {
      setGoalFormError("Monthly contribution must be greater than 0.");
      return;
    }

    setIsSavingGoal(true);
    setGoalFormError("");

    try {
      const reminderDay = Number(goalForm.reminderDayOfMonth);
      const response = await fetch("/api/app/budgets", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: goalForm.name.trim(),
          category: goalForm.category,
          target_amount: targetAmount,
          ...(goalForm.targetDate ? { target_date: goalForm.targetDate } : {}),
          ...(recurringContribution
            ? {
                recurring_contribution: recurringContribution,
                contribution_cadence: "monthly",
              }
            : {}),
          ...(goalForm.reminderCadence === "none"
            ? {}
            : {
                notification: {
                  cadence: goalForm.reminderCadence,
                  until_paid_off: true,
                  ...(goalForm.reminderCadence === "monthly" &&
                  Number.isInteger(reminderDay) &&
                  reminderDay >= 1 &&
                  reminderDay <= 31
                    ? { day_of_month: reminderDay }
                    : {}),
                },
              }),
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        error?: string;
      } | null;

      if (!response.ok || body?.ok === false) {
        throw new Error(body?.message ?? "Goal could not be created.");
      }

      await refreshBudgets();
      setGoalForm(emptyGoalForm);
      setIsAddGoalOpen(false);
    } catch (addGoalError) {
      setGoalFormError(
        addGoalError instanceof Error
          ? addGoalError.message
          : "Goal could not be created.",
      );
    } finally {
      setIsSavingGoal(false);
    }
  }

  useEffect(() => {
    let isActive = true;

    async function loadHomeDashboard() {
      setIsLoading(true);
      setError("");
      setIsShowingAllTransactions(false);

      try {
        const [
          meResponse,
          transactionsResponse,
          budgetsResponse,
          categoriesResponse,
        ] = await Promise.all([
          fetch("/api/app/me", {
            cache: "no-store",
            credentials: "include",
          }),
          fetch("/api/app/transactions?period=month", {
            cache: "no-store",
            credentials: "include",
          }),
          fetch("/api/app/budgets", {
            cache: "no-store",
            credentials: "include",
          }),
          fetch("/api/app/categories", {
            cache: "no-store",
            credentials: "include",
          }),
        ]);
        const meBody = (await meResponse
          .json()
          .catch(() => null)) as AppMeResponse | null;
        const transactionsBody = (await transactionsResponse
          .json()
          .catch(() => null)) as
          | TransactionsResponse
          | { error?: string }
          | null;
        const budgetsBody = (await budgetsResponse.json().catch(() => null)) as
          | BudgetsResponse
          | { error?: string }
          | null;
        const categoriesBody = (await categoriesResponse
          .json()
          .catch(() => null)) as CategoriesResponse | null;

        if (!meResponse.ok || !meBody?.user) {
          throw new Error("home_user_failed");
        }

        if (
          !transactionsResponse.ok ||
          !transactionsBody ||
          !("transactions" in transactionsBody)
        ) {
          throw new Error("home_transactions_failed");
        }

        if (
          !budgetsResponse.ok ||
          !budgetsBody ||
          !("budgets" in budgetsBody)
        ) {
          throw new Error("home_budgets_failed");
        }

        if (!categoriesResponse.ok || !categoriesBody?.categories) {
          throw new Error("home_categories_failed");
        }

        if (isActive) {
          const loadedTransactions = transactionsBody as TransactionsResponse;
          const loadedUser = meBody.user;

          setUser(meBody.user);
          setTransactionsData(loadedTransactions);
          setBudgets(budgetsBody.budgets);
          setCategories(categoriesBody.categories);
          setBudgetInsight(
            getDailyBudgetInsight({
              transactionsData: loadedTransactions,
              user: loadedUser,
              currency: loadedUser.currency ?? loadedTransactions.currency,
            }),
          );
        }
      } catch {
        if (isActive) {
          setError("Home dashboard could not load.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadHomeDashboard();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <main className="h-dvh overflow-hidden bg-background text-text">
      <div className="flex h-full min-h-0 w-full">
        <AppSideNavigation
          activeItem="Home"
          isOpen={isNavigationOpen}
          onClose={() => setIsNavigationOpen(false)}
        />

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="z-20 flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur lg:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <motion.button
                className="hidden size-10 place-items-center rounded-md border border-border bg-surface text-text-muted transition hover:text-text lg:grid"
                type="button"
                aria-label="Open navigation"
                onClick={() => setIsNavigationOpen(true)}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
              >
                <Menu className="size-5" strokeWidth={1.8} aria-hidden="true" />
              </motion.button>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text">Home</p>
                <p className="truncate text-xs text-text-soft">
                  Account balance and latest records
                </p>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto bg-background py-4 sm:bg-[radial-gradient(circle_at_88%_8%,rgba(36,92,87,0.08),transparent_28%),radial-gradient(circle_at_4%_92%,rgba(36,99,166,0.06),transparent_26%)]">
            <div className="mx-auto grid w-full max-w-5xl gap-3 px-3 pb-28 sm:px-6 lg:px-8 lg:pb-6">
              {isLoading ? (
                <HomeDashboardSkeleton />
              ) : (
                <motion.section
                  className="relative overflow-hidden rounded-xl border border-primary/10 bg-linear-to-br from-[#f8fbf7] via-[#edf7f2] to-[#fff6dc] p-4 shadow-[0_16px_38px_rgba(36,92,87,0.09)] ring-1 ring-white/70 transition-shadow hover:shadow-[0_20px_46px_rgba(36,92,87,0.13)] sm:p-5"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24, ease: "easeOut" }}
                  whileHover={{ y: -2 }}
                >
                  <div
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(116deg,rgba(255,255,255,0.74)_0%,rgba(255,255,255,0.18)_42%,rgba(255,255,255,0)_72%)]"
                    aria-hidden="true"
                  />
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-linear-to-r from-primary/35 via-[#d9a92f]/35 to-transparent"
                    aria-hidden="true"
                  />
                  <div className="relative flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-primary/80">
                        Spendable amount
                      </p>
                      <h1 className="mt-1 truncate text-3xl font-semibold leading-tight text-text sm:text-4xl">
                        {formatMoney(spendableAmount, currency)}
                      </h1>
                      <p className="mt-2 text-sm leading-6 text-text-muted">
                        Total amount left in your account.
                      </p>
                      <p className="mt-2 flex max-w-2xl items-start gap-1.5 whitespace-normal wrap-break-word text-xs leading-5 text-primary/85 sm:text-sm">
                        <span
                          className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
                          aria-label="AI insight"
                        >
                          <Sparkles
                            className="size-3"
                            strokeWidth={2}
                            aria-hidden="true"
                          />
                        </span>
                        <span>{budgetInsight}</span>
                      </p>
                    </div>
                    <motion.span
                      className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/78 text-primary shadow-[0_10px_24px_rgba(36,92,87,0.12)] ring-1 ring-primary/10 backdrop-blur"
                      initial={{ rotate: -4, scale: 0.92 }}
                      animate={{ rotate: 0, scale: 1 }}
                      transition={{ duration: 0.36, ease: "easeOut" }}
                    >
                      <Wallet
                        className="size-5"
                        strokeWidth={1.9}
                        aria-hidden="true"
                      />
                    </motion.span>
                  </div>
                </motion.section>
              )}

              {isLoading ? (
                <BudgetStripSkeleton />
              ) : (
                <motion.section
                  className="grid gap-1.5"
                  aria-label="Active budgets"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  <div className="flex items-center justify-between px-1">
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold leading-5 text-text">
                        Goal
                      </h2>
                      <p className="text-[11px] font-medium leading-4 text-text-soft">
                        {budgets.length} active
                      </p>
                    </div>
                    <motion.button
                      className="inline-flex h-7 items-center justify-center gap-1 rounded-full bg-black/5.5 px-2.5 text-[13px] font-medium text-[#007aff] transition hover:bg-black/8.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#007aff]/25"
                      type="button"
                      onClick={openAddGoalSheet}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.96 }}
                    >
                      <Plus
                        className="size-3.5"
                        strokeWidth={2.4}
                        aria-hidden="true"
                      />
                      Add
                    </motion.button>
                  </div>
                  {budgets.length > 0 ? (
                    <div className="scrollbar-none -mx-3 flex snap-x gap-2 overflow-x-auto px-3 pb-1 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
                      {budgets.map((budget) => (
                        <BudgetCard
                          key={budget.id}
                          budget={budget}
                          currency={currency}
                          onSelect={setSelectedBudget}
                        />
                      ))}
                    </div>
                  ) : (
                    <button
                      className="rounded-xl border border-dashed border-primary/25 bg-surface/75 px-4 py-5 text-left text-sm text-text-muted shadow-sm transition hover:border-primary/40 hover:bg-surface"
                      type="button"
                      onClick={openAddGoalSheet}
                    >
                      <span className="block font-semibold text-text">
                        Start your first goal
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-text-soft">
                        Add a target, monthly plan, and optional reminders.
                      </span>
                    </button>
                  )}
                </motion.section>
              )}

              {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">
                  {error}
                </div>
              ) : null}

              {isLoading ? (
                <TransactionListSkeleton />
              ) : (
                <motion.section
                  className="grid gap-2"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  aria-labelledby="home-transactions-heading"
                >
                  <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 px-0 py-0.5">
                    <div className="min-w-0">
                      <h2
                        id="home-transactions-heading"
                        className="truncate text-[15px] font-semibold leading-5 text-text"
                      >
                        This month&apos;s transactions
                      </h2>
                      <p className="mt-0.5 text-[11px] font-medium leading-4 text-text-soft">
                        Newest first
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-semibold text-text">
                        {formatMoney(
                          transactionsData.summary.net,
                          transactionsData.currency,
                        )}
                      </p>
                      <p className="text-[10px] leading-3 text-text-soft">
                        {allTransactions.length} records
                      </p>
                    </div>
                  </header>
                  {allTransactions.length > 0 ? (
                    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                      {visibleTransactions.map((item) => (
                        <TransactionRow
                          key={item.id}
                          item={item}
                          currency={transactionsData.currency}
                          timeZone={transactionsData.timeZone}
                        />
                      ))}
                      {hiddenTransactionCount > 0 ? (
                        <li className="px-2.5 py-2 text-center">
                          <button
                            className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary transition hover:bg-primary/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                            type="button"
                            onClick={() => setIsShowingAllTransactions(true)}
                          >
                            Show {hiddenTransactionCount} more
                          </button>
                        </li>
                      ) : null}
                    </ul>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-text-soft">
                      No transactions recorded this month.
                    </div>
                  )}
                </motion.section>
              )}
            </div>
          </div>
        </section>
      </div>

      <AnimatePresence>
        {isAddGoalOpen ? (
          <motion.div
            className="fixed inset-0 z-50 grid place-items-end bg-black/20 p-0 sm:place-items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-goal-title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <button
              className="absolute inset-0"
              type="button"
              aria-label="Close add goal form"
              onClick={() => setIsAddGoalOpen(false)}
              disabled={isSavingGoal}
            />
            <motion.form
              className="relative box-border max-h-[92dvh] w-full max-w-full overflow-x-hidden overflow-y-auto rounded-t-4xl border border-white/70 bg-[#f5f5f7]/95 p-4 shadow-[0_24px_70px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:max-w-xl sm:rounded-4xl sm:p-5"
              onSubmit={handleAddGoalSubmit}
              initial={{ y: 26, opacity: 0.96 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <div
                className="mx-auto mb-4 h-1 w-10 rounded-full bg-black/15 sm:hidden"
                aria-hidden="true"
              />
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2
                    id="add-goal-title"
                    className="text-xl font-semibold leading-tight text-text"
                  >
                    New Goal
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-text-muted">
                    Set the target, timing, and reminders.
                  </p>
                </div>
                <button
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-black/5 text-text-muted transition hover:bg-black/10 hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  aria-label="Close add goal form"
                  onClick={() => setIsAddGoalOpen(false)}
                  disabled={isSavingGoal}
                >
                  <X className="size-4" strokeWidth={1.9} aria-hidden="true" />
                </button>
              </div>

              <div className="mt-5 grid min-w-0 gap-3">
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-text">
                  Goal name
                  <input
                    className="min-h-12 w-full min-w-0 rounded-2xl border-0 bg-white px-4 text-base font-medium outline-none ring-1 ring-black/5 transition placeholder:text-text-soft focus:ring-2 focus:ring-[#007aff]/25"
                    value={goalForm.name}
                    onChange={(event) => {
                      setGoalForm((currentForm) => ({
                        ...currentForm,
                        name: event.target.value,
                      }));
                      setGoalFormError("");
                    }}
                    placeholder="Emergency fund"
                    disabled={isSavingGoal}
                  />
                </label>

                <label className="grid min-w-0 gap-2 text-sm font-semibold text-text">
                  Category
                  <select
                    className="min-h-12 w-full min-w-0 rounded-2xl border-0 bg-white px-4 text-base font-medium outline-none ring-1 ring-black/5 transition focus:ring-2 focus:ring-[#007aff]/25"
                    value={goalForm.category}
                    onChange={(event) => {
                      setGoalForm((currentForm) => ({
                        ...currentForm,
                        category: event.target.value,
                      }));
                      setGoalFormError("");
                    }}
                    disabled={isSavingGoal}
                  >
                    <option value="">Choose category</option>
                    {budgetCategories.map((category) => (
                      <option key={category.id} value={category.name}>
                        {category.emoji} {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <label className="grid min-w-0 gap-2 text-sm font-semibold text-text">
                    Target amount
                    <input
                      className="min-h-12 w-full min-w-0 rounded-2xl border-0 bg-white px-4 text-base font-medium outline-none ring-1 ring-black/5 transition placeholder:text-text-soft focus:ring-2 focus:ring-[#007aff]/25"
                      value={goalForm.targetAmount}
                      onChange={(event) => {
                        setGoalForm((currentForm) => ({
                          ...currentForm,
                          targetAmount: event.target.value,
                        }));
                        setGoalFormError("");
                      }}
                      inputMode="decimal"
                      placeholder="50000"
                      disabled={isSavingGoal}
                    />
                  </label>
                  <label className="grid min-w-0 gap-2 text-sm font-semibold text-text">
                    Target date
                    <input
                      className="min-h-12 w-full min-w-0 rounded-2xl border-0 bg-white px-4 text-base font-medium outline-none ring-1 ring-black/5 transition focus:ring-2 focus:ring-[#007aff]/25"
                      type="date"
                      value={goalForm.targetDate}
                      onChange={(event) => {
                        setGoalForm((currentForm) => ({
                          ...currentForm,
                          targetDate: event.target.value,
                        }));
                      }}
                      disabled={isSavingGoal}
                    />
                  </label>
                </div>

                <div className="grid min-w-0 gap-4 rounded-3xl bg-white p-3 ring-1 ring-black/5 sm:grid-cols-2">
                  <label className="grid min-w-0 gap-2 text-sm font-semibold text-text">
                    Monthly contribution
                    <input
                      className="min-h-11 w-full min-w-0 rounded-2xl border-0 bg-[#f5f5f7] px-3 text-sm font-medium outline-none transition placeholder:text-text-soft focus:ring-2 focus:ring-[#007aff]/25"
                      value={goalForm.recurringContribution}
                      onChange={(event) => {
                        setGoalForm((currentForm) => ({
                          ...currentForm,
                          recurringContribution: event.target.value,
                        }));
                        setGoalFormError("");
                      }}
                      inputMode="decimal"
                      placeholder="5000"
                      disabled={isSavingGoal}
                    />
                  </label>
                  <label className="grid min-w-0 gap-2 text-sm font-semibold text-text">
                    Reminder
                    <select
                      className="min-h-11 w-full min-w-0 rounded-2xl border-0 bg-[#f5f5f7] px-3 text-sm font-medium outline-none transition focus:ring-2 focus:ring-[#007aff]/25"
                      value={goalForm.reminderCadence}
                      onChange={(event) =>
                        setGoalForm((currentForm) => ({
                          ...currentForm,
                          reminderCadence: event.target
                            .value as GoalFormState["reminderCadence"],
                        }))
                      }
                      disabled={isSavingGoal}
                    >
                      <option value="none">No reminder</option>
                      <option value="daily">Daily</option>
                      <option value="monthly">Monthly</option>
                      <option value="once">Once</option>
                    </select>
                  </label>
                  {goalForm.reminderCadence === "monthly" ? (
                    <label className="grid min-w-0 gap-2 text-sm font-semibold text-text sm:col-span-2">
                      Monthly reminder day
                      <input
                        className="min-h-11 w-full min-w-0 rounded-2xl border-0 bg-[#f5f5f7] px-3 text-sm font-medium outline-none transition focus:ring-2 focus:ring-[#007aff]/25"
                        value={goalForm.reminderDayOfMonth}
                        onChange={(event) =>
                          setGoalForm((currentForm) => ({
                            ...currentForm,
                            reminderDayOfMonth: event.target.value,
                          }))
                        }
                        inputMode="numeric"
                        placeholder="15"
                        disabled={isSavingGoal}
                      />
                    </label>
                  ) : null}
                </div>

                <AnimatePresence>
                  {goalFormError ? (
                    <motion.div
                      className="flex gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-danger"
                      role="alert"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.16, ease: "easeOut" }}
                    >
                      <CircleAlert
                        className="mt-0.5 size-4 shrink-0"
                        strokeWidth={1.9}
                        aria-hidden="true"
                      />
                      {goalFormError}
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <button
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#007aff] px-5 text-sm font-semibold text-white transition hover:bg-[#006ee6] disabled:cursor-not-allowed disabled:opacity-60"
                  type="submit"
                  disabled={isSavingGoal}
                >
                  {isSavingGoal ? (
                    <LoaderCircle
                      className="size-4 animate-spin"
                      strokeWidth={1.9}
                      aria-hidden="true"
                    />
                  ) : (
                    <Plus
                      className="size-4"
                      strokeWidth={1.9}
                      aria-hidden="true"
                    />
                  )}
                  Add goal
                </button>
              </div>
            </motion.form>
          </motion.div>
        ) : null}

        {selectedBudget ? (
          <motion.div
            className="fixed inset-0 z-50 grid place-items-end bg-black/20 p-0 sm:place-items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="budget-detail-title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <button
              className="absolute inset-0"
              type="button"
              aria-label="Close goal details"
              onClick={() => setSelectedBudget(null)}
            />
            <motion.section
              className="relative max-h-[94dvh] w-full overflow-y-auto rounded-t-4xl border border-white/70 bg-[#f5f5f7]/95 p-4 shadow-[0_24px_70px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:max-w-2xl sm:rounded-4xl sm:p-5"
              initial={{ y: 26, opacity: 0.96 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <div
                className="mx-auto mb-4 h-1 w-10 rounded-full bg-black/15 sm:hidden"
                aria-hidden="true"
              />
              <div className="relative overflow-hidden rounded-3xl bg-white p-4 ring-1 ring-black/5 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-primary">
                      {selectedBudget.category ?? "Goal"}
                    </p>
                    <h2
                      id="budget-detail-title"
                      className="mt-1 truncate text-2xl font-semibold leading-tight text-text sm:text-3xl"
                    >
                      {selectedBudget.name}
                    </h2>
                    <p className="mt-2 text-sm text-text-muted">
                      {formatBudgetDate(selectedBudget.targetDate)} -{" "}
                      {getBudgetDateDistance(selectedBudget.targetDate)}
                    </p>
                  </div>
                  <button
                    className="grid size-8 shrink-0 place-items-center rounded-full bg-black/5 text-text-muted transition hover:bg-black/10 hover:text-text"
                    type="button"
                    aria-label="Close goal details"
                    onClick={() => setSelectedBudget(null)}
                  >
                    <X
                      className="size-4"
                      strokeWidth={1.9}
                      aria-hidden="true"
                    />
                  </button>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center">
                  <div className="mx-auto grid size-40 place-items-center rounded-full bg-[#f5f5f7] ring-1 ring-black/5">
                    <div className="relative grid size-32 place-items-center rounded-full bg-white">
                      <svg
                        className="absolute inset-0 size-32 -rotate-90"
                        viewBox="0 0 128 128"
                        aria-hidden="true"
                      >
                        <circle
                          cx="64"
                          cy="64"
                          r="54"
                          fill="none"
                          stroke="rgba(0,0,0,0.08)"
                          strokeWidth="12"
                        />
                        <motion.circle
                          cx="64"
                          cy="64"
                          r="54"
                          fill="none"
                          stroke="#007aff"
                          strokeLinecap="round"
                          strokeWidth="12"
                          strokeDasharray={2 * Math.PI * 54}
                          strokeDashoffset={
                            2 *
                            Math.PI *
                            54 *
                            (1 -
                              Math.min(100, selectedBudget.progressPercent) /
                                100)
                          }
                          initial={{ strokeDashoffset: 2 * Math.PI * 54 }}
                          animate={{
                            strokeDashoffset:
                              2 *
                              Math.PI *
                              54 *
                              (1 -
                                Math.min(100, selectedBudget.progressPercent) /
                                  100),
                          }}
                          transition={{ duration: 0.7, ease: "easeOut" }}
                        />
                      </svg>
                      <div className="relative text-center">
                        <p className="text-3xl font-semibold text-text">
                          {selectedBudget.progressPercent}%
                        </p>
                        <p className="text-xs font-semibold text-text-soft">
                          complete
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    <div>
                      <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
                        <span className="text-[#007aff]">Completed</span>
                        <span className="text-text-muted">
                          {formatMoney(selectedBudget.currentAmount, currency)}
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-black/5">
                        <motion.div
                          className="h-full rounded-full bg-[#007aff]"
                          initial={{ width: 0 }}
                          animate={{
                            width: `${Math.min(100, selectedBudget.progressPercent)}%`,
                          }}
                          transition={{ duration: 0.55, ease: "easeOut" }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
                        <span className="text-text-soft">Remaining</span>
                        <span className="text-text-muted">
                          {formatMoney(
                            getBudgetRemainingAmount(selectedBudget),
                            currency,
                          )}
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-black/5">
                        <motion.div
                          className="h-full rounded-full bg-[#8e8e93]"
                          initial={{ width: 0 }}
                          animate={{
                            width: `${getBudgetRemainingPercent(selectedBudget)}%`,
                          }}
                          transition={{ duration: 0.55, ease: "easeOut" }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-2xl bg-[#f5f5f7] p-3 ring-1 ring-black/5">
                        <Target
                          className="mb-2 size-4 text-[#007aff]"
                          strokeWidth={1.9}
                          aria-hidden="true"
                        />
                        <p className="text-[11px] font-semibold text-text-soft">
                          Target
                        </p>
                        <p className="mt-1 truncate text-sm font-bold text-text">
                          {selectedBudget.targetAmount
                            ? formatMoney(selectedBudget.targetAmount, currency)
                            : "Not set"}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-[#f5f5f7] p-3 ring-1 ring-black/5">
                        <TrendingUp
                          className="mb-2 size-4 text-[#007aff]"
                          strokeWidth={1.9}
                          aria-hidden="true"
                        />
                        <p className="text-[11px] font-semibold text-text-soft">
                          Plan
                        </p>
                        <p className="mt-1 truncate text-sm font-bold text-text">
                          {getBudgetMonthlyPlanLabel(selectedBudget, currency)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-2xl bg-white p-3 ring-1 ring-black/5">
                  <CalendarDays
                    className="mb-2 size-4 text-[#007aff]"
                    strokeWidth={1.9}
                    aria-hidden="true"
                  />
                  <p className="text-[11px] font-semibold text-text-soft">
                    Reminder
                  </p>
                  <p className="mt-1 text-sm font-semibold capitalize text-text">
                    {selectedBudget.notificationCadence === "none"
                      ? "Off"
                      : selectedBudget.notificationCadence}
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-3 ring-1 ring-black/5">
                  <Flag
                    className="mb-2 size-4 text-[#007aff]"
                    strokeWidth={1.9}
                    aria-hidden="true"
                  />
                  <p className="text-[11px] font-semibold text-text-soft">
                    Status
                  </p>
                  <p className="mt-1 text-sm font-semibold capitalize text-text">
                    {selectedBudget.status}
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-3 ring-1 ring-black/5">
                  <Wallet
                    className="mb-2 size-4 text-[#007aff]"
                    strokeWidth={1.9}
                    aria-hidden="true"
                  />
                  <p className="text-[11px] font-semibold text-text-soft">
                    Created
                  </p>
                  <p className="mt-1 text-sm font-semibold text-text">
                    {formatDate(
                      selectedBudget.createdAt,
                      transactionsData.timeZone,
                    )}
                  </p>
                </div>
              </div>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
