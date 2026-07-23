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

describe("budget notification audit", () => {
  afterEach(async () => {
    const { db, users } = await loadDatabase();

    for (const userId of createdUserIds.splice(0)) {
      await db
        .delete(users)
        .where(eq(users.id, userId))
        .catch(() => null);
    }
  });

  it("creates due notification logs and records app and browser delivery", async () => {
    const userId = randomUUID();
    const { db, budgetNotificationLogs, budgets, users } = await loadDatabase();
    const {
      listBudgetNotificationAuditLogs,
      listDueBudgetNotifications,
      markBudgetNotificationDelivered,
    } = await import("../src/services/budget-notification-service.js");

    await db.insert(users).values({
      id: userId,
      email: `${userId}@example.test`,
      name: "Budget Notification Test",
      currency: "NPR",
      timezone: "Asia/Kathmandu",
      onboardingCompleted: true,
    });
    createdUserIds.push(userId);

    const [budget] = await db
      .insert(budgets)
      .values({
        userId,
        name: "Headphone",
        targetAmount: "20000.00",
        currentAmount: "4000.00",
        notificationEnabled: true,
        notificationCadence: "monthly",
        notificationDayOfMonth: 15,
        notificationUntilPaidOff: true,
        nextNotificationAt: new Date("2026-07-15T09:00:00.000Z"),
      })
      .returning();

    if (!budget) {
      throw new Error("Expected budget");
    }

    const dueNotifications = await listDueBudgetNotifications({
      user: { id: userId },
      now: new Date("2026-07-15T10:00:00.000Z"),
      currency: "NPR",
    });

    expect(dueNotifications).toHaveLength(1);
    expect(dueNotifications[0]?.title).toContain("Headphone");

    const [nextBudget] = await db
      .select()
      .from(budgets)
      .where(eq(budgets.id, budget.id))
      .limit(1);

    expect(nextBudget?.nextNotificationAt?.toISOString()).toBe(
      "2026-08-15T09:00:00.000Z",
    );

    const notification = dueNotifications[0];

    if (!notification) {
      throw new Error("Expected notification");
    }

    await markBudgetNotificationDelivered({
      user: { id: userId },
      notificationId: notification.id,
      channel: "app",
      now: new Date("2026-07-15T10:01:00.000Z"),
    });
    await markBudgetNotificationDelivered({
      user: { id: userId },
      notificationId: notification.id,
      channel: "browser",
      now: new Date("2026-07-15T10:02:00.000Z"),
    });

    const [log] = await db
      .select()
      .from(budgetNotificationLogs)
      .where(eq(budgetNotificationLogs.id, notification.id))
      .limit(1);

    expect(log?.appDeliveredAt?.toISOString()).toBe("2026-07-15T10:01:00.000Z");
    expect(log?.browserDeliveredAt?.toISOString()).toBe(
      "2026-07-15T10:02:00.000Z",
    );

    const auditLogs = await listBudgetNotificationAuditLogs({
      user: { id: userId },
    });

    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]?.title).toContain("Headphone");
  });
});
