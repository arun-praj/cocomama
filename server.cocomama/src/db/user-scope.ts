import { sql } from "drizzle-orm";
import type { AppDatabase } from "./client.js";

type TransactionCallback = Parameters<AppDatabase["transaction"]>[0];
export type UserScopedTransaction = Parameters<TransactionCallback>[0];

export const withUserScope = async <Result>(
  database: AppDatabase,
  userId: string,
  callback: (tx: UserScopedTransaction) => Promise<Result>,
) =>
  database.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.current_user_id', ${userId}, true)`,
    );
    return callback(tx);
  });
