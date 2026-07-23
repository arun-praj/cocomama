import { describe, expect, it } from "vitest";
import {
  createChatOrchestrator,
  type ChatGateway,
  type QueryUserExecutor,
  type QueryTransactionsExecutor,
} from "../src/services/chat-orchestrator.js";
import type {
  QueryTransactionsInput,
  QueryUserInput,
} from "../src/tools/types.js";

type QueryCase = {
  name: string;
  userMessage: string;
  modelPayload: unknown;
  expectedInputs: QueryTransactionsInput[];
  responseText: string;
};

const userId = "00000000-0000-4000-8000-000000000101";

const queryCases: QueryCase[] = [
  {
    name: "lists all expenses this month from flat date arguments",
    userMessage: "Show all the expenses of this month",
    modelPayload: {
      tool: "query_transactions",
      arguments: {
        start_date: "2026-07-01",
        end_date: "2026-07-31",
        type: "expense",
      },
    },
    expectedInputs: [
      {
        filters: {
          type: "expense",
          date_start: "2026-07-01",
          date_end: "2026-07-31",
        },
        aggregate: "list",
      },
    ],
    responseText: "Found 3 expense records for July.",
  },
  {
    name: "sums grocery spending this month",
    userMessage: "How much did I spend on groceries this month?",
    modelPayload: {
      tool: "query_transactions",
      arguments: {
        type: "expense",
        category: "groceries",
        start_date: "2026-07-01",
        end_date: "2026-07-31",
        aggregate: "sum",
      },
    },
    expectedInputs: [
      {
        filters: {
          type: "expense",
          category: "groceries",
          date_start: "2026-07-01",
          date_end: "2026-07-31",
        },
        aggregate: "sum",
      },
    ],
    responseText: "Total grocery expense this month is NPR 8,400.",
  },
  {
    name: "lists high-value grocery expenses using strict filters object",
    userMessage: "List grocery expenses above NPR 1000 this month",
    modelPayload: {
      tool: "query_transactions",
      arguments: {
        filters: {
          type: "expense",
          category: "groceries",
          amount_min: 1000,
          date_start: "2026-07-01",
          date_end: "2026-07-31",
        },
        aggregate: "list",
        sort: "amount_desc",
      },
    },
    expectedInputs: [
      {
        filters: {
          type: "expense",
          category: "groceries",
          amount_min: 1000,
          date_start: "2026-07-01",
          date_end: "2026-07-31",
        },
        aggregate: "list",
        sort: "amount_desc",
      },
    ],
    responseText: "Found grocery expenses above NPR 1000.",
  },
  {
    name: "averages transport spending in July",
    userMessage: "What is my average transport expense in July?",
    modelPayload: {
      tool: "query_transactions",
      arguments: {
        type: "expense",
        category: "transport",
        start_date: "2026-07-01",
        end_date: "2026-07-31",
        aggregate: "avg",
      },
    },
    expectedInputs: [
      {
        filters: {
          type: "expense",
          category: "transport",
          date_start: "2026-07-01",
          date_end: "2026-07-31",
        },
        aggregate: "avg",
      },
    ],
    responseText: "Average transport expense in July is NPR 350.",
  },
  {
    name: "lists income received this month",
    userMessage: "Show my income this month",
    modelPayload: {
      tool: "query_transactions",
      arguments: {
        type: "income",
        start_date: "2026-07-01",
        end_date: "2026-07-31",
      },
    },
    expectedInputs: [
      {
        filters: {
          type: "income",
          date_start: "2026-07-01",
          date_end: "2026-07-31",
        },
        aggregate: "list",
      },
    ],
    responseText: "Found income received this month.",
  },
  {
    name: "calculates net money movement this month",
    userMessage: "What is my net money movement this month?",
    modelPayload: {
      tool: "query_transactions",
      arguments: {
        start_date: "2026-07-01",
        end_date: "2026-07-31",
        aggregate: "net",
      },
    },
    expectedInputs: [
      {
        filters: {
          date_start: "2026-07-01",
          date_end: "2026-07-31",
        },
        aggregate: "net",
      },
    ],
    responseText: "Net movement this month is NPR 42,000.",
  },
  {
    name: "plans compound net list and count transaction query",
    userMessage:
      "What is my net money movement this month, list income records, and count my savings transactions?",
    modelPayload: {
      tool: "query_transactions",
      arguments: {
        aggregate: "list",
      },
    },
    expectedInputs: [
      {
        filters: {
          date_start: "2026-07-01",
          date_end: "2026-07-31",
        },
        aggregate: "net",
      },
      {
        filters: {
          type: "income",
          date_start: "2026-07-01",
          date_end: "2026-07-31",
        },
        aggregate: "list",
      },
      {
        filters: {
          type: "savings",
          date_start: "2026-07-01",
          date_end: "2026-07-31",
        },
        aggregate: "count",
      },
    ],
    responseText:
      "Net movement this month is NPR 42,000.\n\nFound income received this month.\n\nFound 3 savings transactions.",
  },
  {
    name: "corrects explicit all-list tool calls for net list and count intents",
    userMessage:
      "What is my net money movement this month, list income records, and count my savings transactions?",
    modelPayload: {
      tool_calls: [
        {
          tool: "query_transactions",
          arguments: {
            aggregate: "list",
          },
        },
        {
          tool: "query_transactions",
          arguments: {
            type: "income",
            aggregate: "list",
          },
        },
        {
          tool: "query_transactions",
          arguments: {
            type: "savings",
            aggregate: "list",
          },
        },
      ],
    },
    expectedInputs: [
      {
        filters: {
          date_start: "2026-07-01",
          date_end: "2026-07-31",
        },
        aggregate: "net",
      },
      {
        filters: {
          type: "income",
          date_start: "2026-07-01",
          date_end: "2026-07-31",
        },
        aggregate: "list",
      },
      {
        filters: {
          type: "savings",
          date_start: "2026-07-01",
          date_end: "2026-07-31",
        },
        aggregate: "count",
      },
    ],
    responseText:
      "Net movement this month is NPR 42,000.\n\nFound income received this month.\n\nFound 3 savings transactions.",
  },
  {
    name: "runs chained total and category leader queries for June",
    userMessage:
      "How much did I spend in June and which category takes the lead?",
    modelPayload: {
      tool_calls: [
        {
          tool: "query_transactions",
          arguments: {
            type: "expense",
            start_date: "2026-06-01",
            end_date: "2026-06-30",
            aggregate: "sum",
          },
        },
        {
          tool: "query_transactions",
          arguments: {
            type: "expense",
            start_date: "2026-06-01",
            end_date: "2026-06-30",
            aggregate: "sum",
            group_by: "category",
            sort: "amount_desc",
            limit: 1,
          },
        },
      ],
    },
    expectedInputs: [
      {
        filters: {
          type: "expense",
          date_start: "2026-06-01",
          date_end: "2026-06-30",
        },
        aggregate: "sum",
      },
      {
        filters: {
          type: "expense",
          date_start: "2026-06-01",
          date_end: "2026-06-30",
        },
        aggregate: "sum",
        group_by: "category",
        sort: "amount_desc",
        limit: 1,
      },
    ],
    responseText:
      "You spent NPR 200 in June.\n\nFood was the leading category at NPR 120.",
  },
  {
    name: "preserves explicit dated aggregate calls when intent signatures match",
    userMessage:
      "How much did I spend in June and which category takes the lead?",
    modelPayload: {
      tool_calls: [
        {
          tool: "query_transactions",
          arguments: {
            type: "expense",
            start_date: "2026-06-01",
            end_date: "2026-06-30",
            aggregate: "sum",
          },
        },
        {
          tool: "query_transactions",
          arguments: {
            type: "expense",
            start_date: "2026-06-01",
            end_date: "2026-06-30",
            aggregate: "sum",
            group_by: "category",
            sort: "amount_desc",
            limit: 1,
          },
        },
      ],
    },
    expectedInputs: [
      {
        filters: {
          type: "expense",
          date_start: "2026-06-01",
          date_end: "2026-06-30",
        },
        aggregate: "sum",
      },
      {
        filters: {
          type: "expense",
          date_start: "2026-06-01",
          date_end: "2026-06-30",
        },
        aggregate: "sum",
        group_by: "category",
        sort: "amount_desc",
        limit: 1,
      },
    ],
    responseText:
      "You spent NPR 200 in June.\n\nFood was the leading category at NPR 120.",
  },
  {
    name: "expands multiple categories into separate query calls",
    userMessage: "How much did I spend on food and entertainment?",
    modelPayload: {
      tool: "query_transactions",
      arguments: {
        type: "expense",
        categories: ["food", "entertainment"],
        aggregate: "sum",
      },
    },
    expectedInputs: [
      {
        filters: {
          type: "expense",
          category: "food",
        },
        aggregate: "sum",
      },
      {
        filters: {
          type: "expense",
          category: "entertainment",
        },
        aggregate: "sum",
      },
    ],
    responseText:
      "Food spending was NPR 200.\n\nEntertainment spending was NPR 500.",
  },
  {
    name: "expands collapsed compound total leader and top expenses query",
    userMessage:
      "How much did I spend this month, which category took the lead, and show the three biggest expenses?",
    modelPayload: {
      tool: "query_transactions",
      arguments: {
        type: "expense",
        start_date: "2026-07-01",
        end_date: "2026-07-31",
        aggregate: "list",
      },
    },
    expectedInputs: [
      {
        filters: {
          type: "expense",
          date_start: "2026-07-01",
          date_end: "2026-07-31",
        },
        aggregate: "sum",
      },
      {
        filters: {
          type: "expense",
          date_start: "2026-07-01",
          date_end: "2026-07-31",
        },
        aggregate: "sum",
        group_by: "category",
        sort: "amount_desc",
        limit: 1,
      },
      {
        filters: {
          type: "expense",
          date_start: "2026-07-01",
          date_end: "2026-07-31",
        },
        aggregate: "list",
        sort: "amount_desc",
        limit: 3,
      },
    ],
    responseText:
      "Total expense this month is NPR 12,000.\n\nFood leads at NPR 5,000.\n\nTop expenses listed.",
  },
  {
    name: "keeps amount filters when listing and grouping the same results",
    userMessage:
      "Show all expenses above NPR 1000 this month, then group the same results by merchant.",
    modelPayload: {
      tool: "query_transactions",
      arguments: {
        type: "expense",
        aggregate: "list",
      },
    },
    expectedInputs: [
      {
        filters: {
          type: "expense",
          date_start: "2026-07-01",
          date_end: "2026-07-31",
          amount_min: 1000,
        },
        aggregate: "list",
      },
      {
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
    ],
    responseText:
      "Filtered expenses over NPR 1000.\n\nMerchant totals for expenses over NPR 1000.",
  },
  {
    name: "enriches explicit list and grouped tool calls with the same filters",
    userMessage:
      "Show all expenses above NPR 1000 this month, then group the same results by merchant.",
    modelPayload: {
      tool_calls: [
        {
          tool: "query_transactions",
          arguments: {
            type: "expense",
            aggregate: "list",
          },
        },
        {
          tool: "query_transactions",
          arguments: {
            type: "expense",
            aggregate: "sum",
            group_by: "merchant",
            sort: "amount_desc",
          },
        },
      ],
    },
    expectedInputs: [
      {
        filters: {
          type: "expense",
          date_start: "2026-07-01",
          date_end: "2026-07-31",
          amount_min: 1000,
        },
        aggregate: "list",
      },
      {
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
    ],
    responseText:
      "Filtered expenses over NPR 1000.\n\nMerchant totals for expenses over NPR 1000.",
  },
  {
    name: "keeps between amount filters when listing and grouping the same results",
    userMessage:
      "Show expenses between NPR 500 and NPR 2500 this month, then group the same results by category.",
    modelPayload: {
      tool: "query_transactions",
      arguments: {
        type: "expense",
        aggregate: "list",
      },
    },
    expectedInputs: [
      {
        filters: {
          type: "expense",
          date_start: "2026-07-01",
          date_end: "2026-07-31",
          amount_min: 500,
          amount_max: 2500,
        },
        aggregate: "list",
      },
      {
        filters: {
          type: "expense",
          date_start: "2026-07-01",
          date_end: "2026-07-31",
          amount_min: 500,
          amount_max: 2500,
        },
        aggregate: "sum",
        group_by: "category",
        sort: "amount_desc",
      },
    ],
    responseText:
      "Filtered expenses between NPR 500 and NPR 2500.\n\nCategory totals for the same range.",
  },
  {
    name: "enriches explicit between list and grouped tool calls with the same filters",
    userMessage:
      "Show expenses between NPR 500 and NPR 2500 this month, then group the same results by category.",
    modelPayload: {
      tool_calls: [
        {
          tool: "query_transactions",
          arguments: {
            type: "expense",
            aggregate: "list",
          },
        },
        {
          tool: "query_transactions",
          arguments: {
            type: "expense",
            aggregate: "sum",
            group_by: "category",
            sort: "amount_desc",
          },
        },
      ],
    },
    expectedInputs: [
      {
        filters: {
          type: "expense",
          date_start: "2026-07-01",
          date_end: "2026-07-31",
          amount_min: 500,
          amount_max: 2500,
        },
        aggregate: "list",
      },
      {
        filters: {
          type: "expense",
          date_start: "2026-07-01",
          date_end: "2026-07-31",
          amount_min: 500,
          amount_max: 2500,
        },
        aggregate: "sum",
        group_by: "category",
        sort: "amount_desc",
      },
    ],
    responseText:
      "Filtered expenses between NPR 500 and NPR 2500.\n\nCategory totals for the same range.",
  },
  {
    name: "infers exact amount filters from equal wording",
    userMessage: "Show expenses equal to NPR 1,000 this month",
    modelPayload: {
      tool: "query_transactions",
      arguments: {
        type: "expense",
        aggregate: "list",
      },
    },
    expectedInputs: [
      {
        filters: {
          type: "expense",
          date_start: "2026-07-01",
          date_end: "2026-07-31",
          amount_min: 1000,
          amount_max: 1000,
        },
        aggregate: "list",
      },
    ],
    responseText: "Found expenses equal to NPR 1000.",
  },
];

describe("NLP query tool regressions", () => {
  it.each(queryCases)(
    "$name",
    async ({ userMessage, modelPayload, expectedInputs, responseText }) => {
      const queryInputs: QueryTransactionsInput[] = [];
      const gateway: ChatGateway = {
        async createChatCompletion() {
          return {
            model: "fake-model",
            content: JSON.stringify(modelPayload),
          };
        },
      };
      const queryTransactionsTool: QueryTransactionsExecutor = async ({
        input,
      }) => {
        queryInputs.push(input);
        const responseIndex = queryInputs.length - 1;
        const responseParts = responseText.split("\n\n");

        return {
          response: responseParts[responseIndex] ?? responseText,
          toolCalls: [
            {
              name: "query_transactions",
              label: "Transactions queried",
              status: "success",
              input: input as unknown as Record<string, unknown>,
            },
          ],
        };
      };
      const orchestrator = createChatOrchestrator({
        gateway,
        queryTransactionsTool,
        now: () => new Date("2026-07-20T00:00:00.000Z"),
      });

      const response = await orchestrator.handleChat({
        userId,
        message: userMessage,
      });

      expect(response.ok).toBe(true);
      expect(response.data?.response).toBe(responseText);
      expect(response.data?.response).not.toContain('"tool"');
      expect(queryInputs).toEqual(expectedInputs);
      expect(response.data?.toolCalls).toHaveLength(expectedInputs.length);
      expect(response.data?.toolCalls?.[0]).toMatchObject({
        name: "query_transactions",
        status: "success",
        input: expectedInputs[0] as unknown as Record<string, unknown>,
      });
    },
  );

  it("answers available money through query_user", async () => {
    const queryUserInputs: QueryUserInput[] = [];
    const gateway: ChatGateway = {
      async createChatCompletion() {
        return {
          model: "fake-model",
          content: JSON.stringify({
            tool: "query_user",
            arguments: {
              field: "balance",
            },
          }),
        };
      },
    };
    const queryUserTool: QueryUserExecutor = async ({ input }) => {
      queryUserInputs.push(input);

      return {
        response:
          "You have NPR 12,000.00 available to spend.\nYou have NPR 5,000.00 saved.",
        toolCalls: [
          {
            name: "query_user",
            label: "User info queried",
            status: "success",
            input: input as unknown as Record<string, unknown>,
          },
        ],
      };
    };
    const orchestrator = createChatOrchestrator({
      gateway,
      queryUserTool,
      now: () => new Date("2026-07-20T00:00:00.000Z"),
    });

    const response = await orchestrator.handleChat({
      userId,
      message: "How much money do I have?",
    });

    expect(response.ok).toBe(true);
    expect(response.data?.response).toContain("available to spend");
    expect(response.data?.response).not.toContain('"tool"');
    expect(queryUserInputs).toEqual([{ fields: ["balance"] }]);
    expect(response.data?.toolCalls?.[0]).toMatchObject({
      name: "query_user",
      status: "success",
      input: { fields: ["balance"] },
    });
  });

  it("defaults query_user to balance when no fields are provided", async () => {
    const queryUserInputs: QueryUserInput[] = [];
    const gateway: ChatGateway = {
      async createChatCompletion() {
        return {
          model: "fake-model",
          content: JSON.stringify({
            tool: "query_user",
            arguments: {},
          }),
        };
      },
    };
    const queryUserTool: QueryUserExecutor = async ({ input }) => {
      queryUserInputs.push(input);

      return {
        response: "You have NPR 12,000.00 available to spend.",
        toolCalls: [
          {
            name: "query_user",
            label: "User info queried",
            status: "success",
            input: input as unknown as Record<string, unknown>,
          },
        ],
      };
    };
    const orchestrator = createChatOrchestrator({
      gateway,
      queryUserTool,
      now: () => new Date("2026-07-20T00:00:00.000Z"),
    });

    const response = await orchestrator.handleChat({
      userId,
      message: "How much money do I have?",
    });

    expect(response.ok).toBe(true);
    expect(response.data?.response).toContain("available to spend");
    expect(queryUserInputs).toEqual([{}]);
  });
});
