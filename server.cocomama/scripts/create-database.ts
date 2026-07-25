import "dotenv/config";
import { Client } from "pg";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/cocomama";
const targetUrl = new URL(databaseUrl);
const databaseName = decodeURIComponent(targetUrl.pathname.slice(1));

if (!databaseName) {
  throw new Error("DATABASE_URL must include a database name");
}

// Connect to PostgreSQL's maintenance database because the target may not exist.
targetUrl.pathname = "/postgres";

const client = new Client({ connectionString: targetUrl.toString() });

try {
  await client.connect();

  const existingDatabase = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [databaseName],
  );

  if (existingDatabase.rowCount) {
    console.log(`Database "${databaseName}" already exists.`);
  } else {
    const quotedDatabaseName = `"${databaseName.replaceAll('"', '""')}"`;
    await client.query(`CREATE DATABASE ${quotedDatabaseName} TEMPLATE template0`);
    console.log(`Created database "${databaseName}".`);
  }
} finally {
  await client.end();
}
