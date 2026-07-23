import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../src/services/system-prompt-service.js";
import { normalizeMerchant } from "../src/services/merchant-normalizer.js";

describe("system prompt service", () => {
  it("injects user finance context and tool rules", () => {
    const prompt = buildSystemPrompt({
      todayDate: "2026-07-19",
      userTimezone: "Asia/Kathmandu",
      userCurrency: "NPR",
      categories: {
        expense: ["groceries", "other"],
        income: ["salary"],
        savings: ["sip"],
      },
      budgets: [
        {
          id: "budget-1",
          name: "laptop",
          status: "active",
          targetAmount: "2000.00",
          currentAmount: "200.00",
        },
      ],
    });

    expect(prompt).toContain("Today's date is 2026-07-19");
    expect(prompt).toContain("expense: groceries, other");
    expect(prompt).toContain("laptop (active, saved 200.00, target 2000.00)");
    expect(prompt).toContain("Never invent SQL");
  });

  it("normalizes merchant names for cache keys", () => {
    expect(normalizeMerchant("Coseli Nepal!")).toBe("coseli nepal");
  });
});
