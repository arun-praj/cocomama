import {
  addTimeZoneDays,
  addTimeZoneMonths,
  addTimeZoneYears,
  dateOnlyPattern,
  getLocalDayOfWeek,
  parseDateOnlyInTimeZone,
  startOfTimeZoneDay,
  startOfTimeZoneMonth,
  startOfTimeZoneYear,
} from "./time-zone-date-service.js";

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
  timeZone?: string | undefined;
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
  timeZone?: string,
) => {
  if (!value) {
    return null;
  }

  if (dateOnlyPattern.test(value)) {
    const date = parseDateOnlyInTimeZone(value, timeZone);

    return boundary === "end" ? addTimeZoneDays(date, 1, timeZone) : date;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

export const resolveTransactionDateRange = ({
  period,
  startDate,
  endDate,
  timeZone,
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
    const resolvedStartDate = parseDateBoundary(startDate, "start", timeZone);
    const resolvedEndDate = parseDateBoundary(endDate, "end", timeZone);

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
    const today = startOfTimeZoneDay(now, timeZone);
    const daysSinceMonday = (getLocalDayOfWeek(now, timeZone) + 6) % 7;
    const resolvedStartDate = addTimeZoneDays(
      today,
      -daysSinceMonday,
      timeZone,
    );

    return {
      ok: true,
      period: normalizedPeriod,
      startDate: resolvedStartDate,
      endDate: addTimeZoneDays(resolvedStartDate, 7, timeZone),
    };
  }

  if (normalizedPeriod === "yearly") {
    const resolvedStartDate = startOfTimeZoneYear(now, timeZone);

    return {
      ok: true,
      period: normalizedPeriod,
      startDate: resolvedStartDate,
      endDate: addTimeZoneYears(resolvedStartDate, 1, timeZone),
    };
  }

  const resolvedStartDate = startOfTimeZoneMonth(now, timeZone);

  return {
    ok: true,
    period: normalizedPeriod,
    startDate: resolvedStartDate,
    endDate: addTimeZoneMonths(resolvedStartDate, 1, timeZone),
  };
};
