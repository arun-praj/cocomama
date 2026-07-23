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

describe("transaction query grouping", () => {
  afterEach(async () => {
    const { db, users } = await loadDatabase();

    for (const userId of createdUserIds.splice(0)) {
      await db
        .delete(users)
        .where(eq(users.id, userId))
        .catch(() => null);
    }
  });

  it("groups transaction totals by merchant, date, and type", async () => {
    const userId = randomUUID();
    const { queryTransactions } =
      await import("../src/services/transaction-query-service.js");
    const { db, categories, transactions, users } = await loadDatabase();

    await db.insert(users).values({
      id: userId,
      email: `${userId}@example.test`,
      name: "Transaction Query Grouping Test",
      currency: "NPR",
      timezone: "Asia/Kathmandu",
      onboardingCompleted: true,
    });
    createdUserIds.push(userId);

    const [foodCategory] = await db
      .insert(categories)
      .values({
        userId,
        kind: "expense",
        name: "food",
      })
      .returning();

    if (!foodCategory) {
      throw new Error("Expected seeded food category");
    }

    await db.insert(transactions).values([
      {
        userId,
        type: "expense",
        amount: "500.00",
        categoryId: foodCategory.id,
        merchant: "Daraz",
        title: "Headphones",
        description: "Headphones at Daraz",
        occurredAt: new Date("2026-07-21T00:00:00.000Z"),
      },
      {
        userId,
        type: "expense",
        amount: "700.00",
        categoryId: foodCategory.id,
        merchant: "Daraz",
        title: "Lunch",
        description: "Lunch at Daraz cafe",
        occurredAt: new Date("2026-07-21T10:00:00.000Z"),
      },
      {
        userId,
        type: "income",
        amount: "2000.00",
        merchant: "Office",
        title: "Salary",
        description: "Salary payment",
        occurredAt: new Date("2026-07-22T00:00:00.000Z"),
      },
    ]);

    const byMerchant = await queryTransactions({
      user: { id: userId, currency: "NPR" },
      input: {
        filters: {},
        aggregate: "sum",
        group_by: "merchant",
        sort: "amount_desc",
      },
    });
    const byDate = await queryTransactions({
      user: { id: userId, currency: "NPR" },
      input: {
        filters: {},
        aggregate: "sum",
        group_by: "date",
      },
    });
    const byType = await queryTransactions({
      user: { id: userId, currency: "NPR" },
      input: {
        filters: {},
        aggregate: "sum",
        group_by: "type",
      },
    });

    expect(byMerchant.response).toContain("Daraz");
    expect(byMerchant.response).toContain("NPR");
    expect(byDate.response).toContain("2026-07-21");
    expect(byDate.response).toContain("2026-07-22");
    expect(byType.response).toContain("expense");
    expect(byType.response).toContain("income");
  });

  it("applies amount filters before listing and grouping transactions", async () => {
    const userId = randomUUID();
    const { queryTransactions } =
      await import("../src/services/transaction-query-service.js");
    const { db, categories, transactions, users } = await loadDatabase();

    await db.insert(users).values({
      id: userId,
      email: `${userId}@example.test`,
      name: "Transaction Query Amount Filter Test",
      currency: "NPR",
      timezone: "Asia/Kathmandu",
      onboardingCompleted: true,
    });
    createdUserIds.push(userId);

    const [foodCategory] = await db
      .insert(categories)
      .values({
        userId,
        kind: "expense",
        name: "food",
      })
      .returning();

    if (!foodCategory) {
      throw new Error("Expected seeded food category");
    }

    await db.insert(transactions).values([
      {
        userId,
        type: "expense",
        amount: "750.00",
        categoryId: foodCategory.id,
        merchant: "Below Mart",
        title: "Tea",
        description: "Tea below threshold",
        occurredAt: new Date("2026-07-21T00:00:00.000Z"),
      },
      {
        userId,
        type: "expense",
        amount: "1500.00",
        categoryId: foodCategory.id,
        merchant: "Big Store",
        title: "Shoes",
        description: "Shoes above threshold",
        occurredAt: new Date("2026-07-21T10:00:00.000Z"),
      },
      {
        userId,
        type: "expense",
        amount: "2500.00",
        categoryId: foodCategory.id,
        merchant: "Big Store",
        title: "Bag",
        description: "Bag above threshold",
        occurredAt: new Date("2026-07-22T10:00:00.000Z"),
      },
    ]);

    const filteredList = await queryTransactions({
      user: { id: userId, currency: "NPR" },
      input: {
        filters: {
          type: "expense",
          date_start: "2026-07-01",
          date_end: "2026-07-31",
          amount_min: 1000,
        },
        aggregate: "list",
        sort: "amount_desc",
      },
    });
    const filteredByMerchant = await queryTransactions({
      user: { id: userId, currency: "NPR" },
      input: {
        filters: {
          type: "expense",
          date_start: "2026-07-01",
          date_end: "2026-07-31",
          amount_min: 1000,
        },
        aggregate: "sum",
        group_by: "merchant",
        sort: "amount_desc",
      },
    });

    expect(filteredList.response).toContain("Shoes");
    expect(filteredList.response).toContain("Bag");
    expect(filteredList.response).not.toContain("Tea");
    expect(filteredByMerchant.response).toContain("Big Store");
    expect(filteredByMerchant.response).not.toContain("Below Mart");
  });

  it("applies amount ranges before listing and grouping transactions", async () => {
    const userId = randomUUID();
    const { queryTransactions } =
      await import("../src/services/transaction-query-service.js");
    const { db, categories, transactions, users } = await loadDatabase();

    await db.insert(users).values({
      id: userId,
      email: `${userId}@example.test`,
      name: "Transaction Query Amount Range Test",
      currency: "NPR",
      timezone: "Asia/Kathmandu",
      onboardingCompleted: true,
    });
    createdUserIds.push(userId);

    const [foodCategory, transportCategory] = await db
      .insert(categories)
      .values([
        {
          userId,
          kind: "expense",
          name: "food",
        },
        {
          userId,
          kind: "expense",
          name: "transport",
        },
      ])
      .returning();

    if (!foodCategory || !transportCategory) {
      throw new Error("Expected seeded categories");
    }

    await db.insert(transactions).values([
      {
        userId,
        type: "expense",
        amount: "300.00",
        categoryId: foodCategory.id,
        merchant: "Below Mart",
        title: "Snack",
        description: "Below range snack",
        occurredAt: new Date("2026-07-21T00:00:00.000Z"),
      },
      {
        userId,
        type: "expense",
        amount: "1500.00",
        categoryId: foodCategory.id,
        merchant: "Food Store",
        title: "Dinner",
        description: "In range dinner",
        occurredAt: new Date("2026-07-21T10:00:00.000Z"),
      },
      {
        userId,
        type: "expense",
        amount: "900.00",
        categoryId: transportCategory.id,
        merchant: "Taxi",
        title: "Ride",
        description: "In range ride",
        occurredAt: new Date("2026-07-22T10:00:00.000Z"),
      },
      {
        userId,
        type: "expense",
        amount: "2600.00",
        categoryId: foodCategory.id,
        merchant: "Above Store",
        title: "Appliance",
        description: "Above range appliance",
        occurredAt: new Date("2026-07-23T10:00:00.000Z"),
      },
    ]);

    const filters = {
      type: "expense" as const,
      date_start: "2026-07-01",
      date_end: "2026-07-31",
      amount_min: 500,
      amount_max: 2500,
    };
    const filteredList = await queryTransactions({
      user: { id: userId, currency: "NPR" },
      input: {
        filters,
        aggregate: "list",
        sort: "amount_desc",
      },
    });
    const filteredByCategory = await queryTransactions({
      user: { id: userId, currency: "NPR" },
      input: {
        filters,
        aggregate: "sum",
        group_by: "category",
        sort: "amount_desc",
      },
    });

    expect(filteredList.response).toContain("Dinner");
    expect(filteredList.response).toContain("Ride");
    expect(filteredList.response).not.toContain("Snack");
    expect(filteredList.response).not.toContain("Appliance");
    expect(filteredByCategory.response).toContain("food");
    expect(filteredByCategory.response).toContain("transport");
  });
});
