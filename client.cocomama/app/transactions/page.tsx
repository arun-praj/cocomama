"use client";

import { motion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Menu,
  PiggyBank,
  ReceiptText,
} from "lucide-react";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { AppSideNavigation } from "../components/app-side-navigation";

type TransactionType = "expense" | "income" | "savings";
type TransactionRangePeriod = "weekly" | "month" | "yearly" | "custom";
type CustomDateRange = {
  startDate: string;
  endDate: string;
};

type TransactionListItem = {
  id: string;
  type: TransactionType;
  title: string;
  description: string;
  amount: number;
  merchant: string | null;
  category: string | null;
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

type TransactionSection = {
  type: TransactionType;
  label: string;
  description: string;
  Icon: typeof ReceiptText;
};

const transactionSections: TransactionSection[] = [
  {
    type: "expense",
    label: "Expenses",
    description: "Money that left spendable cash.",
    Icon: ArrowUpRight,
  },
  {
    type: "income",
    label: "Income",
    description: "Money received into the household.",
    Icon: ArrowDownLeft,
  },
  {
    type: "savings",
    label: "Savings",
    description: "Money assigned to savings instruments or goals.",
    Icon: PiggyBank,
  },
];

const transactionRangeOptions: Array<{
  value: TransactionRangePeriod;
  label: string;
}> = [
  { value: "month", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "weekly", label: "Weekly" },
  { value: "custom", label: "Custom" },
];

const weekdayLabels = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded-md bg-surface-muted ${className}`}
    />
  );
}

function TransactionListSkeleton() {
  return (
    <motion.section
      className="rounded-xl border border-border bg-surface p-2.5 shadow-sm"
      aria-busy="true"
      aria-label="Loading transactions"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <header className="flex items-start justify-between gap-3 px-2 py-2 sm:px-3">
        <div className="min-w-0 flex-1">
          <SkeletonBlock className="h-5 w-24" />
          <SkeletonBlock className="mt-2 h-4 w-48 max-w-full" />
        </div>
        <div className="grid justify-items-end gap-2">
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="h-3 w-16" />
        </div>
      </header>
      <div className="mt-3 divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-background/65">
        {["w-28", "w-36", "w-24", "w-40", "w-32"].map((widthClass, index) => (
          <div
            key={`${widthClass}-${index}`}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 sm:px-4"
          >
            <SkeletonBlock className="size-9 rounded-full" />
            <div className="min-w-0">
              <SkeletonBlock className={`h-4 ${widthClass}`} />
              <SkeletonBlock className="mt-2 h-3 w-full max-w-56" />
            </div>
            <SkeletonBlock className="h-4 w-20" />
          </div>
        ))}
      </div>
    </motion.section>
  );
}

function NetMoneyCardSkeleton() {
  return (
    <div
      className="overflow-visible border-0 bg-transparent py-2 shadow-none sm:rounded-xl sm:border sm:border-border sm:bg-surface sm:p-4 sm:shadow-sm"
      aria-busy="true"
      aria-label="Loading net money movement"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <SkeletonBlock className="h-4 w-36" />
          <SkeletonBlock className="mt-3 h-8 w-48 max-w-full rounded-lg" />
        </div>
        <SkeletonBlock className="h-8 w-16" />
      </div>
      <div className="mt-3 px-0 pb-2 pt-3 sm:rounded-lg sm:bg-background/70 sm:px-3">
        <SkeletonBlock className="h-31 w-full rounded-lg" />
        <div className="mt-2 grid grid-cols-5 gap-2 px-1">
          {["1-7", "8-14", "15-21", "22-28", "29-31"].map((label) => (
            <SkeletonBlock key={label} className="mx-auto h-3 w-9" />
          ))}
        </div>
      </div>
    </div>
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

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatTime(value: string) {
  try {
    return new Intl.DateTimeFormat("en", {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function toDateInputValue(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function parseDateInputValue(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addUtcDays(date: Date, days: number) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days,
    ),
  );
}

function addUtcMonths(date: Date, months: number) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
}

function formatRangeDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
    }).format(parseDateInputValue(value));
  } catch {
    return value;
  }
}

function getCalendarDays(displayedMonth: Date) {
  const monthStart = startOfUtcMonth(displayedMonth);
  const daysSinceMonday = (monthStart.getUTCDay() + 6) % 7;
  const gridStart = addUtcDays(monthStart, -daysSinceMonday);

  return Array.from({ length: 42 }, (_, index) => {
    const date = addUtcDays(gridStart, index);

    return {
      date,
      value: toDateInputValue(date),
      isCurrentMonth: date.getUTCMonth() === displayedMonth.getUTCMonth(),
    };
  });
}

function buildTransactionsPath(
  period: TransactionRangePeriod,
  customRange: CustomDateRange,
) {
  if (period === "custom" && (!customRange.startDate || !customRange.endDate)) {
    return null;
  }

  const params = new URLSearchParams({ period });

  if (period === "custom") {
    params.set("startDate", customRange.startDate);
    params.set("endDate", customRange.endDate);
  }

  return `/api/app/transactions?${params.toString()}`;
}

function getMonthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

function getWeekdayLabel(date: Date) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    timeZone: "UTC",
  }).format(date);
}

function getDayLabel(date: Date) {
  return String(date.getUTCDate());
}

function getShortDateLabel(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function getDateRangeLabel(startDate: Date, endDate: Date) {
  const startMonth = getMonthLabel(startDate);
  const endMonth = getMonthLabel(endDate);
  const startDay = startDate.getUTCDate();
  const endDay = endDate.getUTCDate();

  if (startMonth === endMonth) {
    return startDay === endDay
      ? `${startMonth} ${startDay}`
      : `${startMonth} ${startDay}-${endDay}`;
  }

  return `${startMonth} ${startDay}-${endMonth} ${endDay}`;
}

function getDateKey(date: Date) {
  return toDateInputValue(date);
}

function getSignedTransactionAmount(item: TransactionListItem) {
  if (item.type === "income") {
    return item.amount;
  }

  return -item.amount;
}

function getRangeDates(range?: TransactionsResponse["range"]) {
  if (range) {
    const startDate = new Date(range.startDate);
    const endDate = new Date(range.endDate);

    if (
      !Number.isNaN(startDate.getTime()) &&
      !Number.isNaN(endDate.getTime())
    ) {
      return { startDate, endDate };
    }
  }

  const startDate = startOfUtcMonth(new Date());

  return {
    startDate,
    endDate: addUtcMonths(startDate, 1),
  };
}

function getDayCount(startDate: Date, endDate: Date) {
  return Math.max(
    1,
    Math.ceil((endDate.getTime() - startDate.getTime()) / 86_400_000),
  );
}

function buildDailyChartRows({
  startDate,
  dayCount,
  totals,
  labelForDate,
}: {
  startDate: Date;
  dayCount: number;
  totals: Record<string, number>;
  labelForDate: (date: Date, index: number) => string;
}) {
  return Array.from({ length: dayCount }, (_, index) => {
    const date = addUtcDays(startDate, index);
    const key = getDateKey(date);

    return [labelForDate(date, index), totals[key] ?? 0] as [string, number];
  });
}

function buildMonthlyChartRows({
  startDate,
  endDate,
  totals,
}: {
  startDate: Date;
  endDate: Date;
  totals: Record<string, number>;
}) {
  const monthCount = Math.max(
    1,
    (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 +
      (endDate.getUTCMonth() - startDate.getUTCMonth()),
  );

  return Array.from({ length: monthCount }, (_, index) => {
    const date = addUtcMonths(startDate, index);
    const key = getMonthKey(date);

    return [getMonthLabel(date), totals[key] ?? 0] as [string, number];
  });
}

function buildNetMoneyChartRows({
  items,
  range,
}: {
  items: TransactionListItem[];
  range?: TransactionsResponse["range"];
}) {
  const { startDate, endDate } = getRangeDates(range);
  const dayTotals = items.reduce<Record<string, number>>((totals, item) => {
    const key = getDateKey(new Date(item.occurredAt));

    return {
      ...totals,
      [key]: (totals[key] ?? 0) + getSignedTransactionAmount(item),
    };
  }, {});
  const monthTotals = items.reduce<Record<string, number>>((totals, item) => {
    const key = getMonthKey(new Date(item.occurredAt));

    return {
      ...totals,
      [key]: (totals[key] ?? 0) + getSignedTransactionAmount(item),
    };
  }, {});
  const period = range?.period ?? "month";

  if (period === "weekly") {
    return buildDailyChartRows({
      startDate,
      dayCount: getDayCount(startDate, endDate),
      totals: dayTotals,
      labelForDate: getWeekdayLabel,
    });
  }

  if (period === "yearly") {
    return buildMonthlyChartRows({ startDate, endDate, totals: monthTotals });
  }

  if (period === "custom") {
    const dayCount = getDayCount(startDate, endDate);

    if (dayCount <= 45) {
      return buildDailyChartRows({
        startDate,
        dayCount,
        totals: dayTotals,
        labelForDate: getShortDateLabel,
      });
    }

    return buildMonthlyChartRows({ startDate, endDate, totals: monthTotals });
  }

  const dayCount = getDayCount(startDate, endDate);

  return buildDailyChartRows({
    startDate,
    dayCount,
    totals: dayTotals,
    labelForDate: getDayLabel,
  });
}

function buildNetMoneyAxisLabels({
  chartRows,
  range,
}: {
  chartRows: Array<[string, number]>;
  range?: TransactionsResponse["range"];
}) {
  const period = range?.period ?? "month";

  if (period === "custom") {
    const { startDate, endDate } = getRangeDates(range);
    const dayCount = getDayCount(startDate, endDate);

    if (dayCount > 14 && dayCount <= 45) {
      return Array.from({ length: Math.ceil(dayCount / 7) }, (_, index) => {
        const rangeStart = addUtcDays(startDate, index * 7);
        const rangeEnd = addUtcDays(
          startDate,
          Math.min(index * 7 + 6, dayCount - 1),
        );

        return getDateRangeLabel(rangeStart, rangeEnd);
      });
    }

    return chartRows.map(([label]) => label);
  }

  if (period !== "month" || chartRows.length <= 14) {
    return chartRows.map(([label]) => label);
  }

  return Array.from({ length: Math.ceil(chartRows.length / 7) }, (_, index) => {
    const startDay = index * 7 + 1;
    const endDay = Math.min(startDay + 6, chartRows.length);

    return startDay === endDay ? `${startDay}` : `${startDay}-${endDay}`;
  });
}

function emptyTransactions(): TransactionsResponse {
  return {
    currency: "NPR",
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

function TransactionRow({
  item,
  currency,
}: {
  item: TransactionListItem;
  currency: string;
}) {
  const isIncome = item.type === "income";
  const isSavings = item.type === "savings";
  const metaSubject =
    item.merchant ??
    item.category ??
    item.savingsInstrument ??
    item.description;
  const timestamp = [formatDate(item.occurredAt), formatTime(item.occurredAt)]
    .filter(Boolean)
    .join(", ");
  const meta = [timestamp, metaSubject].filter(Boolean).join(" - ");

  return (
    <motion.li
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 transition hover:bg-surface sm:px-4"
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
        {isIncome ? (
          <ArrowDownLeft className="size-4" strokeWidth={1.9} />
        ) : isSavings ? (
          <PiggyBank className="size-4" strokeWidth={1.9} />
        ) : (
          <ArrowUpRight className="size-4" strokeWidth={1.9} />
        )}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold leading-5 text-text">
          {item.title}
        </p>
        <p className="mt-0.5 whitespace-normal wrap-break-word text-xs leading-4 text-text-soft">
          {meta || formatDate(item.occurredAt)}
          {item.isRecurring ? " - Recurring" : ""}
        </p>
      </div>
      <div className="min-w-22 text-right">
        <p
          className={`whitespace-nowrap text-sm font-semibold ${
            isIncome ? "text-success" : isSavings ? "text-info" : "text-danger"
          }`}
        >
          {isIncome ? "+" : isSavings ? "" : "-"}
          {formatMoney(item.amount, currency)}
        </p>
      </div>
    </motion.li>
  );
}

function TransactionDateSelector({
  period,
  customRange,
  onPeriodChange,
  onCustomRangeChange,
}: {
  period: TransactionRangePeriod;
  customRange: CustomDateRange;
  onPeriodChange: (period: TransactionRangePeriod) => void;
  onCustomRangeChange: (range: CustomDateRange) => void;
}) {
  const selectedOption =
    transactionRangeOptions.find((option) => option.value === period) ??
    transactionRangeOptions[0];
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [displayedMonth, setDisplayedMonth] = useState(() =>
    startOfUtcMonth(new Date()),
  );
  const todayValue = toDateInputValue(new Date());
  const calendarDays = getCalendarDays(displayedMonth);
  const monthLabel = new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(displayedMonth);
  const selectedRangeLabel =
    customRange.startDate && customRange.endDate
      ? `${formatRangeDate(customRange.startDate)} - ${formatRangeDate(customRange.endDate)}`
      : customRange.startDate
        ? `${formatRangeDate(customRange.startDate)} - Pick end`
        : "Pick a custom range";

  function handlePeriodSelect(nextPeriod: TransactionRangePeriod) {
    onPeriodChange(nextPeriod);
    setIsMenuOpen(false);

    if (nextPeriod === "custom") {
      setDisplayedMonth(
        customRange.startDate
          ? startOfUtcMonth(parseDateInputValue(customRange.startDate))
          : startOfUtcMonth(new Date()),
      );
      setIsCalendarOpen(true);
      return;
    }

    setIsCalendarOpen(false);
  }

  function handleDateClick(dateValue: string) {
    onPeriodChange("custom");

    if (!customRange.startDate || customRange.endDate) {
      onCustomRangeChange({ startDate: dateValue, endDate: "" });
      return;
    }

    if (dateValue < customRange.startDate) {
      onCustomRangeChange({
        startDate: dateValue,
        endDate: customRange.startDate,
      });
    } else {
      onCustomRangeChange({
        startDate: customRange.startDate,
        endDate: dateValue,
      });
    }

    setIsCalendarOpen(false);
  }

  return (
    <div className="relative shrink-0">
      <button
        className="inline-flex h-8 items-center justify-end gap-1.5 text-sm font-semibold text-text transition hover:text-primary"
        type="button"
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        onClick={() => {
          setIsMenuOpen((currentValue) => !currentValue);
          setIsCalendarOpen(false);
        }}
      >
        {selectedOption.label}
        <ChevronDown
          className={`size-4 text-text-soft transition ${
            isMenuOpen ? "rotate-180" : ""
          }`}
          strokeWidth={1.9}
          aria-hidden="true"
        />
      </button>

      {isMenuOpen ? (
        <motion.div
          className="absolute right-0 top-full z-30 mt-2 w-44 rounded-xl border border-border bg-surface p-1.5 shadow-xl"
          role="menu"
          initial={{ opacity: 0, y: -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.14, ease: "easeOut" }}
        >
          {transactionRangeOptions.map((option) => {
            const isActive = period === option.value;

            return (
              <button
                key={option.value}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-text-muted hover:bg-surface-muted hover:text-text"
                }`}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => handlePeriodSelect(option.value)}
              >
                <span>{option.label}</span>
                {isActive ? (
                  <Check
                    className="size-4"
                    strokeWidth={1.9}
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            );
          })}
        </motion.div>
      ) : null}

      {period === "custom" && customRange.startDate ? (
        <p className="mt-1 truncate text-right text-[11px] font-medium text-text-soft">
          {selectedRangeLabel}
        </p>
      ) : null}

      {isCalendarOpen ? (
        <motion.div
          className="absolute right-0 top-full z-30 mt-2 w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border bg-surface p-3 shadow-xl"
          initial={{ opacity: 0, y: -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
        >
          <div className="flex items-center justify-between gap-2">
            <button
              className="grid size-8 place-items-center rounded-md border border-border bg-background text-text-muted transition hover:text-text"
              type="button"
              aria-label="Previous month"
              onClick={() =>
                setDisplayedMonth(addUtcMonths(displayedMonth, -1))
              }
            >
              <ChevronLeft
                className="size-4"
                strokeWidth={1.9}
                aria-hidden="true"
              />
            </button>
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              <CalendarDays
                className="size-4 text-primary"
                strokeWidth={1.9}
                aria-hidden="true"
              />
              {monthLabel}
            </div>
            <button
              className="grid size-8 place-items-center rounded-md border border-border bg-background text-text-muted transition hover:text-text"
              type="button"
              aria-label="Next month"
              onClick={() => setDisplayedMonth(addUtcMonths(displayedMonth, 1))}
            >
              <ChevronRight
                className="size-4"
                strokeWidth={1.9}
                aria-hidden="true"
              />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-text-soft">
            {weekdayLabels.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const isStart = customRange.startDate === day.value;
              const isEnd = customRange.endDate === day.value;
              const isToday = day.value === todayValue;
              const isInRange =
                customRange.startDate &&
                customRange.endDate &&
                day.value > customRange.startDate &&
                day.value < customRange.endDate;

              return (
                <button
                  key={day.value}
                  className={`aspect-square rounded-md text-xs font-semibold transition ${
                    isStart || isEnd
                      ? "bg-primary text-white shadow-sm"
                      : isInRange
                        ? "bg-primary/10 text-primary"
                        : isToday
                          ? "bg-surface text-primary ring-1 ring-primary/60 hover:bg-primary/10"
                          : day.isCurrentMonth
                            ? "text-text hover:bg-surface-muted"
                            : "text-text-soft/50 hover:bg-surface-muted"
                  }`}
                  type="button"
                  aria-pressed={isStart || isEnd || Boolean(isInRange)}
                  onClick={() => handleDateClick(day.value)}
                >
                  {day.date.getUTCDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-surface-muted px-3 py-2 text-xs text-text-muted">
            <span className="min-w-0 truncate font-medium">
              {selectedRangeLabel}
            </span>
            {customRange.startDate || customRange.endDate ? (
              <button
                className="shrink-0 font-semibold text-primary transition hover:text-text"
                type="button"
                onClick={() =>
                  onCustomRangeChange({ startDate: "", endDate: "" })
                }
              >
                Clear
              </button>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}

function NetMoneyChart({
  items,
  currency,
  range,
}: {
  items: TransactionListItem[];
  currency: string;
  range?: TransactionsResponse["range"];
}) {
  const chartFrameRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(300);
  const chartRows = buildNetMoneyChartRows({
    items,
    range,
  });
  const axisLabels = buildNetMoneyAxisLabels({ chartRows, range });
  const chartValues = chartRows.map(([, amount]) => amount);
  const chartTop = 18;
  const chartBottom = 88;
  const chartHeight = chartBottom - chartTop;
  const zeroY = (chartTop + chartBottom) / 2;
  const chartHalfHeight = chartHeight / 2;
  const maxMagnitude = Math.max(
    ...chartValues.map((amount) => Math.abs(amount)),
    1,
  );
  const chartPoints = chartRows.map(([, amount], index) => {
    const x = ((index + 0.5) / chartRows.length) * chartWidth;
    const y = zeroY - (amount / maxMagnitude) * chartHalfHeight;

    return { x, y, amount, index };
  });
  const pathPoints = [
    chartPoints[0]
      ? {
          ...chartPoints[0],
          x: 0,
          y:
            chartPoints[0].y -
            ((chartPoints[1]?.y ?? chartPoints[0].y) - chartPoints[0].y),
        }
      : undefined,
    ...chartPoints,
    chartPoints.at(-1)
      ? {
          ...chartPoints.at(-1)!,
          x: chartWidth,
          y:
            chartPoints.at(-1)!.y +
            (chartPoints.at(-1)!.y -
              (chartPoints.at(-2)?.y ?? chartPoints.at(-1)!.y)),
        }
      : undefined,
  ].filter((point): point is (typeof chartPoints)[number] => Boolean(point));
  const path = pathPoints
    .map((point, index) => {
      if (index === 0) {
        return `M ${point.x} ${point.y}`;
      }

      const previous = pathPoints[index - 1] ?? point;
      const controlX = (previous.x + point.x) / 2;

      return `C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
    })
    .join(" ");
  const defaultActiveIndex = Math.max(
    0,
    chartPoints.reduce(
      (activeIndex, point, index) =>
        Math.abs(point.amount) > Math.abs(chartPoints[activeIndex]?.amount ?? 0)
          ? index
          : activeIndex,
      0,
    ),
  );
  const [activeIndex, setActiveIndex] = useState(defaultActiveIndex);
  const activePoint = chartPoints[activeIndex] ??
    chartPoints[defaultActiveIndex] ?? {
      x: 16,
      y: 50,
      amount: 0,
      index: 0,
    };
  const tooltipY = Math.min(72, Math.max(-22, activePoint.y - 28));
  const tooltipWidth = 64;
  const tooltipX = Math.min(
    chartWidth - tooltipWidth - 4,
    Math.max(4, activePoint.x - 12),
  );
  const tooltipTextX = tooltipX + tooltipWidth / 2;
  const pointerBaseX = Math.min(
    tooltipX + tooltipWidth - 12,
    Math.max(tooltipX + 12, activePoint.x),
  );
  const pointerBaseY = tooltipY + 18;
  const pointerTipY = Math.max(pointerBaseY + 4, activePoint.y - 7);
  const highlightWidth = 18;
  const highlightX = Math.min(
    chartWidth - highlightWidth,
    Math.max(0, activePoint.x - highlightWidth / 2),
  );
  const highlightY = Math.min(activePoint.y, zeroY);
  const highlightHeight = Math.abs(zeroY - activePoint.y);
  const shouldShowActiveMarker =
    activePoint.amount !== 0 && highlightHeight > 0;

  useEffect(() => {
    const chartFrame = chartFrameRef.current;

    if (!chartFrame) {
      return;
    }

    const updateChartWidth = (width: number) => {
      setChartWidth(Math.max(240, Math.round(width)));
    };

    updateChartWidth(chartFrame.getBoundingClientRect().width);

    const resizeObserver = new ResizeObserver(([entry]) => {
      updateChartWidth(entry.contentRect.width);
    });

    resizeObserver.observe(chartFrame);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  function handleChartPointer(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const relativeX =
      ((event.clientX - bounds.left) / bounds.width) * chartWidth;
    const nearestPoint = chartPoints.reduce((nearest, point, index) => {
      const currentDistance = Math.abs(point.x - relativeX);
      const nearestDistance = Math.abs(
        (chartPoints[nearest]?.x ?? point.x) - relativeX,
      );

      return currentDistance < nearestDistance ? index : nearest;
    }, 0);

    setActiveIndex(nearestPoint);
  }

  return (
    <div className="mt-3 px-0 pb-2 pt-3 sm:rounded-lg sm:bg-background/70 sm:px-3">
      <div ref={chartFrameRef} className="h-31 overflow-hidden">
        <svg
          className="h-31 w-full touch-pan-y"
          viewBox={`0 -24 ${chartWidth} 124`}
          role="img"
          aria-label={
            shouldShowActiveMarker
              ? `Curved net money history chart. Active value ${formatMoney(
                  activePoint.amount,
                  currency,
                )}.`
              : "Curved net money history chart."
          }
          onPointerDown={handleChartPointer}
          onPointerMove={handleChartPointer}
        >
          <defs>
            <linearGradient
              id="net-chart-highlight-gradient"
              x1="0"
              x2="0"
              y1={chartBottom}
              y2={chartTop}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stopColor="rgba(117,211,128,0.42)" />
              <stop offset="1" stopColor="rgba(214,255,154,0.76)" />
            </linearGradient>
          </defs>
          <path
            d={`M 0 ${zeroY} H ${chartWidth}`}
            stroke="rgba(36,92,87,0.26)"
            strokeDasharray="4 5"
            strokeLinecap="round"
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
          />
          <motion.path
            d={path}
            fill="none"
            stroke="var(--primary)"
            strokeLinecap="round"
            strokeWidth="2.4"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          />
          {shouldShowActiveMarker ? (
            <>
              <motion.rect
                x={highlightX}
                y={highlightY}
                width={highlightWidth}
                height={highlightHeight}
                fill="url(#net-chart-highlight-gradient)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.25 }}
              />
              <rect
                x={tooltipX}
                y={tooltipY}
                width={tooltipWidth}
                height="18"
                rx="5"
                fill="var(--text)"
                opacity="0.92"
              />
              <path
                d={`M ${pointerBaseX - 5} ${pointerBaseY} L ${pointerBaseX + 5} ${pointerBaseY} L ${activePoint.x} ${pointerTipY} Z`}
                fill="var(--text)"
                opacity="0.92"
              />
              <text
                x={tooltipTextX}
                y={tooltipY + 12}
                textAnchor="middle"
                className="fill-surface-muted text-[9px] font-semibold"
              >
                {formatMoney(activePoint.amount, currency)}
              </text>
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r="5"
                fill="var(--background)"
                stroke="var(--primary)"
                strokeWidth="2"
              />
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r="2.5"
                fill="var(--primary)"
              />
            </>
          ) : null}
        </svg>
      </div>
      <div
        className="grid gap-1 px-1"
        style={{
          gridTemplateColumns: `repeat(${axisLabels.length}, minmax(0, 1fr))`,
        }}
      >
        {axisLabels.map((label, index) => (
          <span
            key={`${label}-${index}`}
            className="truncate text-center text-[11px] font-medium text-text-soft"
          >
            {label || "\u00a0"}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function TransactionsPage() {
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [transactionsData, setTransactionsData] =
    useState<TransactionsResponse>(() => emptyTransactions());
  const [activeType, setActiveType] = useState<TransactionType>("expense");
  const [rangePeriod, setRangePeriod] =
    useState<TransactionRangePeriod>("month");
  const [customRange, setCustomRange] = useState<CustomDateRange>({
    startDate: "",
    endDate: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const activeSection =
    transactionSections.find((section) => section.type === activeType) ??
    transactionSections[0];
  const activeItems = transactionsData.transactions[activeType];
  const activeSummary = transactionsData.summary[activeType];
  const allTransactions = transactionSections.flatMap(
    (section) => transactionsData.transactions[section.type],
  );

  useEffect(() => {
    let isActive = true;

    async function loadTransactions() {
      const transactionsPath = buildTransactionsPath(rangePeriod, customRange);

      if (!transactionsPath) {
        return;
      }

      setIsLoading(true);
      setError("");

      try {
        const response = await fetch(transactionsPath, {
          cache: "no-store",
        });
        const body = (await response.json().catch(() => null)) as
          | TransactionsResponse
          | { error?: string }
          | null;

        if (!response.ok || !body || !("transactions" in body)) {
          throw new Error("transactions_failed");
        }

        if (isActive) {
          setTransactionsData(body);
        }
      } catch {
        if (isActive) {
          setError("Transactions could not load.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadTransactions();

    return () => {
      isActive = false;
    };
  }, [customRange, rangePeriod]);

  return (
    <main className="h-dvh overflow-hidden bg-background text-text">
      <div className="flex h-full min-h-0 w-full">
        <AppSideNavigation
          activeItem="Transactions"
          isOpen={isNavigationOpen}
          onClose={() => setIsNavigationOpen(false)}
        />

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="z-20 flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur lg:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <motion.button
                className="grid size-10 place-items-center rounded-md border border-border bg-surface text-text-muted transition hover:text-text"
                type="button"
                aria-label="Open navigation"
                onClick={() => setIsNavigationOpen(true)}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
              >
                <Menu className="size-5" strokeWidth={1.8} aria-hidden="true" />
              </motion.button>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text">Transactions</p>
                <p className="truncate text-xs text-text-soft">
                  Expenses, income, and savings are separated by type
                </p>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto bg-background py-4 sm:bg-[radial-gradient(circle_at_88%_8%,rgba(36,92,87,0.08),transparent_28%),radial-gradient(circle_at_4%_92%,rgba(36,99,166,0.06),transparent_26%)]">
            <div className="mx-auto grid w-full max-w-5xl gap-3 px-3 pb-6 sm:px-6 lg:px-8">
              <motion.section
                className="grid gap-3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, ease: "easeOut" }}
              >
                {isLoading ? (
                  <NetMoneyCardSkeleton />
                ) : (
                  <div className="overflow-visible border-0 bg-transparent py-2 shadow-none sm:rounded-xl sm:border sm:border-border sm:bg-surface sm:p-4 sm:shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text-muted">
                          Net money movement
                        </p>
                        <h1 className="mt-1 truncate text-3xl font-semibold leading-tight text-text">
                          {formatMoney(
                            transactionsData.summary.net,
                            transactionsData.currency,
                          )}
                        </h1>
                      </div>
                      <TransactionDateSelector
                        period={rangePeriod}
                        customRange={customRange}
                        onPeriodChange={setRangePeriod}
                        onCustomRangeChange={setCustomRange}
                      />
                    </div>
                    <NetMoneyChart
                      key={`${transactionsData.range?.period ?? "month"}-${transactionsData.range?.startDate ?? ""}-${transactionsData.range?.endDate ?? ""}`}
                      items={allTransactions}
                      currency={transactionsData.currency}
                      range={transactionsData.range}
                    />
                  </div>
                )}
              </motion.section>

              <motion.section
                className="flex justify-center"
                aria-label="Transaction type"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                <div
                  className="grid w-full grid-cols-3 rounded-full border border-border bg-surface p-1 shadow-sm sm:w-auto sm:flex"
                  role="tablist"
                  aria-label="Transaction type"
                >
                  {transactionSections.map((section) => {
                    const isActive = activeType === section.type;

                    return (
                      <button
                        key={section.type}
                        className={`min-w-0 rounded-full px-3 py-2 text-xs font-semibold transition sm:px-4 sm:py-1.5 ${
                          isActive
                            ? "bg-primary text-white shadow-sm"
                            : "text-text-muted hover:text-text"
                        }`}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => setActiveType(section.type)}
                      >
                        {section.label}
                      </button>
                    );
                  })}
                </div>
              </motion.section>

              {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">
                  {error}
                </div>
              ) : null}

              {isLoading ? (
                <TransactionListSkeleton />
              ) : (
                <motion.section
                  key={activeType}
                  className="rounded-xl border border-border bg-surface p-2.5 shadow-sm"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  aria-labelledby="active-transaction-type"
                >
                  <header className="flex items-start justify-between gap-3 px-2 py-2 sm:px-3">
                    <div className="min-w-0">
                      <h2
                        id="active-transaction-type"
                        className="text-sm font-semibold text-text sm:text-base"
                      >
                        {activeSection.label}
                      </h2>
                      <p className="mt-0.5 text-xs leading-5 text-text-muted sm:text-sm">
                        {activeSection.description}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-text">
                        {formatMoney(
                          activeSummary.totalAmount,
                          transactionsData.currency,
                        )}
                      </p>
                      <p className="text-xs text-text-soft">
                        {activeSummary.count} records
                      </p>
                    </div>
                  </header>
                  {activeItems.length > 0 ? (
                    <ul className="mt-3 divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-background/65">
                      {activeItems.map((item) => (
                        <TransactionRow
                          key={item.id}
                          item={item}
                          currency={transactionsData.currency}
                        />
                      ))}
                    </ul>
                  ) : (
                    <div className="m-4 rounded-lg border border-dashed border-border bg-background px-4 py-8 text-sm text-text-soft">
                      No {activeSection.label.toLowerCase()} recorded yet.
                    </div>
                  )}
                </motion.section>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
