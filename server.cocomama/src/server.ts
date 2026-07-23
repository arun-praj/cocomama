import "dotenv/config";
import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { seedDefaultCategories } from "./services/default-category-seed-service.js";

const start = async () => {
  const app = buildApp();

  try {
    await seedDefaultCategories();
    await app.listen({
      host: env.HOST,
      port: env.PORT,
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
