export const defaultTimeZone = "UTC";

export const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

type ZonedDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
};

export const normalizeTimeZone = (timeZone?: string) => {
  if (!timeZone) {
    return defaultTimeZone;
  }

  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(new Date(0));
    return timeZone;
  } catch {
    return defaultTimeZone;
  }
};

const dateTimePartsFormatter = (timeZone?: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

export const getZonedDateTimeParts = (date: Date, timeZone?: string) => {
  const parts = Object.fromEntries(
    dateTimePartsFormatter(timeZone)
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
    millisecond: date.getUTCMilliseconds(),
  } as Required<ZonedDateTimeParts>;
};

const getTimeZoneOffsetMs = (date: Date, timeZone?: string) => {
  const parts = getZonedDateTimeParts(date, timeZone);
  const equivalentUtcTime = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );

  return equivalentUtcTime - date.getTime();
};

export const zonedDateTimeToUtc = (
  parts: ZonedDateTimeParts,
  timeZone?: string,
) => {
  const utcTime = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
    parts.millisecond ?? 0,
  );
  let offset = getTimeZoneOffsetMs(new Date(utcTime), timeZone);
  let resolvedTime = utcTime - offset;

  offset = getTimeZoneOffsetMs(new Date(resolvedTime), timeZone);
  resolvedTime = utcTime - offset;

  return new Date(resolvedTime);
};

const parseDateOnly = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    throw new Error("Invalid date-only value");
  }

  const [, year, month, day] = match;

  return { year: Number(year), month: Number(month), day: Number(day) };
};

const shiftDateParts = (
  parts: Pick<ZonedDateTimeParts, "year" | "month" | "day">,
  days: number,
) => {
  const date = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days),
  );

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
};

export const formatDateOnlyInTimeZone = (date: Date, timeZone?: string) => {
  const parts = getZonedDateTimeParts(date, timeZone);

  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day,
  ).padStart(2, "0")}`;
};

export const startOfTimeZoneDay = (date: Date, timeZone?: string) => {
  const parts = getZonedDateTimeParts(date, timeZone);

  return zonedDateTimeToUtc(
    { year: parts.year, month: parts.month, day: parts.day },
    timeZone,
  );
};

export const addTimeZoneDays = (
  date: Date,
  days: number,
  timeZone?: string,
) => {
  const parts = getZonedDateTimeParts(date, timeZone);

  return zonedDateTimeToUtc(shiftDateParts(parts, days), timeZone);
};

export const startOfTimeZoneMonth = (date: Date, timeZone?: string) => {
  const parts = getZonedDateTimeParts(date, timeZone);

  return zonedDateTimeToUtc(
    { year: parts.year, month: parts.month, day: 1 },
    timeZone,
  );
};

export const addTimeZoneMonths = (
  date: Date,
  months: number,
  timeZone?: string,
) => {
  const parts = getZonedDateTimeParts(date, timeZone);
  const shiftedDate = new Date(
    Date.UTC(parts.year, parts.month - 1 + months, 1),
  );

  return zonedDateTimeToUtc(
    {
      year: shiftedDate.getUTCFullYear(),
      month: shiftedDate.getUTCMonth() + 1,
      day: 1,
    },
    timeZone,
  );
};

export const startOfTimeZoneYear = (date: Date, timeZone?: string) => {
  const parts = getZonedDateTimeParts(date, timeZone);

  return zonedDateTimeToUtc({ year: parts.year, month: 1, day: 1 }, timeZone);
};

export const addTimeZoneYears = (
  date: Date,
  years: number,
  timeZone?: string,
) => {
  const parts = getZonedDateTimeParts(date, timeZone);

  return zonedDateTimeToUtc(
    { year: parts.year + years, month: 1, day: 1 },
    timeZone,
  );
};

export const resolveDateOnlyWithCurrentTime = ({
  value,
  now,
  timeZone,
}: {
  value: string;
  now: Date;
  timeZone?: string;
}) => {
  const dateParts = parseDateOnly(value);
  const timeParts = getZonedDateTimeParts(now, timeZone);

  return zonedDateTimeToUtc(
    {
      ...dateParts,
      hour: timeParts.hour,
      minute: timeParts.minute,
      second: timeParts.second,
      millisecond: timeParts.millisecond,
    },
    timeZone,
  );
};

export const parseDateOnlyInTimeZone = (value: string, timeZone?: string) =>
  zonedDateTimeToUtc(parseDateOnly(value), timeZone);

export const getLocalDayOfWeek = (date: Date, timeZone?: string) => {
  const parts = getZonedDateTimeParts(date, timeZone);

  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
};
