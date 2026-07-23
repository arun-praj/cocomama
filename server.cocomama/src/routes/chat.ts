import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  getAuthenticatedSession,
  getAuthenticatedUserId,
  requireAuth,
} from "../plugins/auth.js";
import {
  getChatSession,
  getChatSessionMessagesForAi,
  listChatSessions,
  saveChatExchange,
} from "../services/chat-history-service.js";
import { handleChat } from "../services/chat-orchestrator.js";

const chatRequestSchema = z
  .object({
    message: z.string().min(1),
    conversationId: z.string().min(1).optional(),
  })
  .strict();

const optionalString = (value: unknown) =>
  typeof value === "string" ? value : undefined;

const createSessionTitle = (messageText: string) => {
  const normalizedMessage = messageText.replace(/\s+/g, " ").trim();

  if (normalizedMessage.length <= 48) {
    return normalizedMessage || "New chat";
  }

  return `${normalizedMessage.slice(0, 45)}...`;
};

export const chatRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/api/chat/sessions",
    {
      preHandler: requireAuth,
    },
    async (request) => ({
      ok: true,
      data: {
        sessions: await listChatSessions(getAuthenticatedUserId(request)),
      },
    }),
  );

  app.get(
    "/api/chat/sessions/:sessionId",
    {
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const params = request.params as { sessionId?: string };
      const sessionId = params.sessionId;

      if (!sessionId) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "validation_error",
            message: "Missing chat session id",
          },
        });
      }

      const session = await getChatSession({
        userId: getAuthenticatedUserId(request),
        sessionId,
      });

      if (!session) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: "chat_session_not_found",
            message: "Chat session was not found",
          },
        });
      }

      return {
        ok: true,
        data: {
          session,
        },
      };
    },
  );

  app.post(
    "/api/chat",
    {
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const parsed = chatRequestSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "validation_error",
            message: "Invalid chat request",
            details: parsed.error.flatten(),
          },
        });
      }

      const session = getAuthenticatedSession(request);
      const currency = optionalString(session.user.currency);
      const timezone = optionalString(session.user.timezone);
      const userId = getAuthenticatedUserId(request);
      const history = parsed.data.conversationId
        ? await getChatSessionMessagesForAi({
            userId,
            sessionId: parsed.data.conversationId,
          })
        : undefined;

      if (parsed.data.conversationId && !history) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: "chat_session_not_found",
            message: "Chat session was not found",
          },
        });
      }

      const abortController = new AbortController();
      let isReplyComplete = false;
      const abortChat = () => {
        if (!abortController.signal.aborted) {
          abortController.abort();
        }
      };
      const abortOnReplyClose = () => {
        if (!isReplyComplete) {
          abortChat();
        }
      };

      request.raw.once("aborted", abortChat);
      reply.raw.once("close", abortOnReplyClose);

      const result = await handleChat({
        userId,
        user: {
          id: userId,
          email: session.user.email,
          name: session.user.name,
          ...(currency ? { currency } : {}),
          ...(timezone ? { timezone } : {}),
        },
        message: parsed.data.message,
        ...(history ? { history } : {}),
        ...(parsed.data.conversationId
          ? { conversationId: parsed.data.conversationId }
          : {}),
        signal: abortController.signal,
      });

      request.raw.removeListener("aborted", abortChat);
      reply.raw.removeListener("close", abortOnReplyClose);

      if (abortController.signal.aborted) {
        isReplyComplete = true;

        return reply.code(499).send({
          ok: false,
          error: {
            code: "chat_cancelled",
            message: "Chat request was cancelled",
          },
        });
      }

      if (result.ok && result.data) {
        const title = createSessionTitle(parsed.data.message);
        const sessionSummary = await saveChatExchange({
          userId,
          sessionId: result.data.conversationId,
          title,
          userMessage: {
            id: crypto.randomUUID(),
            role: "user",
            content: parsed.data.message,
          },
          assistantMessage: {
            id: crypto.randomUUID(),
            role: "assistant",
            content: result.data.response,
            ...(result.data.toolCalls
              ? { toolCalls: result.data.toolCalls }
              : {}),
          },
        });

        isReplyComplete = true;

        return reply.code(200).send({
          ...result,
          data: {
            ...result.data,
            session: sessionSummary,
          },
        });
      }

      isReplyComplete = true;

      return reply.code(result.ok ? 200 : 502).send(result);
    },
  );
};
