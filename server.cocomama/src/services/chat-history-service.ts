import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { chatMessages, chatSessions } from "../db/schema.js";
import type { LlmMessage } from "./llm-gateway.js";
import type { ChatToolCallSummary } from "./transaction-record-service.js";

export type StoredChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  toolCalls?: ChatToolCallSummary[];
  isError?: boolean;
  excludedFromAi?: boolean;
};

export type ChatSessionSummary = {
  id: string;
  title: string;
  titleStatus: "generated" | "fallback";
  titleModel?: string | null;
  messageCount: number;
  lastMessageAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

const toSummary = (
  session: typeof chatSessions.$inferSelect,
): ChatSessionSummary => ({
  id: session.id,
  title: session.title,
  titleStatus: session.titleStatus === "generated" ? "generated" : "fallback",
  titleModel: session.titleModel,
  messageCount: session.messageCount,
  lastMessageAt: session.lastMessageAt?.toISOString() ?? null,
  createdAt: session.createdAt.toISOString(),
  updatedAt: session.updatedAt.toISOString(),
});

const toStoredMessage = (
  message: typeof chatMessages.$inferSelect,
): StoredChatMessage => ({
  id: message.id,
  role: message.role,
  content: message.content,
  ...(Array.isArray(message.toolCalls)
    ? { toolCalls: message.toolCalls as unknown as ChatToolCallSummary[] }
    : {}),
  ...(message.isError ? { isError: true } : {}),
  ...(message.excludedFromAi ? { excludedFromAi: true } : {}),
});

const toToolCallJson = (toolCalls?: ChatToolCallSummary[]) =>
  toolCalls ? (toolCalls as unknown as Record<string, unknown>[]) : null;

const toLlmMessage = (
  message: typeof chatMessages.$inferSelect,
): LlmMessage => ({
  role: message.role,
  content: message.content,
});

export const listChatSessions = async (userId: string) => {
  const sessions = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.userId, userId))
    .orderBy(desc(chatSessions.updatedAt))
    .limit(50);

  return sessions.map(toSummary);
};

export const getChatSession = async ({
  userId,
  sessionId,
}: {
  userId: string;
  sessionId: string;
}) => {
  const [session] = await db
    .select()
    .from(chatSessions)
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
    .limit(1);

  if (!session) {
    return null;
  }

  const messages = await db
    .select()
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.sessionId, sessionId),
        eq(chatMessages.userId, userId),
      ),
    )
    .orderBy(asc(chatMessages.createdAt));

  return {
    ...toSummary(session),
    messages: messages.map(toStoredMessage),
  };
};

export const getChatSessionMessagesForAi = async ({
  userId,
  sessionId,
  limit = 16,
}: {
  userId: string;
  sessionId: string;
  limit?: number;
}) => {
  const [session] = await db
    .select({ id: chatSessions.id })
    .from(chatSessions)
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
    .limit(1);

  if (!session) {
    return null;
  }

  const messages = await db
    .select()
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.sessionId, sessionId),
        eq(chatMessages.userId, userId),
      ),
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);

  return [...messages].reverse().map(toLlmMessage);
};

export const saveChatExchange = async ({
  userId,
  sessionId,
  title,
  userMessage,
  assistantMessage,
}: {
  userId: string;
  sessionId: string;
  title: string;
  userMessage: StoredChatMessage;
  assistantMessage: StoredChatMessage;
}) => {
  const now = new Date();
  const [existingSession] = await db
    .select({ id: chatSessions.id })
    .from(chatSessions)
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
    .limit(1);

  if (!existingSession) {
    await db.insert(chatSessions).values({
      id: sessionId,
      userId,
      title,
      titleStatus: "fallback",
      messageCount: 0,
      lastMessageAt: now,
      updatedAt: now,
    });
  }

  await db.insert(chatMessages).values({
    id: userMessage.id,
    sessionId,
    userId,
    role: userMessage.role,
    content: userMessage.content,
    toolCalls: toToolCallJson(userMessage.toolCalls),
    isError: userMessage.isError ?? false,
    excludedFromAi: userMessage.excludedFromAi ?? false,
    createdAt: now,
  });
  await db.insert(chatMessages).values({
    id: assistantMessage.id,
    sessionId,
    userId,
    role: assistantMessage.role,
    content: assistantMessage.content,
    toolCalls: toToolCallJson(assistantMessage.toolCalls),
    isError: assistantMessage.isError ?? false,
    excludedFromAi: assistantMessage.excludedFromAi ?? false,
    createdAt: new Date(now.getTime() + 1),
  });

  const messages = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.sessionId, sessionId),
        eq(chatMessages.userId, userId),
      ),
    );
  const [updatedSession] = await db
    .update(chatSessions)
    .set({
      title,
      messageCount: messages.length,
      lastMessageAt: now,
      updatedAt: now,
    })
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
    .returning();

  if (!updatedSession) {
    throw new Error("chat_session_save_failed");
  }

  return toSummary(updatedSession);
};
