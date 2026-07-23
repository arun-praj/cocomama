export type TransactionRangePeriod = "weekly" | "month" | "yearly" | "custom";

export type TransactionDateRangeResult =
  | {
      ok: true;
      period: TransactionRangePeriod;
      startDate: Date;
      endDate: Date;
    }
  | {
      ok: false;
      error: "invalid_period" | "missing_custom_range" | "invalid_date_range";
      message: string;
    };

type ResolveTransactionDateRangeInput = {
  period?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
  now?: Date;
};

const periodAliases: Record<string, TransactionRangePeriod> = {
  weekly: "weekly",
  week: "weekly",
  month: "month",
  monthly: "month",
  yearly: "yearly",
  year: "yearly",
  custom: "custom",
};

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

const startOfUtcDay = (date: Date) =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );

const addUtcDays = (date: Date, days: number) =>
  new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days,
    ),
  );

const addUtcMonths = (date: Date, months: number) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));

const addUtcYears = (date: Date, years: number) =>
  new Date(Date.UTC(date.getUTCFullYear() + years, 0, 1));

const normalizePeriod = ({
  period,
  hasCustomRange,
}: {
  period?: string | undefined;
  hasCustomRange: boolean;
}) => {
  if (!period) {
    return hasCustomRange ? "custom" : "month";
  }

  return periodAliases[period.trim().toLowerCase()];
};

const parseDateBoundary = (
  value: string | undefined,
  boundary: "start" | "end",
) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (boundary === "end" && dateOnlyPattern.test(value)) {
    return addUtcDays(date, 1);
  }

  return date;
};

export const resolveTransactionDateRange = ({
  period,
  startDate,
  endDate,
  now = new Date(),
}: ResolveTransactionDateRangeInput = {}): TransactionDateRangeResult => {
  const normalizedPeriod = normalizePeriod({
    period,
    hasCustomRange: Boolean(startDate || endDate),
  });

  if (!normalizedPeriod) {
    return {
      ok: false,
      error: "invalid_period",
      message:
        "Use period=weekly, period=month, period=yearly, or period=custom.",
    };
  }

  if (normalizedPeriod === "custom") {
    const resolvedStartDate = parseDateBoundary(startDate, "start");
    const resolvedEndDate = parseDateBoundary(endDate, "end");

    if (!resolvedStartDate || !resolvedEndDate) {
      return {
        ok: false,
        error: "missing_custom_range",
        message:
          "Custom transaction ranges require valid startDate and endDate query parameters.",
      };
    }

    if (resolvedStartDate >= resolvedEndDate) {
      return {
        ok: false,
        error: "invalid_date_range",
        message: "startDate must be before endDate.",
      };
    }

    return {
      ok: true,
      period: normalizedPeriod,
      startDate: resolvedStartDate,
      endDate: resolvedEndDate,
    };
  }

  if (normalizedPeriod === "weekly") {
    const today = startOfUtcDay(now);
    const daysSinceMonday = (today.getUTCDay() + 6) % 7;
    const resolvedStartDate = addUtcDays(today, -daysSinceMonday);

    return {
      ok: true,
      period: normalizedPeriod,
      startDate: resolvedStartDate,
      endDate: addUtcDays(resolvedStartDate, 7),
    };
  }

  if (normalizedPeriod === "yearly") {
    const resolvedStartDate = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

    return {
      ok: true,
      period: normalizedPeriod,
      startDate: resolvedStartDate,
      endDate: addUtcYears(resolvedStartDate, 1),
    };
  }

  const resolvedStartDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );

  return {
    ok: true,
    period: normalizedPeriod,
    startDate: resolvedStartDate,
    endDate: addUtcMonths(resolvedStartDate, 1),
  };
};
