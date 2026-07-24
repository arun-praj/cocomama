import "dotenv/config";
import { pool } from "../src/db/client.js";
import { seedDefaultCategories } from "../src/services/default-category-seed-service.js";

try {
  await seedDefaultCategories();
  console.log("Default categories seeded.");
} finally {
  await pool.end();
}
