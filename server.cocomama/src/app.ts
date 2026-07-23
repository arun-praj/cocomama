import Fastify from "fastify";
import { appRoutes } from "./routes/app.js";
import { authRoutes } from "./routes/auth.js";
import { chatRoutes } from "./routes/chat.js";
import { voiceRoutes } from "./routes/voice.js";

export const buildApp = () => {
  const app = Fastify({
    logger: true,
  });

  app.get("/health", async () => ({
    ok: true,
  }));

  app.register(authRoutes);
  app.register(appRoutes);
  app.register(chatRoutes);
  app.register(voiceRoutes);

  return app;
};
