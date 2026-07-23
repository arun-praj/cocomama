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

describe("transaction balance trigger", () => {
  afterEach(async () => {
    const { db, users } = await loadDatabase();

    for (const userId of createdUserIds.splice(0)) {
      await db
        .delete(users)
        .where(eq(users.id, userId))
        .catch(() => null);
    }
  });

  it("keeps user spendable and saved totals in sync with transaction changes", async () => {
    const userId = randomUUID();
    const { db, transactions, users } = await loadDatabase();

    const readBalances = async () => {
      const [userRow] = await db
        .select({
          spendableBalance: users.spendableBalance,
          totalSaved: users.totalSaved,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!userRow) {
        throw new Error("Expected user row");
      }

      return {
        spendableBalance: Number(userRow.spendableBalance),
        totalSaved: Number(userRow.totalSaved),
      };
    };

    await db.insert(users).values({
      id: userId,
      email: `${userId}@example.test`,
      name: "Transaction Balance Trigger Test",
      currency: "NPR",
      timezone: "Asia/Kathmandu",
      onboardingCompleted: true,
    });
    createdUserIds.push(userId);

    const [incomeTransaction] = await db
      .insert(transactions)
      .values({
        userId,
        type: "income",
        amount: "5000.00",
        title: "Salary",
        description: "Salary payment",
        occurredAt: new Date("2026-07-21T00:00:00.000Z"),
      })
      .returning({ id: transactions.id });

    expect(await readBalances()).toEqual({
      spendableBalance: 5000,
      totalSaved: 0,
    });

    const [expenseTransaction] = await db
      .insert(transactions)
      .values({
        userId,
        type: "expense",
        amount: "1200.00",
        title: "Groceries",
        description: "Groceries",
        occurredAt: new Date("2026-07-21T01:00:00.000Z"),
      })
      .returning({ id: transactions.id });

    expect(await readBalances()).toEqual({
      spendableBalance: 3800,
      totalSaved: 0,
    });

    const [savingsTransaction] = await db
      .insert(transactions)
      .values({
        userId,
        type: "savings",
        amount: "1000.00",
        title: "Emergency fund",
        description: "Emergency fund contribution",
        occurredAt: new Date("2026-07-21T02:00:00.000Z"),
      })
      .returning({ id: transactions.id });

    expect(await readBalances()).toEqual({
      spendableBalance: 2800,
      totalSaved: 1000,
    });

    if (!expenseTransaction || !savingsTransaction || !incomeTransaction) {
      throw new Error("Expected seeded transactions");
    }

    await db
      .update(transactions)
      .set({ amount: "1500.00" })
      .where(eq(transactions.id, expenseTransaction.id));

    expect(await readBalances()).toEqual({
      spendableBalance: 2500,
      totalSaved: 1000,
    });

    await db
      .update(transactions)
      .set({ deletedAt: new Date("2026-07-22T00:00:00.000Z") })
      .where(eq(transactions.id, savingsTransaction.id));

    expect(await readBalances()).toEqual({
      spendableBalance: 3500,
      totalSaved: 0,
    });

    await db
      .update(transactions)
      .set({ deletedAt: null })
      .where(eq(transactions.id, savingsTransaction.id));

    expect(await readBalances()).toEqual({
      spendableBalance: 2500,
      totalSaved: 1000,
    });

    await db
      .delete(transactions)
      .where(eq(transactions.id, incomeTransaction.id));

    expect(await readBalances()).toEqual({
      spendableBalance: -2500,
      totalSaved: 1000,
    });
  });
});
