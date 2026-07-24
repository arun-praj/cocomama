import { describe, expect, it } from "vitest";
import { resolveTransactionDateRange } from "../src/services/transaction-date-range-service.js";

describe("transaction date ranges", () => {
  const now = new Date("2026-07-22T12:00:00.000Z");

  it("defaults to the current month", () => {
    const range = resolveTransactionDateRange({ now });

    expect(range.ok).toBe(true);
    if (!range.ok) {
      return;
    }

    expect(range.period).toBe("month");
    expect(range.startDate.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(range.endDate.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("supports weekly and yearly periods", () => {
    const weeklyRange = resolveTransactionDateRange({ period: "weekly", now });
    const yearlyRange = resolveTransactionDateRange({ period: "yearly", now });

    expect(weeklyRange.ok).toBe(true);
    if (weeklyRange.ok) {
      expect(weeklyRange.startDate.toISOString()).toBe(
        "2026-07-20T00:00:00.000Z",
      );
      expect(weeklyRange.endDate.toISOString()).toBe(
        "2026-07-27T00:00:00.000Z",
      );
    }

    expect(yearlyRange.ok).toBe(true);
    if (yearlyRange.ok) {
      expect(yearlyRange.startDate.toISOString()).toBe(
        "2026-01-01T00:00:00.000Z",
      );
      expect(yearlyRange.endDate.toISOString()).toBe(
        "2027-01-01T00:00:00.000Z",
      );
    }
  });

  it("supports custom date-only ranges as inclusive calendar days", () => {
    const range = resolveTransactionDateRange({
      startDate: "2026-07-10",
      endDate: "2026-07-12",
      now,
    });

    expect(range.ok).toBe(true);
    if (!range.ok) {
      return;
    }

    expect(range.period).toBe("custom");
    expect(range.startDate.toISOString()).toBe("2026-07-10T00:00:00.000Z");
    expect(range.endDate.toISOString()).toBe("2026-07-13T00:00:00.000Z");
  });

  it("resolves date-only ranges in the user's timezone", () => {
    const range = resolveTransactionDateRange({
      period: "month",
      timeZone: "Asia/Kathmandu",
      now: new Date("2026-07-24T00:30:00.000Z"),
    });
    const customRange = resolveTransactionDateRange({
      period: "custom",
      startDate: "2026-07-10",
      endDate: "2026-07-12",
      timeZone: "Asia/Kathmandu",
      now,
    });

    expect(range.ok).toBe(true);
    if (range.ok) {
      expect(range.startDate.toISOString()).toBe("2026-06-30T18:15:00.000Z");
      expect(range.endDate.toISOString()).toBe("2026-07-31T18:15:00.000Z");
    }

    expect(customRange.ok).toBe(true);
    if (customRange.ok) {
      expect(customRange.startDate.toISOString()).toBe(
        "2026-07-09T18:15:00.000Z",
      );
      expect(customRange.endDate.toISOString()).toBe(
        "2026-07-12T18:15:00.000Z",
      );
    }
  });

  it("rejects invalid custom ranges", () => {
    expect(
      resolveTransactionDateRange({
        period: "custom",
        startDate: "2026-07-10",
      }),
    ).toMatchObject({ ok: false, error: "missing_custom_range" });
    expect(
      resolveTransactionDateRange({
        period: "custom",
        startDate: "2026-07-12",
        endDate: "2026-07-10",
      }),
    ).toMatchObject({ ok: false, error: "invalid_date_range" });
  });
});
