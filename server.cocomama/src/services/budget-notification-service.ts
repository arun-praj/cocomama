import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { budgetNotificationLogs, budgets } from "../db/schema.js";

export interface BudgetNotificationUserContext {
  id: string;
}

export type BudgetNotificationDeliveryChannel = "app" | "browser";

const formatMoney = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
};

const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

const withDayOfMonth = (date: Date, dayOfMonth: number) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = Math.min(dayOfMonth, daysInMonth(year, month));

  return new Date(Date.UTC(year, month, day, 9, 0, 0, 0));
};

export const getInitialBudgetNotificationDate = ({
  cadence,
  dayOfMonth,
  now,
}: {
  cadence: "none" | "once" | "daily" | "monthly";
  dayOfMonth?: number | null;
  now: Date;
}) => {
  if (cadence === "none") {
    return null;
  }

  if (cadence === "daily") {
    return now;
  }

  if (cadence === "monthly") {
    const targetDate = withDayOfMonth(now, dayOfMonth ?? now.getUTCDate());

    if (targetDate.getTime() > now.getTime()) {
      return targetDate;
    }

    return withDayOfMonth(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
      dayOfMonth ?? now.getUTCDate(),
    );
  }

  return now;
};

export const getNextBudgetNotificationDate = ({
  cadence,
  dayOfMonth,
  previousDate,
}: {
  cadence: "none" | "once" | "daily" | "monthly";
  dayOfMonth?: number | null;
  previousDate: Date;
}) => {
  if (cadence === "daily") {
    return new Date(previousDate.getTime() + 24 * 60 * 60 * 1000);
  }

  if (cadence === "monthly") {
    return withDayOfMonth(
      new Date(
        Date.UTC(
          previousDate.getUTCFullYear(),
          previousDate.getUTCMonth() + 1,
          1,
        ),
      ),
      dayOfMonth ?? previousDate.getUTCDate(),
    );
  }

  return null;
};

export const listDueBudgetNotifications = async ({
  user,
  now = new Date(),
  currency = "NPR",
}: {
  user: BudgetNotificationUserContext;
  now?: Date;
  currency?: string;
}) => {
  const rows = await db
    .select({
      id: budgets.id,
      name: budgets.name,
      targetAmount: budgets.targetAmount,
      currentAmount: budgets.currentAmount,
      notificationCadence: budgets.notificationCadence,
      notificationDayOfMonth: budgets.notificationDayOfMonth,
      notificationUntilPaidOff: budgets.notificationUntilPaidOff,
      nextNotificationAt: budgets.nextNotificationAt,
    })
    .from(budgets)
    .where(
      and(
        eq(budgets.userId, user.id),
        eq(budgets.status, "active"),
        eq(budgets.notificationEnabled, true),
        lte(budgets.nextNotificationAt, now),
      ),
    )
    .limit(50);
  const notifications = [];

  for (const row of rows) {
    const targetAmount = row.targetAmount ? Number(row.targetAmount) : null;
    const currentAmount = Number(row.currentAmount);
    const isPaidOff = targetAmount !== null && currentAmount >= targetAmount;

    if (row.notificationUntilPaidOff && isPaidOff) {
      await db
        .update(budgets)
        .set({
          notificationEnabled: false,
          notificationCadence: "none",
          nextNotificationAt: null,
          updatedAt: now,
        })
        .where(eq(budgets.id, row.id));
      continue;
    }

    const scheduledFor = row.nextNotificationAt ?? now;
    const remaining =
      targetAmount === null ? null : targetAmount - currentAmount;
    const title = `Budget reminder: ${row.name}`;
    const body =
      remaining === null
        ? `Check your ${row.name} budget.`
        : `${formatMoney(Math.max(remaining, 0), currency)} remaining for ${row.name}.`;
    const [log] = await db
      .insert(budgetNotificationLogs)
      .values({
        budgetId: row.id,
        userId: user.id,
        title,
        body,
        scheduledFor,
      })
      .onConflictDoUpdate({
        target: [
          budgetNotificationLogs.budgetId,
          budgetNotificationLogs.scheduledFor,
        ],
        set: {
          title,
          body,
        },
      })
      .returning();
    const nextNotificationAt = getNextBudgetNotificationDate({
      cadence: row.notificationCadence,
      dayOfMonth: row.notificationDayOfMonth,
      previousDate: scheduledFor,
    });

    await db
      .update(budgets)
      .set({
        ...(nextNotificationAt
          ? { nextNotificationAt }
          : {
              nextNotificationAt: null,
              notificationEnabled: false,
              notificationCadence: "none" as const,
            }),
        updatedAt: now,
      })
      .where(eq(budgets.id, row.id));

    if (log) {
      notifications.push({
        id: log.id,
        budgetId: log.budgetId,
        title: log.title,
        body: log.body,
        scheduledFor: log.scheduledFor.toISOString(),
      });
    }
  }

  return notifications;
};

export const markBudgetNotificationDelivered = async ({
  user,
  notificationId,
  channel,
  now = new Date(),
}: {
  user: BudgetNotificationUserContext;
  notificationId: string;
  channel: BudgetNotificationDeliveryChannel;
  now?: Date;
}) => {
  const [log] = await db
    .update(budgetNotificationLogs)
    .set({
      ...(channel === "app"
        ? { appDeliveredAt: now }
        : { browserDeliveredAt: now }),
    })
    .where(
      and(
        eq(budgetNotificationLogs.id, notificationId),
        eq(budgetNotificationLogs.userId, user.id),
      ),
    )
    .returning();

  return log ?? null;
};

export const dismissBudgetNotification = async ({
  user,
  notificationId,
  now = new Date(),
}: {
  user: BudgetNotificationUserContext;
  notificationId: string;
  now?: Date;
}) => {
  const [log] = await db
    .update(budgetNotificationLogs)
    .set({ dismissedAt: now })
    .where(
      and(
        eq(budgetNotificationLogs.id, notificationId),
        eq(budgetNotificationLogs.userId, user.id),
      ),
    )
    .returning();

  return log ?? null;
};

export const listBudgetNotificationAuditLogs = async ({
  user,
  limit = 50,
}: {
  user: BudgetNotificationUserContext;
  limit?: number;
}) =>
  db
    .select({
      id: budgetNotificationLogs.id,
      budgetId: budgetNotificationLogs.budgetId,
      title: budgetNotificationLogs.title,
      body: budgetNotificationLogs.body,
      scheduledFor: budgetNotificationLogs.scheduledFor,
      appDeliveredAt: budgetNotificationLogs.appDeliveredAt,
      browserDeliveredAt: budgetNotificationLogs.browserDeliveredAt,
      dismissedAt: budgetNotificationLogs.dismissedAt,
      createdAt: budgetNotificationLogs.createdAt,
    })
    .from(budgetNotificationLogs)
    .where(eq(budgetNotificationLogs.userId, user.id))
    .orderBy(sql`${budgetNotificationLogs.createdAt} desc`)
    .limit(limit);
