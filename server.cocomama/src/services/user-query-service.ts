import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import type { QueryUserInput } from "../tools/types.js";
import type { ChatToolCallSummary } from "./transaction-record-service.js";

export interface UserQueryContext {
  id: string;
  email?: string;
  name?: string;
  currency?: string;
  timezone?: string;
}

const formatMoney = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
};

export const queryUser = async ({
  user,
  input,
}: {
  user: UserQueryContext;
  input: QueryUserInput;
}) => {
  const [userRow] = await db
    .select({
      name: users.name,
      email: users.email,
      currency: users.currency,
      timezone: users.timezone,
      spendableBalance: users.spendableBalance,
      totalSaved: users.totalSaved,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const currency = userRow?.currency ?? user.currency ?? "NPR";
  const spendableBalance = Number(userRow?.spendableBalance ?? 0);
  const totalSaved = Number(userRow?.totalSaved ?? 0);
  const fields = input.fields?.length ? input.fields : ["balance"];
  const lines: string[] = ["### Account summary", ""];

  if (fields.includes("balance") || fields.includes("all")) {
    lines.push(
      `**Available to spend:** ${formatMoney(spendableBalance, currency)}`,
    );
    lines.push(`**Saved:** ${formatMoney(totalSaved, currency)}`);
  }

  if (fields.includes("currency") || fields.includes("all")) {
    lines.push(`**Currency:** ${currency}`);
  }

  if (fields.includes("timezone") || fields.includes("all")) {
    lines.push(
      `**Timezone:** ${userRow?.timezone ?? user.timezone ?? "Asia/Kathmandu"}`,
    );
  }

  if (fields.includes("profile") || fields.includes("all")) {
    lines.push(
      `**Profile:** ${userRow?.name ?? user.name ?? "Cocomama member"} (${userRow?.email ?? user.email ?? "no email"})`,
    );
  }

  const toolCall: ChatToolCallSummary = {
    name: "query_user",
    label: "User info queried",
    status: "success",
    input: input as unknown as Record<string, unknown>,
  };

  return {
    response: lines.join("\n"),
    toolCalls: [toolCall],
  };
};
