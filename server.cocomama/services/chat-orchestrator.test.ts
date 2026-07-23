import { describe, expect, it } from "vitest";
import {
  createChatOrchestrator,
  type ChatGateway,
} from "../src/services/chat-orchestrator.js";
import {
  LlmGatewayError,
  type LlmMessage,
} from "../src/services/llm-gateway.js";
import { TransactionCategoryRequiredError } from "../src/services/transaction-record-service.js";

describe("chat orchestrator", () => {
  it("keeps clarify context across follow-up messages", async () => {
    const messagesSentToModel: LlmMessage[][] = [];
    const gateway: ChatGateway = {
      async createChatCompletion(request) {
        messagesSentToModel.push(request.messages);

        return {
          model: "fake-model",
          content:
            messagesSentToModel.length === 1
              ? '{"tool":"clarify","question":"What category would you like to assign to this headphone purchase?"}'
              : '{"tool":"create_transaction","category":"Electronics"}',
        };
      },
    };
    const orchestrator = createChatOrchestrator({
      gateway,
      recordTransaction: async ({ input }) => ({
        toolCall: {
          name: "record_expense",
          label: "Expense saved",
          status: "success",
          input: input as unknown as Record<string, unknown>,
          result: {
            expenseId: "00000000-0000-4000-8000-000000000099",
            description: input.description,
            amountMinor: Math.round(input.amount * 100),
            currency: "NPR",
          },
        },
      }),
      now: () => new Date("2026-07-20T00:00:00.000Z"),
    });

    const first = await orchestrator.handleChat({
      userId: "00000000-0000-4000-8000-000000000001",
      message: "I just bought a new pair of headphone at Rs 2000",
    });

    expect(first.ok).toBe(true);
    const conversationId = first.data?.conversationId;
    expect(conversationId).toBeTruthy();

    if (!conversationId) {
      throw new Error(
        "Expected first chat response to include a conversation id",
      );
    }

    await orchestrator.handleChat({
      userId: "00000000-0000-4000-8000-000000000001",
      conversationId,
      message: "Add it to Electronics",
    });

    expect(messagesSentToModel).toHaveLength(2);
    expect(messagesSentToModel[1]?.map((message) => message.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
    ]);
    expect(messagesSentToModel[1]?.[1]?.content).toBe(
      "I just bought a new pair of headphone at Rs 2000",
    );
    expect(messagesSentToModel[1]?.[2]?.content).toContain(
      "What category would you like to assign",
    );
    expect(messagesSentToModel[1]?.[3]?.content).toBe("Add it to Electronics");
  });

  it("does not reuse a conversation id across different users", async () => {
    const messagesSentToModel: LlmMessage[][] = [];
    const gateway: ChatGateway = {
      async createChatCompletion(request) {
        messagesSentToModel.push(request.messages);

        return {
          model: "fake-model",
          content: "Plain answer",
        };
      },
    };
    const orchestrator = createChatOrchestrator({
      gateway,
      now: () => new Date("2026-07-20T00:00:00.000Z"),
    });
    const first = await orchestrator.handleChat({
      userId: "00000000-0000-4000-8000-000000000001",
      message: "First user message",
    });
    const firstConversationId = first.data?.conversationId;

    if (!firstConversationId) {
      throw new Error("Expected first conversation id");
    }

    const second = await orchestrator.handleChat({
      userId: "00000000-0000-4000-8000-000000000002",
      conversationId: firstConversationId,
      message: "Second user message",
    });

    expect(second.data?.conversationId).toBeTruthy();
    expect(second.data?.conversationId).not.toBe(firstConversationId);
    expect(messagesSentToModel[1]?.map((message) => message.role)).toEqual([
      "system",
      "user",
    ]);
    expect(messagesSentToModel[1]?.[1]?.content).toBe("Second user message");
  });

  it("uses backend-provided conversation history when continuing a chat", async () => {
    const messagesSentToModel: LlmMessage[][] = [];
    const gateway: ChatGateway = {
      async createChatCompletion(request) {
        messagesSentToModel.push(request.messages);

        return {
          model: "fake-model",
          content: "History aware answer",
        };
      },
    };
    const orchestrator = createChatOrchestrator({
      gateway,
      now: () => new Date("2026-07-20T00:00:00.000Z"),
    });

    await orchestrator.handleChat({
      userId: "00000000-0000-4000-8000-000000000001",
      conversationId: "00000000-0000-4000-8000-000000000123",
      history: [
        { role: "user", content: "I spent 500 on lunch" },
        { role: "assistant", content: "Saved lunch." },
      ],
      message: "What did I just save?",
    });

    expect(messagesSentToModel[0]?.map((message) => message.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
    ]);
    expect(messagesSentToModel[0]?.[1]?.content).toBe("I spent 500 on lunch");
    expect(messagesSentToModel[0]?.[2]?.content).toBe("Saved lunch.");
    expect(messagesSentToModel[0]?.[3]?.content).toBe("What did I just save?");
  });

  it("executes create_transaction JSON instead of returning it as chat text", async () => {
    const gateway: ChatGateway = {
      async createChatCompletion() {
        return {
          model: "fake-model",
          content: JSON.stringify({
            tool: "create_transaction",
            type: "expense",
            amount: 2000,
            category: "electronics",
            description: "Headphone",
            occurred_at: "2026-07-20T00:00:00.000Z",
          }),
        };
      },
    };
    const orchestrator = createChatOrchestrator({
      gateway,
      recordTransaction: async ({ input }) => ({
        toolCall: {
          name: "record_expense",
          label: "Expense saved",
          status: "success",
          input: input as unknown as Record<string, unknown>,
          result: {
            expenseId: "00000000-0000-4000-8000-000000000099",
            description: input.description,
            amountMinor: Math.round(input.amount * 100),
            currency: "NPR",
          },
        },
      }),
      now: () => new Date("2026-07-20T00:00:00.000Z"),
    });

    const response = await orchestrator.handleChat({
      userId: "00000000-0000-4000-8000-000000000001",
      message: "I bought headphones for Rs 2000",
    });

    expect(response.ok).toBe(true);
    expect(response.data?.response).toContain("### Transaction saved");
    expect(response.data?.response).toContain("**Type:** expense");
    expect(response.data?.toolCalls?.[0]).toMatchObject({
      name: "record_expense",
      status: "success",
      result: {
        description: "Headphone",
        amountMinor: 200000,
      },
    });
  });

  it("asks the user to create a category when no saved category matches", async () => {
    const gateway: ChatGateway = {
      async createChatCompletion() {
        return {
          model: "fake-model",
          content: JSON.stringify({
            tool: "create_transaction",
            arguments: {
              type: "expense",
              amount: 1200,
              category: "concerts",
              description: "Concert tickets",
              occurred_at: "2026-07-20T00:00:00.000Z",
            },
          }),
        };
      },
    };
    const orchestrator = createChatOrchestrator({
      gateway,
      recordTransaction: async ({ input }) => {
        throw new TransactionCategoryRequiredError({
          category: input.category,
          type: input.type,
          availableCategories: ["food", "transport"],
        });
      },
      now: () => new Date("2026-07-20T00:00:00.000Z"),
    });

    const response = await orchestrator.handleChat({
      userId: "00000000-0000-4000-8000-000000000001",
      conversationId: "00000000-0000-4000-8000-000000000240",
      message: "I spent 1200 on concert tickets",
    });

    expect(response.ok).toBe(true);
    expect(response.data?.response).toContain("concerts");
    expect(response.data?.response).toContain("Create this category first");
    expect(response.data?.toolCalls).toBeUndefined();
  });

  it("normalizes merchant, title, and description aliases for transaction creation", async () => {
    const recordedInputs: unknown[] = [];
    const gateway: ChatGateway = {
      async createChatCompletion() {
        return {
          model: "fake-model",
          content: JSON.stringify({
            tool: "create_transaction",
            arguments: {
              type: "expense",
              amount: 500,
              category: "electronics",
              vendor: "Daraz",
              name: "Headphones",
              item: "Headphones at Daraz",
              occurred_at: "2026-07-20T00:00:00.000Z",
            },
          }),
        };
      },
    };
    const orchestrator = createChatOrchestrator({
      gateway,
      recordTransaction: async ({ input }) => {
        recordedInputs.push(input);

        return {
          toolCall: {
            name: "record_expense",
            label: "Expense saved",
            status: "success",
            input: input as unknown as Record<string, unknown>,
            result: {
              expenseId: "00000000-0000-4000-8000-000000000555",
              title: input.title,
              description: input.description,
              amountMinor: Math.round(input.amount * 100),
              currency: "NPR",
            },
          },
        };
      },
      now: () => new Date("2026-07-20T00:00:00.000Z"),
    });

    const response = await orchestrator.handleChat({
      userId: "00000000-0000-4000-8000-000000000001",
      conversationId: "00000000-0000-4000-8000-000000000556",
      message: "I spent 500 at Daraz for headphones",
    });

    expect(response.ok).toBe(true);
    expect(recordedInputs).toEqual([
      expect.objectContaining({
        merchant: "Daraz",
        title: "Headphones",
        description: "Headphones at Daraz",
      }),
    ]);
  });

  it("normalizes bare transaction JSON and saves it", async () => {
    const gateway: ChatGateway = {
      async createChatCompletion() {
        return {
          model: "fake-model",
          content: JSON.stringify({
            amount: 4200,
            type: "expense",
            category: "groceries",
            date: "2026-07-20",
            description: "Groceries",
          }),
        };
      },
    };
    const orchestrator = createChatOrchestrator({
      gateway,
      recordTransaction: async ({ input }) => ({
        toolCall: {
          name: "record_expense",
          label: "Expense saved",
          status: "success",
          input: input as unknown as Record<string, unknown>,
          result: {
            expenseId: "00000000-0000-4000-8000-000000000100",
            description: input.description,
            amountMinor: Math.round(input.amount * 100),
            currency: "NPR",
            occurredAt: input.occurred_at,
          },
        },
      }),
      now: () => new Date("2026-07-20T00:00:00.000Z"),
    });

    const response = await orchestrator.handleChat({
      userId: "00000000-0000-4000-8000-000000000001",
      message: "I spent NPR 4200 on groceries today",
    });

    expect(response, JSON.stringify(response)).toMatchObject({ ok: true });
    expect(response.data?.response).toContain("### Transaction saved");
    expect(response.data?.response).toContain("**Type:** expense");
    expect(response.data?.toolCalls?.[0]?.result).toMatchObject({
      description: "Groceries",
      amountMinor: 420000,
      occurredAt: "2026-07-20",
    });
  });

  it("executes create_category JSON for adding a new expense category", async () => {
    const gateway: ChatGateway = {
      async createChatCompletion() {
        return {
          model: "fake-model",
          content: JSON.stringify({
            tool: "create_category",
            arguments: {
              kind: "expense",
              name: "transportation",
            },
          }),
        };
      },
    };
    const orchestrator = createChatOrchestrator({
      gateway,
      categoryTools: {
        createCategory: async ({ input }) => ({
          response: `Added ${input.name} under ${input.kind}.`,
          toolCalls: [
            {
              name: "create_category",
              label: "Category added",
              status: "success",
              input: input as unknown as Record<string, unknown>,
              result: {
                title: input.name,
                description: `${input.kind} category`,
                category: input.name,
              },
            },
          ],
        }),
        updateCategory: async () => ({ response: "unused", toolCalls: [] }),
        deleteCategory: async () => ({ response: "unused", toolCalls: [] }),
        queryCategories: async () => ({ response: "unused", toolCalls: [] }),
      },
      now: () => new Date("2026-07-20T00:00:00.000Z"),
    });

    const response = await orchestrator.handleChat({
      userId: "00000000-0000-4000-8000-000000000001",
      message: "Add a new category transportation under expense",
    });

    expect(response.ok).toBe(true);
    expect(response.data?.response).toBe("Added transportation under expense.");
    expect(response.data?.toolCalls?.[0]).toMatchObject({
      name: "create_category",
      status: "success",
      result: {
        category: "transportation",
      },
    });
  });

  it("does not create a category unless the user explicitly asks for category management", async () => {
    const gateway: ChatGateway = {
      async createChatCompletion() {
        return {
          model: "fake-model",
          content: JSON.stringify({
            tool: "create_category",
            arguments: {
              kind: "expense",
              name: "concerts",
            },
          }),
        };
      },
    };
    const orchestrator = createChatOrchestrator({
      gateway,
      categoryTools: {
        createCategory: async () => {
          throw new Error("createCategory should not run without explicit ask");
        },
        updateCategory: async () => ({ response: "unused", toolCalls: [] }),
        deleteCategory: async () => ({ response: "unused", toolCalls: [] }),
        queryCategories: async () => ({ response: "unused", toolCalls: [] }),
      },
      now: () => new Date("2026-07-20T00:00:00.000Z"),
    });

    const response = await orchestrator.handleChat({
      userId: "00000000-0000-4000-8000-000000000001",
      message: "I spent 1200 on concert tickets",
    });

    expect(response.ok).toBe(true);
    expect(response.data?.response).toContain(
      "unless you explicitly ask me to manage categories",
    );
    expect(response.data?.toolCalls).toBeUndefined();
  });

  it("uses modify_transaction when the user asks to delete a transaction", async () => {
    const modifiedTransactions: Array<{
      transaction_id: string;
      delete?: boolean;
    }> = [];
    const transactionId = "00000000-0000-4000-8000-000000000333";
    const gateway: ChatGateway = {
      async createChatCompletion() {
        return {
          model: "fake-model",
          content: JSON.stringify({
            tool: "modify_transaction",
            arguments: {
              transaction_id: transactionId,
              delete: true,
            },
          }),
        };
      },
    };
    const orchestrator = createChatOrchestrator({
      gateway,
      modifyTransactionTool: async ({ input }) => {
        modifiedTransactions.push(input);

        return {
          response:
            "### Transaction deleted\n\n**Title:** Test transaction\n**Amount:** NPR 555.00",
          toolCalls: [
            {
              name: "modify_transaction",
              label: "Transaction deleted",
              status: "success",
              input: input as unknown as Record<string, unknown>,
              result: {
                title: "Test transaction",
                description: "Deleted transaction",
              },
            },
          ],
        };
      },
      now: () => new Date("2026-07-20T00:00:00.000Z"),
    });

    const response = await orchestrator.handleChat({
      userId: "00000000-0000-4000-8000-000000000001",
      message: `Delete transaction ${transactionId}`,
    });

    expect(response.ok).toBe(true);
    expect(response.data?.response).toContain("### Transaction deleted");
    expect(modifiedTransactions).toEqual([
      {
        transaction_id: transactionId,
        delete: true,
      },
    ]);
    expect(response.data?.toolCalls?.[0]).toMatchObject({
      name: "modify_transaction",
      status: "success",
    });
  });

  it("executes query_categories when the user asks to list categories", async () => {
    const queriedCategories: Array<{
      kind?: "expense" | "income" | "savings";
    }> = [];
    const gateway: ChatGateway = {
      async createChatCompletion() {
        return {
          model: "fake-model",
          content: JSON.stringify({
            tool: "query_categories",
            arguments: {
              kind: "expense",
            },
          }),
        };
      },
    };
    const orchestrator = createChatOrchestrator({
      gateway,
      categoryTools: {
        createCategory: async () => ({ response: "unused", toolCalls: [] }),
        updateCategory: async () => ({ response: "unused", toolCalls: [] }),
        deleteCategory: async () => ({ response: "unused", toolCalls: [] }),
        queryCategories: async ({ input }) => {
          queriedCategories.push(input);

          return {
            response: "expense: food, transport",
            toolCalls: [
              {
                name: "query_categories",
                label: "Categories listed",
                status: "success",
                input: input as unknown as Record<string, unknown>,
                result: {
                  title: "Categories",
                  description: "expense: food, transport",
                },
              },
            ],
          };
        },
      },
      now: () => new Date("2026-07-20T00:00:00.000Z"),
    });

    const response = await orchestrator.handleChat({
      userId: "00000000-0000-4000-8000-000000000001",
      message: "List my expense categories",
    });

    expect(response.ok).toBe(true);
    expect(response.data?.response).toBe("expense: food, transport");
    expect(queriedCategories).toEqual([{ kind: "expense" }]);
    expect(response.data?.toolCalls?.[0]).toMatchObject({
      name: "query_categories",
      status: "success",
    });
  });

  it("asks what type a category belongs to when kind is missing", async () => {
    const gateway: ChatGateway = {
      async createChatCompletion() {
        return {
          model: "fake-model",
          content: JSON.stringify({
            tool: "create_category",
            arguments: {
              name: "Housing",
            },
          }),
        };
      },
    };
    const orchestrator = createChatOrchestrator({
      gateway,
      categoryTools: {
        createCategory: async () => {
          throw new Error("createCategory should not run without a kind");
        },
        updateCategory: async () => ({ response: "unused", toolCalls: [] }),
        deleteCategory: async () => ({ response: "unused", toolCalls: [] }),
        queryCategories: async () => ({ response: "unused", toolCalls: [] }),
      },
      now: () => new Date("2026-07-20T00:00:00.000Z"),
    });

    const response = await orchestrator.handleChat({
      userId: "00000000-0000-4000-8000-000000000001",
      message: "Create new category Housing.",
    });

    expect(response.ok).toBe(true);
    expect(response.data?.response).toBe(
      "Should Housing be an expense, income, or savings category?",
    );
    expect(response.data?.toolCalls).toBeUndefined();
  });

  it("executes flat query_transactions arguments instead of returning raw JSON", async () => {
    const gateway: ChatGateway = {
      async createChatCompletion() {
        return {
          model: "fake-model",
          content: JSON.stringify({
            tool: "query_transactions",
            arguments: {
              start_date: "2026-07-01",
              end_date: "2026-07-31",
              type: "expense",
            },
          }),
        };
      },
    };
    const orchestrator = createChatOrchestrator({
      gateway,
      queryTransactionsTool: async ({ input }) => ({
        response:
          "Found 2 expense, 2026-07-01 to 2026-07-31 totaling NPR 6,594.00:\n- Lunch — NPR 2,394.00\n- Groceries — NPR 4,200.00",
        toolCalls: [
          {
            name: "query_transactions",
            label: "Transactions queried",
            status: "success",
            input: input as unknown as Record<string, unknown>,
          },
        ],
      }),
      now: () => new Date("2026-07-20T00:00:00.000Z"),
    });

    const response = await orchestrator.handleChat({
      userId: "00000000-0000-4000-8000-000000000001",
      message: "show all the expense of this month",
    });

    expect(response.ok).toBe(true);
    expect(response.data?.response).toContain("Found 2 expense");
    expect(response.data?.response).not.toContain('"tool"');
    expect(response.data?.toolCalls?.[0]).toMatchObject({
      name: "query_transactions",
      input: {
        aggregate: "list",
        filters: {
          type: "expense",
          date_start: "2026-07-01",
          date_end: "2026-07-31",
        },
      },
    });
  });

  it("renders clarify tool arguments as assistant text instead of raw JSON", async () => {
    const gateway: ChatGateway = {
      async createChatCompletion() {
        return {
          model: "fake-model",
          content: JSON.stringify({
            tool: "clarify",
            arguments: {
              question:
                "I need a few details to log this expense:\n1. Exact date?\n2. Category?",
              suggestions: ["Mon 13 Jul", "Tue 14 Jul"],
            },
          }),
        };
      },
    };
    const orchestrator = createChatOrchestrator({
      gateway,
      now: () => new Date("2026-07-20T00:00:00.000Z"),
    });

    const response = await orchestrator.handleChat({
      userId: "00000000-0000-4000-8000-000000000001",
      message: "I bought a headphone last week",
    });

    expect(response.ok).toBe(true);
    expect(response.data?.response).toContain(
      "I need a few details to log this expense",
    );
    expect(response.data?.response).toContain("Mon 13 Jul");
    expect(response.data?.response).not.toContain('"tool"');
    expect(response.data?.toolCalls?.[0]).toMatchObject({
      name: "clarify",
      label: "Clarification requested",
      status: "success",
      input: {
        question:
          "I need a few details to log this expense:\n1. Exact date?\n2. Category?",
        suggestions: ["Mon 13 Jul", "Tue 14 Jul"],
      },
    });
  });

  it("normalizes clarify options as suggestions", async () => {
    const gateway: ChatGateway = {
      async createChatCompletion() {
        return {
          model: "fake-model",
          content: JSON.stringify({
            tool: "clarify",
            arguments: {
              question: "Which category type should Housing use?",
              options: ["expense", "income", "savings"],
            },
          }),
        };
      },
    };
    const orchestrator = createChatOrchestrator({
      gateway,
      now: () => new Date("2026-07-20T00:00:00.000Z"),
    });

    const response = await orchestrator.handleChat({
      userId: "00000000-0000-4000-8000-000000000001",
      message: "Create new category Housing",
    });

    expect(response.ok).toBe(true);
    expect(response.data?.response).toContain(
      "Which category type should Housing use?",
    );
    expect(response.data?.response).toContain("expense, income, savings");
    expect(response.data?.toolCalls?.[0]?.input).toMatchObject({
      suggestions: ["expense", "income", "savings"],
    });
  });

  it("returns a friendly fallback when the provider is temporarily unavailable", async () => {
    const gateway: ChatGateway = {
      async createChatCompletion() {
        throw new LlmGatewayError(
          "LLM request failed with status 503: ResourceExhausted",
          "provider_unavailable",
          503,
        );
      },
    };
    const orchestrator = createChatOrchestrator({
      gateway,
      now: () => new Date("2026-07-20T00:00:00.000Z"),
    });

    const response = await orchestrator.handleChat({
      userId: "00000000-0000-4000-8000-000000000777",
      conversationId: "00000000-0000-4000-8000-000000000777",
      message: "How much did I spend today?",
    });

    expect(response.ok).toBe(true);
    expect(response.data?.model).toBe("provider-unavailable");
    expect(response.data?.response).toContain(
      "AI provider is temporarily at capacity",
    );
  });
});
