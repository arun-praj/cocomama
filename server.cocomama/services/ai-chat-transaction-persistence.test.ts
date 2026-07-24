import { randomUUID } from "node:crypto";
import "dotenv/config";
import { afterEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { ChatGateway } from "../src/services/chat-orchestrator.js";

const createdUserIds: string[] = [];

const loadDatabase = async () => {
  const [{ db }, schema] = await Promise.all([
    import("../src/db/client.js"),
    import("../src/db/schema.js"),
  ]);

  return { db, ...schema };
};

describe("AI chat transaction persistence", () => {
  afterEach(async () => {
    const { db, users } = await loadDatabase();

    for (const userId of createdUserIds.splice(0)) {
      await db
        .delete(users)
        .where(eq(users.id, userId))
        .catch(() => null);
    }
  });

  it("creates an expense record in the database with AI-provided title and description", async () => {
    const userId = randomUUID();
    const categoryName = "test expense";
    const { createChatOrchestrator } =
      await import("../src/services/chat-orchestrator.js");
    const { db, categories, transactions, users } = await loadDatabase();
    const gateway: ChatGateway = {
      async createChatCompletion() {
        return {
          model: "fake-model",
          content: JSON.stringify({
            tool: "create_transaction",
            arguments: {
              type: "expense",
              amount: 555,
              category: categoryName,
              title: "Test title",
              description: "Test desc",
              occurred_at: "2026-07-21T00:00:00.000Z",
            },
          }),
        };
      },
    };
    const orchestrator = createChatOrchestrator({
      gateway,
      now: () => new Date("2026-07-21T00:00:00.000Z"),
    });

    await db.insert(users).values({
      id: userId,
      email: `${userId}@example.test`,
      name: "AI Chat Persistence Test",
      currency: "NPR",
      timezone: "Asia/Kathmandu",
      onboardingCompleted: true,
    });
    createdUserIds.push(userId);
    const [category] = await db
      .insert(categories)
      .values({
        userId,
        kind: "expense",
        name: categoryName,
      })
      .returning();

    if (!category) {
      throw new Error("Expected seeded category");
    }

    const response = await orchestrator.handleChat({
      userId,
      user: {
        id: userId,
        email: `${userId}@example.test`,
        name: "AI Chat Persistence Test",
        currency: "NPR",
        timezone: "Asia/Kathmandu",
      },
      message:
        'Create a expense of 2000. Titled Test Expense, Description "Test desc", title: Test title and expense of rs 555',
    });

    expect(response.ok).toBe(true);
    expect(response.data?.response).toContain("### Transaction saved");
    expect(response.data?.response).toContain("**Title:** Test title");
    expect(response.data?.toolCalls?.[0]?.result).toMatchObject({
      description: "Test desc",
      title: "Test title",
      amountMinor: 55500,
      category: categoryName,
      currency: "NPR",
    });

    const [savedTransaction] = await db
      .select({
        id: transactions.id,
        userId: transactions.userId,
        type: transactions.type,
        amount: transactions.amount,
        categoryId: transactions.categoryId,
        title: transactions.title,
        description: transactions.description,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.title, "Test title"),
        ),
      )
      .limit(1);

    expect(savedTransaction).toEqual({
      id: expect.any(String),
      userId,
      type: "expense",
      amount: "555.00",
      categoryId: category.id,
      title: "Test title",
      description: "Test desc",
    });
  });

  it("uses global saved categories when the user does not have a personal copy", async () => {
    const userId = randomUUID();
    const categoryName = `global-food-${randomUUID()}`;
    const { createChatOrchestrator } =
      await import("../src/services/chat-orchestrator.js");
    const { db, categories, transactions, users } = await loadDatabase();
    const gateway: ChatGateway = {
      async createChatCompletion() {
        return {
          model: "fake-model",
          content: JSON.stringify({
            tool: "create_transaction",
            arguments: {
              type: "expense",
              amount: 450,
              category: categoryName,
              title: "Lunch",
              description: "Lunch",
              occurred_at: "2026-07-21T00:00:00.000Z",
            },
          }),
        };
      },
    };
    const orchestrator = createChatOrchestrator({
      gateway,
      now: () => new Date("2026-07-21T00:00:00.000Z"),
    });

    await db.insert(users).values({
      id: userId,
      email: `${userId}@example.test`,
      name: "AI Chat Global Category Test",
      currency: "NPR",
      timezone: "Asia/Kathmandu",
      onboardingCompleted: true,
    });
    createdUserIds.push(userId);
    const [globalCategory] = await db
      .insert(categories)
      .values({
        userId: null,
        kind: "expense",
        name: categoryName,
      })
      .returning();

    if (!globalCategory) {
      throw new Error("Expected seeded global category");
    }

    const response = await orchestrator.handleChat({
      userId,
      user: {
        id: userId,
        email: `${userId}@example.test`,
        name: "AI Chat Global Category Test",
        currency: "NPR",
        timezone: "Asia/Kathmandu",
      },
      message: "Create a lunch expense",
    });

    expect(response.ok).toBe(true);
    expect(response.data?.response).toContain("### Transaction saved");

    const [savedTransaction] = await db
      .select({
        userId: transactions.userId,
        categoryId: transactions.categoryId,
      })
      .from(transactions)
      .where(
        and(eq(transactions.userId, userId), eq(transactions.title, "Lunch")),
      )
      .limit(1);

    expect(savedTransaction).toEqual({
      userId,
      categoryId: globalCategory.id,
    });
  });

  it("loads seeded categories, infers Food & Dining from lunch, and converts dollars to user currency", async () => {
    const userId = randomUUID();
    const { createChatOrchestrator } =
      await import("../src/services/chat-orchestrator.js");
    const { seedDefaultCategories } =
      await import("../src/services/default-category-seed-service.js");
    const { db, categories, transactions, users } = await loadDatabase();
    const gateway: ChatGateway = {
      async createChatCompletion(request) {
        expect(request.messages[0]?.content).toContain("Food & Dining");
        expect(request.messages[0]?.content).toContain("Lunch");

        return {
          model: "fake-model",
          content: JSON.stringify({
            tool: "create_transaction",
            arguments: {
              type: "expense",
              amount: 18,
              category: "lunch",
              title: "Lunch",
              description: "Lunch today",
              occurred_at: "2026-07-22T00:00:00.000Z",
            },
          }),
        };
      },
    };
    const orchestrator = createChatOrchestrator({
      gateway,
      now: () => new Date("2026-07-22T00:00:00.000Z"),
    });

    await db.insert(users).values({
      id: userId,
      email: `${userId}@example.test`,
      name: "AI Chat Currency Category Test",
      currency: "NPR",
      timezone: "Asia/Kathmandu",
      onboardingCompleted: true,
    });
    createdUserIds.push(userId);
    await seedDefaultCategories();
    const [foodCategory] = await db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.kind, "expense"),
          eq(categories.name, "Food & Dining"),
        ),
      )
      .limit(1);

    if (!foodCategory) {
      throw new Error("Expected seeded food category");
    }

    const response = await orchestrator.handleChat({
      userId,
      user: {
        id: userId,
        email: `${userId}@example.test`,
        name: "AI Chat Currency Category Test",
        currency: "NPR",
        timezone: "Asia/Kathmandu",
      },
      message: "I spent $18 on lunch today",
    });

    expect(response.ok).toBe(true);
    expect(response.data?.response).toContain("### Transaction saved");
    expect(response.data?.toolCalls?.[0]?.result).toMatchObject({
      category: "Food & Dining",
      currency: "NPR",
      amountMinor: 243000,
      originalAmountMinor: 1800,
      originalCurrency: "USD",
      exchangeRate: "135.000000",
    });

    const [savedTransaction] = await db
      .select({
        amount: transactions.amount,
        categoryId: transactions.categoryId,
      })
      .from(transactions)
      .where(
        and(eq(transactions.userId, userId), eq(transactions.title, "Lunch")),
      )
      .limit(1);

    expect(savedTransaction).toEqual({
      amount: "2430.00",
      categoryId: foodCategory.id,
    });
  });

  it("prefers specific inferred categories over broad shopping and creates them", async () => {
    const userId = randomUUID();
    const { createChatOrchestrator } =
      await import("../src/services/chat-orchestrator.js");
    const { db, categories, transactions, users } = await loadDatabase();
    const payloads = [
      {
        message: "I bought a shirt for Rs 900",
        title: "Shirt",
        expectedCategory: "Clothing",
        arguments: {
          type: "expense",
          amount: 900,
          category: "shopping",
          title: "Shirt",
          description: "Shirt",
          occurred_at: "2026-07-22T00:00:00.000Z",
        },
      },
      {
        message: "I bought plants for Rs 450",
        title: "Plants",
        expectedCategory: "Plants",
        arguments: {
          type: "expense",
          amount: 450,
          category: "shopping",
          title: "Plants",
          description: "Plants",
          occurred_at: "2026-07-22T00:00:00.000Z",
        },
      },
    ];
    let payloadIndex = 0;
    const gateway: ChatGateway = {
      async createChatCompletion() {
        const payload = payloads[payloadIndex];

        if (!payload) {
          throw new Error("Unexpected chat completion call");
        }

        payloadIndex += 1;

        return {
          model: "fake-model",
          content: JSON.stringify({
            tool: "create_transaction",
            arguments: payload.arguments,
          }),
        };
      },
    };
    const orchestrator = createChatOrchestrator({
      gateway,
      now: () => new Date("2026-07-22T00:00:00.000Z"),
    });

    await db.insert(users).values({
      id: userId,
      email: `${userId}@example.test`,
      name: "AI Chat Specific Category Test",
      currency: "NPR",
      timezone: "Asia/Kathmandu",
      onboardingCompleted: true,
    });
    createdUserIds.push(userId);
    await db.insert(categories).values({
      userId,
      kind: "expense",
      name: "Shopping",
      emoji: "🛍️",
      keywords: ["shopping"],
    });

    for (const payload of payloads) {
      const response = await orchestrator.handleChat({
        userId,
        user: {
          id: userId,
          email: `${userId}@example.test`,
          name: "AI Chat Specific Category Test",
          currency: "NPR",
          timezone: "Asia/Kathmandu",
        },
        message: payload.message,
      });

      expect(response.ok).toBe(true);
      expect(response.data?.toolCalls?.[0]?.result).toMatchObject({
        category: payload.expectedCategory,
      });

      const [savedTransaction] = await db
        .select({
          categoryName: categories.name,
          categoryUserId: categories.userId,
        })
        .from(transactions)
        .innerJoin(categories, eq(transactions.categoryId, categories.id))
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.title, payload.title),
          ),
        )
        .limit(1);

      expect(savedTransaction).toEqual({
        categoryName: payload.expectedCategory,
        categoryUserId: userId,
      });
    }
  });

  it("maps AI keyword categories to seeded categories for expenses, income, and savings", async () => {
    const userId = randomUUID();
    const { createChatOrchestrator } =
      await import("../src/services/chat-orchestrator.js");
    const { seedDefaultCategories } =
      await import("../src/services/default-category-seed-service.js");
    const { db, categories, transactions, users } = await loadDatabase();
    const payloads = [
      {
        message: "I spent 900 on groceries today",
        title: "Grocery run",
        expectedCategory: "Food & Dining",
        arguments: {
          type: "expense",
          amount: 900,
          category: "groceries",
          title: "Grocery run",
          description: "Groceries",
          occurred_at: "2026-07-22T00:00:00.000Z",
        },
      },
      {
        message: "I got a payroll deposit of 50000",
        title: "Payroll deposit",
        expectedCategory: "Salary & Employment",
        arguments: {
          type: "income",
          amount: 50_000,
          category: "payroll deposit",
          title: "Payroll deposit",
          description: "Payroll deposit",
          occurred_at: "2026-07-22T00:00:00.000Z",
        },
      },
      {
        message: "Move 2500 into rainy day fund",
        title: "Rainy day fund",
        expectedCategory: "Emergency Fund",
        arguments: {
          type: "savings",
          amount: 2_500,
          category: "rainy day fund",
          title: "Rainy day fund",
          description: "Emergency savings",
          occurred_at: "2026-07-22T00:00:00.000Z",
        },
      },
    ];
    let payloadIndex = 0;
    const gateway: ChatGateway = {
      async createChatCompletion() {
        const payload = payloads[payloadIndex];

        if (!payload) {
          throw new Error("Unexpected chat completion call");
        }

        payloadIndex += 1;

        return {
          model: "fake-model",
          content: JSON.stringify({
            tool: "create_transaction",
            arguments: payload.arguments,
          }),
        };
      },
    };
    const orchestrator = createChatOrchestrator({
      gateway,
      now: () => new Date("2026-07-22T00:00:00.000Z"),
    });

    await seedDefaultCategories();
    await db.insert(users).values({
      id: userId,
      email: `${userId}@example.test`,
      name: "AI Chat Seeded Category Test",
      currency: "NPR",
      timezone: "Asia/Kathmandu",
      onboardingCompleted: true,
    });
    createdUserIds.push(userId);

    for (const payload of payloads) {
      const response = await orchestrator.handleChat({
        userId,
        user: {
          id: userId,
          email: `${userId}@example.test`,
          name: "AI Chat Seeded Category Test",
          currency: "NPR",
          timezone: "Asia/Kathmandu",
        },
        message: payload.message,
      });

      expect(response.ok).toBe(true);
      expect(response.data?.toolCalls?.[0]?.result).toMatchObject({
        category: payload.expectedCategory,
      });

      const [savedTransaction] = await db
        .select({
          categoryName: categories.name,
        })
        .from(transactions)
        .innerJoin(categories, eq(transactions.categoryId, categories.id))
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.title, payload.title),
          ),
        )
        .limit(1);

      expect(savedTransaction?.categoryName).toBe(payload.expectedCategory);
    }
  });
});
