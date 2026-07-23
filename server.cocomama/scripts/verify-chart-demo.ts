import "dotenv/config";
import { db } from "../src/db/client.js";
import { transactions, users } from "../src/db/schema.js";
import { and, eq, isNull } from "drizzle-orm";

const userRows = await db.select({ id: users.id, email: users.email }).from(users);
const summaries = [];

for (const user of userRows) {
  const rows = await db
    .select({
      type: transactions.type,
      occurredAt: transactions.occurredAt,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, user.id),
        eq(transactions.notes, "chart-demo-seed"),
        isNull(transactions.deletedAt),
      ),
    );
  const byType = rows.reduce<Record<string, number>>(
    (totals, row) => ({
      ...totals,
      [row.type]: (totals[row.type] ?? 0) + 1,
    }),
    {},
  );
  const dates = rows
    .map((row) => row.occurredAt.toISOString().slice(0, 10))
    .sort();

  summaries.push({
    email: user.email,
    total: rows.length,
    byType,
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
  });
}

console.log(JSON.stringify(summaries, null, 2));
