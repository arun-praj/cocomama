import { describe, expect, it } from "vitest";
import {
  createLlmGateway,
  LlmGatewayError,
  type LlmFetch,
} from "../src/services/llm-gateway.js";

describe("llm gateway", () => {
  it("sends NVIDIA-compatible OpenAI chat completion requests", async () => {
    const requests: Array<{
      url: string;
      body: Record<string, unknown>;
      headers: Record<string, string>;
    }> = [];
    const fetchImpl: LlmFetch = async (url, init) => {
      requests.push({
        url,
        body: JSON.parse(init.body) as Record<string, unknown>,
        headers: init.headers,
      });

      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: "nvidia/nemotron-3-ultra-550b-a55b",
          choices: [
            {
              message: {
                content: "Hello from NVIDIA",
              },
            },
          ],
        }),
        text: async () => "",
      };
    };

    const gateway = createLlmGateway(
      {
        baseUrl: "https://integrate.api.nvidia.com/v1/",
        apiKey: "test-key",
        model: "nvidia/nemotron-3-ultra-550b-a55b",
        temperature: 1,
        topP: 0.95,
        maxTokens: 16384,
        enableThinking: true,
        reasoningBudget: 16384,
      },
      fetchImpl,
    );

    const completion = await gateway.createChatCompletion({
      messages: [{ role: "user", content: "hi" }],
    });

    expect(completion.content).toBe("Hello from NVIDIA");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(
      "https://integrate.api.nvidia.com/v1/chat/completions",
    );
    expect(requests[0]?.headers.authorization).toBe("Bearer test-key");
    expect(requests[0]?.body).toMatchObject({
      model: "nvidia/nemotron-3-ultra-550b-a55b",
      temperature: 1,
      top_p: 0.95,
      max_tokens: 16384,
      stream: false,
      chat_template_kwargs: {
        enable_thinking: true,
      },
      reasoning_budget: 16384,
    });
  });

  it("forwards abort signals to provider fetch", async () => {
    const abortController = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    const fetchImpl: LlmFetch = async (_url, init) => {
      receivedSignal = init.signal;

      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: "OK",
              },
            },
          ],
        }),
        text: async () => "",
      };
    };
    const gateway = createLlmGateway(
      {
        baseUrl: "https://integrate.api.nvidia.com/v1/",
        apiKey: "test-key",
        model: "nvidia/nemotron-3-ultra-550b-a55b",
        temperature: 1,
        topP: 0.95,
        maxTokens: 16384,
        enableThinking: false,
        reasoningBudget: 0,
      },
      fetchImpl,
    );

    await gateway.createChatCompletion({
      messages: [{ role: "user", content: "hi" }],
      signal: abortController.signal,
    });

    expect(receivedSignal).toBe(abortController.signal);
  });

  it("fails before network calls when the API key is missing", async () => {
    const gateway = createLlmGateway({
      baseUrl: "https://integrate.api.nvidia.com/v1",
      model: "nvidia/nemotron-3-ultra-550b-a55b",
      temperature: 1,
      topP: 0.95,
      maxTokens: 16384,
      enableThinking: true,
      reasoningBudget: 16384,
    });

    await expect(
      gateway.createChatCompletion({
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toThrow("LLM_API_KEY is required");
  });

  it("classifies resource exhaustion as provider unavailable", async () => {
    const fetchImpl: LlmFetch = async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
      text: async () =>
        '{"error":{"message":"ResourceExhausted: Worker local total request limit reached"}}',
    });
    const gateway = createLlmGateway(
      {
        baseUrl: "https://integrate.api.nvidia.com/v1",
        apiKey: "test-key",
        model: "nvidia/nemotron-3-ultra-550b-a55b",
        temperature: 1,
        topP: 0.95,
        maxTokens: 16384,
        enableThinking: true,
        reasoningBudget: 16384,
      },
      fetchImpl,
    );

    await expect(
      gateway.createChatCompletion({
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toMatchObject({
      code: "provider_unavailable",
      status: 503,
    } satisfies Partial<LlmGatewayError>);
  });
});
