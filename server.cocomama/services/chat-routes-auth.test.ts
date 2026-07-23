import { beforeEach, describe, expect, it, vi } from "vitest";

const userOneId = "00000000-0000-4000-8000-000000000001";
const userTwoId = "00000000-0000-4000-8000-000000000002";
let activeUserId: string | null = userOneId;
let persistedUserIds = new Set([userOneId, userTwoId]);
let shouldThrowAuthSession = false;

vi.mock("../src/db/client.js", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () =>
            activeUserId && persistedUserIds.has(activeUserId)
              ? [{ id: activeUserId }]
              : [],
          ),
        })),
      })),
    })),
  },
}));

vi.mock("../src/auth.js", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => {
        if (shouldThrowAuthSession) {
          throw new Error("Failed to get session");
        }

        return activeUserId
          ? {
              user: {
                id: activeUserId,
                email: `${activeUserId}@example.test`,
                name: "Test User",
                currency: "NPR",
                timezone: "Asia/Kathmandu",
              },
            }
          : null;
      }),
    },
  },
}));

const userSessions = new Map<
  string,
  Array<{
    id: string;
    title: string;
    titleStatus: "fallback";
    titleModel: null;
    messageCount: number;
    lastMessageAt: string;
    createdAt: string;
    updatedAt: string;
    messages: Array<{
      id: string;
      role: "assistant" | "user";
      content: string;
    }>;
  }>
>();

vi.mock("../src/services/chat-history-service.js", () => ({
  listChatSessions: vi.fn(async (userId: string) =>
    (userSessions.get(userId) ?? []).map(
      ({ messages: _messages, ...session }) => session,
    ),
  ),
  getChatSession: vi.fn(
    async ({ userId, sessionId }: { userId: string; sessionId: string }) =>
      (userSessions.get(userId) ?? []).find(
        (session) => session.id === sessionId,
      ) ?? null,
  ),
  getChatSessionMessagesForAi: vi.fn(
    async ({ userId, sessionId }: { userId: string; sessionId: string }) => {
      const session = (userSessions.get(userId) ?? []).find(
        (currentSession) => currentSession.id === sessionId,
      );

      return session
        ? session.messages.map((message) => ({
            role: message.role,
            content: message.content,
          }))
        : null;
    },
  ),
  saveChatExchange: vi.fn(
    async ({
      userId,
      sessionId,
      title,
      userMessage,
      assistantMessage,
    }: {
      userId: string;
      sessionId: string;
      title: string;
      userMessage: { id: string; role: "user"; content: string };
      assistantMessage: { id: string; role: "assistant"; content: string };
    }) => {
      const now = new Date("2026-07-20T00:00:00.000Z").toISOString();
      const currentSessions = userSessions.get(userId) ?? [];
      const existingSession = currentSessions.find(
        (session) => session.id === sessionId,
      );
      const nextSession = {
        id: sessionId,
        title,
        titleStatus: "fallback" as const,
        titleModel: null,
        messageCount: (existingSession?.messages.length ?? 0) + 2,
        lastMessageAt: now,
        createdAt: existingSession?.createdAt ?? now,
        updatedAt: now,
        messages: [
          ...(existingSession?.messages ?? []),
          userMessage,
          assistantMessage,
        ],
      };

      userSessions.set(userId, [
        nextSession,
        ...currentSessions.filter((session) => session.id !== sessionId),
      ]);

      const { messages: _messages, ...summary } = nextSession;

      return summary;
    },
  ),
}));

vi.mock("../src/services/chat-orchestrator.js", () => ({
  handleChat: vi.fn(
    async ({ conversationId }: { conversationId?: string }) => ({
      ok: true,
      data: {
        response: "Backend authenticated response",
        model: "test-model",
        conversationId:
          conversationId ?? "00000000-0000-4000-8000-000000000099",
        toolCalls: [],
      },
    }),
  ),
}));

describe("chat routes authentication and history", () => {
  beforeEach(() => {
    activeUserId = userOneId;
    persistedUserIds = new Set([userOneId, userTwoId]);
    shouldThrowAuthSession = false;
    userSessions.clear();
  });

  it("rejects unauthenticated chat history requests", async () => {
    const { buildApp } = await import("../src/app.js");
    const app = buildApp();
    activeUserId = null;

    const response = await app.inject({
      method: "GET",
      url: "/api/chat/sessions",
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns unauthorized when Better Auth cannot read a stale session", async () => {
    const { buildApp } = await import("../src/app.js");
    const app = buildApp();

    shouldThrowAuthSession = true;

    const response = await app.inject({
      method: "GET",
      url: "/api/chat/sessions",
      headers: {
        cookie: "better-auth.session_token=stale",
      },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("rejects sessions whose user row is missing from the database", async () => {
    const { buildApp } = await import("../src/app.js");
    const app = buildApp();

    persistedUserIds = new Set();

    const response = await app.inject({
      method: "GET",
      url: "/api/chat/sessions",
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("stores and returns chat sessions only for the authenticated user", async () => {
    const { buildApp } = await import("../src/app.js");
    const app = buildApp();

    const created = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        message: "Show my spending",
      },
    });

    expect(created.statusCode).toBe(200);
    const createdBody = created.json();
    const sessionId = createdBody.data.session.id as string;

    const userOneList = await app.inject({
      method: "GET",
      url: "/api/chat/sessions",
    });

    expect(userOneList.statusCode).toBe(200);
    expect(userOneList.json().data.sessions).toHaveLength(1);

    activeUserId = userTwoId;

    const userTwoList = await app.inject({
      method: "GET",
      url: "/api/chat/sessions",
    });

    expect(userTwoList.statusCode).toBe(200);
    expect(userTwoList.json().data.sessions).toEqual([]);

    const crossUserLoad = await app.inject({
      method: "GET",
      url: `/api/chat/sessions/${sessionId}`,
    });

    expect(crossUserLoad.statusCode).toBe(404);
    await app.close();
  });

  it("rejects chat posts for sessions that do not belong to the user", async () => {
    const { buildApp } = await import("../src/app.js");
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        conversationId: "00000000-0000-4000-8000-000000000404",
        message: "Continue this chat",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("chat_session_not_found");
    await app.close();
  });
});
