import { randomUUID } from "node:crypto";
import "dotenv/config";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const createdUserIds: string[] = [];

const loadDatabase = async () => {
  const [{ db }, schema] = await Promise.all([
    import("../src/db/client.js"),
    import("../src/db/schema.js"),
  ]);

  return { db, ...schema };
};

describe("budget tools", () => {
  afterEach(async () => {
    const { db, users } = await loadDatabase();

    for (const userId of createdUserIds.splice(0)) {
      await db
        .delete(users)
        .where(eq(users.id, userId))
        .catch(() => null);
    }
  });

  it("creates, queries, updates, allocates to, and archives a reminder budget", async () => {
    const userId = randomUUID();
    const { db, budgets, users } = await loadDatabase();
    const {
      allocateToBudget,
      createBudget,
      deleteBudget,
      queryBudgets,
      updateBudget,
    } = await import("../src/services/budget-tool-service.js");

    await db.insert(users).values({
      id: userId,
      email: `${userId}@example.test`,
      name: "Budget Tool Test",
      currency: "NPR",
      timezone: "Asia/Kathmandu",
      onboardingCompleted: true,
    });
    createdUserIds.push(userId);

    const created = await createBudget({
      user: { id: userId, currency: "NPR" },
      input: {
        name: "Headphone",
        target_amount: 20000,
        recurring_contribution: 2000,
        contribution_cadence: "monthly",
        notification: {
          cadence: "monthly",
          day_of_month: 15,
          until_paid_off: true,
        },
      },
      now: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(created.response).toContain("Budget created");
    const [budget] = await db
      .select()
      .from(budgets)
      .where(eq(budgets.userId, userId))
      .limit(1);

    expect(budget).toMatchObject({
      name: "Headphone",
      targetAmount: "20000.00",
      recurringContribution: "2000.00",
      contributionCadence: "monthly",
      notificationEnabled: true,
      notificationCadence: "monthly",
      notificationDayOfMonth: 15,
      notificationUntilPaidOff: true,
    });
    expect(budget?.nextNotificationAt?.toISOString()).toBe(
      "2026-07-15T09:00:00.000Z",
    );

    const listed = await queryBudgets({
      user: { id: userId, currency: "NPR" },
      input: { aggregate: "list", status: "active" },
    });

    expect(listed.response).toContain("Headphone");

    if (!budget) {
      throw new Error("Expected created budget");
    }

    const updated = await updateBudget({
      user: { id: userId, currency: "NPR" },
      input: {
        budget_id: budget.id,
        changes: {
          recurring_contribution: 2500,
          notification: {
            cadence: "daily",
            until_paid_off: true,
          },
        },
      },
      now: new Date("2026-07-02T00:00:00.000Z"),
    });

    expect(updated.response).toContain("Budget updated");

    const allocated = await allocateToBudget({
      user: { id: userId, currency: "NPR" },
      input: {
        budget_id: budget.id,
        amount: 20000,
        occurred_at: "2026-07-03T00:00:00.000Z",
        note: "Fully funded",
      },
    });

    expect(allocated.response).toContain("Budget allocation saved");

    const [paidBudget] = await db
      .select()
      .from(budgets)
      .where(eq(budgets.id, budget.id))
      .limit(1);

    expect(paidBudget).toMatchObject({
      currentAmount: "20000.00",
      status: "completed",
      notificationEnabled: false,
      notificationCadence: "none",
      nextNotificationAt: null,
    });

    const archived = await deleteBudget({
      user: { id: userId, currency: "NPR" },
      input: { budget_id: budget.id },
    });

    expect(archived.response).toContain("Budget archived");
  });
});
