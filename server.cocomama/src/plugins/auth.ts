import type { FastifyReply, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { auth, type AuthSession } from "../auth.js";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
    authSession?: AuthSession;
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const requireAuth = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const session = await auth.api
    .getSession({
      headers: fromNodeHeaders(request.headers),
    })
    .catch(() => null);
  const userId = session?.user.id;

  if (!userId || !uuidPattern.test(userId)) {
    return reply.code(401).send({
      ok: false,
      error: {
        code: "unauthorized",
        message: "Missing or invalid authentication session",
      },
    });
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return reply.code(401).send({
      ok: false,
      error: {
        code: "unauthorized",
        message: "Authenticated user was not found in the backend database",
      },
    });
  }

  request.userId = userId;
  request.authSession = session;
};

export const getAuthenticatedUserId = (request: FastifyRequest) => {
  if (!request.userId) {
    throw new Error("Authenticated user id was not attached to the request");
  }

  return request.userId;
};

export const getAuthenticatedSession = (request: FastifyRequest) => {
  if (!request.authSession) {
    throw new Error("Authenticated session was not attached to the request");
  }

  return request.authSession;
};
