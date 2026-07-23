import { z } from "zod";
import { env } from "../config/env.js";

export type LlmRole = "system" | "user" | "assistant" | "tool";

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmGatewayConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  enableThinking: boolean;
  reasoningBudget: number;
  providerRetryAttempts: number;
}

export interface LlmChatCompletionRequest {
  messages: LlmMessage[];
  signal?: AbortSignal;
}

export interface LlmChatCompletionResponse {
  content: string;
  model: string;
}

export interface LlmFetchResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

export type LlmFetch = (
  url: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<LlmFetchResponse>;

export type LlmGatewayErrorCode =
  | "missing_api_key"
  | "provider_unavailable"
  | "request_failed"
  | "invalid_response";

export class LlmGatewayError extends Error {
  constructor(
    message: string,
    readonly code: LlmGatewayErrorCode,
    readonly status?: number,
  ) {
    super(message);
  }
}

const completionSchema = z
  .object({
    model: z.string().optional(),
    choices: z
      .array(
        z
          .object({
            message: z
              .object({
                content: z.string().nullable().optional(),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();

const defaultFetch: LlmFetch = async (url, init) => fetch(url, init);

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const sanitizeResponseText = (value: string) => value.slice(0, 600);

const isProviderUnavailable = (status: number, responseText: string) =>
  status === 429 ||
  status === 503 ||
  /resourceexhausted|rate.?limit|quota|temporarily unavailable/i.test(
    responseText,
  );

export const configFromEnv = (): LlmGatewayConfig => ({
  baseUrl: env.LLM_BASE_URL,
  model: env.LLM_MODEL,
  temperature: env.LLM_TEMPERATURE,
  topP: env.LLM_TOP_P,
  maxTokens: env.LLM_MAX_TOKENS,
  enableThinking: env.LLM_ENABLE_THINKING,
  reasoningBudget: env.LLM_REASONING_BUDGET,
  providerRetryAttempts: env.LLM_PROVIDER_RETRY_ATTEMPTS,
  ...(env.LLM_API_KEY ? { apiKey: env.LLM_API_KEY } : {}),
});

export const createLlmGateway = (
  config: LlmGatewayConfig = configFromEnv(),
  fetchImpl: LlmFetch = defaultFetch,
) => ({
  async createChatCompletion(
    request: LlmChatCompletionRequest,
  ): Promise<LlmChatCompletionResponse> {
    if (!config.apiKey) {
      throw new LlmGatewayError(
        "LLM_API_KEY is required before chat completions can be requested",
        "missing_api_key",
      );
    }

    const body = {
      model: config.model,
      messages: request.messages,
      temperature: config.temperature,
      top_p: config.topP,
      max_tokens: config.maxTokens,
      stream: false,
      ...(config.enableThinking
        ? {
            chat_template_kwargs: {
              enable_thinking: true,
            },
            reasoning_budget: config.reasoningBudget,
          }
        : {}),
    };

    let response = await fetchImpl(
      `${trimTrailingSlash(config.baseUrl)}/chat/completions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        ...(request.signal ? { signal: request.signal } : {}),
      },
    );

    if (!response.ok) {
      const responseText = sanitizeResponseText(await response.text());
      const shouldRetry =
        config.providerRetryAttempts > 0 &&
        isProviderUnavailable(response.status, responseText);

      if (shouldRetry) {
        response = await fetchImpl(
          `${trimTrailingSlash(config.baseUrl)}/chat/completions`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${config.apiKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              ...body,
              max_tokens: Math.min(config.maxTokens, 2048),
              ...(config.enableThinking
                ? { reasoning_budget: Math.min(config.reasoningBudget, 1024) }
                : {}),
            }),
            ...(request.signal ? { signal: request.signal } : {}),
          },
        );

        if (response.ok) {
          const parsed = completionSchema.safeParse(await response.json());

          if (!parsed.success) {
            throw new LlmGatewayError(
              "LLM response did not match the expected chat completion shape",
              "invalid_response",
            );
          }

          const content = parsed.data.choices[0]?.message.content;

          if (!content) {
            throw new LlmGatewayError(
              "LLM response did not include assistant content",
              "invalid_response",
            );
          }

          return {
            content,
            model: parsed.data.model ?? config.model,
          };
        }
      }

      throw new LlmGatewayError(
        `LLM request failed with status ${response.status}: ${responseText}`,
        isProviderUnavailable(response.status, responseText)
          ? "provider_unavailable"
          : "request_failed",
        response.status,
      );
    }

    const parsed = completionSchema.safeParse(await response.json());

    if (!parsed.success) {
      throw new LlmGatewayError(
        "LLM response did not match the expected chat completion shape",
        "invalid_response",
      );
    }

    const content = parsed.data.choices[0]?.message.content;

    if (!content) {
      throw new LlmGatewayError(
        "LLM response did not include assistant content",
        "invalid_response",
      );
    }

    return {
      content,
      model: parsed.data.model ?? config.model,
    };
  },
});
