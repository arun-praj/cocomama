import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth.js";
import { env } from "../config/env.js";

const bodylessMethods = new Set(["GET", "HEAD"]);

const copyWebResponseToFastify = async (
  response: Response,
  reply: FastifyReply,
) => {
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") {
      reply.header(key, value);
    }
  });

  const setCookies = response.headers.getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    reply.header("set-cookie", setCookies);
  }

  const body = Buffer.from(await response.arrayBuffer());

  return reply.code(response.status).send(body);
};

const toAuthRequest = (request: FastifyRequest) => {
  const url = new URL(request.url, env.BETTER_AUTH_URL);
  const method = request.method.toUpperCase();
  const init: RequestInit = {
    method,
    headers: fromNodeHeaders(request.headers),
  };

  if (!bodylessMethods.has(method)) {
    init.body = JSON.stringify(request.body ?? {});
  }

  return new Request(url, init);
};

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      const response = await auth.handler(toAuthRequest(request));

      return copyWebResponseToFastify(response, reply);
    },
  });
};
