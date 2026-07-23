import { describe, expect, it } from "vitest";
import {
  createChatOrchestrator,
  type BudgetToolExecutor,
  type ChatGateway,
} from "../src/services/chat-orchestrator.js";
import type { CreateBudgetInput } from "../src/tools/types.js";

describe("budget orchestration", () => {
  it("normalizes a real-world budget request with monthly reminders", async () => {
    let capturedInput: CreateBudgetInput | null = null;
    const gateway: ChatGateway = {
      async createChatCompletion() {
        return {
          model: "fake-model",
          content: JSON.stringify({
            tool: "create_budget",
            arguments: {
              name: "Headphone",
            },
          }),
        };
      },
    };
    const budgetTools: BudgetToolExecutor = {
      async createBudget({ input }) {
        capturedInput = input;

        return {
          response: "Budget created",
          toolCalls: [
            {
              name: "create_budget",
              label: "Budget created",
              status: "success",
              input: input as unknown as Record<string, unknown>,
            },
          ],
        };
      },
      async allocateToBudget() {
        throw new Error("Unexpected allocateToBudget call");
      },
      async queryBudgets() {
        throw new Error("Unexpected queryBudgets call");
      },
      async updateBudget() {
        throw new Error("Unexpected updateBudget call");
      },
      async deleteBudget() {
        throw new Error("Unexpected deleteBudget call");
      },
    };
    const orchestrator = createChatOrchestrator({
      gateway,
      budgetTools,
      now: () => new Date("2026-07-01T00:00:00.000Z"),
    });

    const response = await orchestrator.handleChat({
      userId: "00000000-0000-4000-8000-000000000777",
      message:
        "Hey I want to buy a headphone, create a budget of Rs 20000. I want to allocate RS 2000 per month to this budget. I want you to remind me every 15th of each month until the budget is paid off.",
    });

    expect(response.ok).toBe(true);
    expect(capturedInput).toEqual({
      name: "Headphone",
      target_amount: 20000,
      recurring_contribution: 2000,
      contribution_cadence: "monthly",
      notification: {
        cadence: "monthly",
        day_of_month: 15,
        until_paid_off: true,
      },
    });
  });
});
