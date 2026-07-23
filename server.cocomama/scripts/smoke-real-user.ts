import "dotenv/config";
import pg from "pg";
import { env } from "../src/config/env.js";
import { parseExpenseMessage } from "../src/services/expense-message-parser.js";

const { Client } = pg;

const demoMessage = "I just bought a new pair of headphone at Rs 2000";
const demoUserEmail = "demo@cocomama.local";

interface DemoUserRow {
  id: string;
}

interface CategoryRow {
  id: string;
}

interface InsertedTransactionRow {
  id: string;
}

interface SmokeResultRow {
  user_name: string;
  email: string;
  transaction_id: string;
  type: string;
  amount: string;
  category: string;
  title: string;
  description: string;
  spendable_balance: string;
  occurred_at: Date;
}

const quoteIdentifier = (value: string) => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe database identifier: ${value}`);
  }

  return `"${value}"`;
};

const getAppDatabaseDetails = () => {
  const url = new URL(env.DATABASE_URL);
  const databaseName = url.pathname.replace(/^\//, "");

  if (!databaseName) {
    throw new Error("DATABASE_URL must include a database name");
  }

  return {
    databaseName,
    adminUrl: new URL("/postgres", url).toString(),
  };
};

const createDatabaseIfMissing = async () => {
  const { adminUrl, databaseName } = getAppDatabaseDetails();
  const adminClient = new Client({ connectionString: adminUrl });

  await adminClient.connect();

  try {
    const existing = await adminClient.query<{ exists: number }>(
      `
      select 1 as exists
      from pg_database
      where datname = $1
    `,
      [databaseName],
    );

    if (existing.rowCount === 0) {
      await adminClient.query(
        `create database ${quoteIdentifier(databaseName)}`,
      );
    }
  } finally {
    await adminClient.end();
  }
};

const connect = async () => {
  await createDatabaseIfMissing();
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  return client;
};

const ensureSchema = async (client: pg.Client) => {
  await client.query("create extension if not exists pgcrypto");
  await client.query("create extension if not exists pg_trgm");
  await client.query(`
    do $$
    begin
      create type transaction_type as enum ('expense', 'income', 'savings');
    exception when duplicate_object then null;
    end $$;
  `);
  await client.query(`
    do $$
    begin
      create type category_kind as enum ('expense', 'income', 'savings');
    exception when duplicate_object then null;
    end $$;
  `);

  await client.query(`
    create table if not exists users (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      email text unique,
      currency text not null default 'NPR',
      timezone text not null default 'Asia/Kathmandu',
      spendable_balance numeric(14,2) not null default 0,
      total_saved numeric(14,2) not null default 0,
      created_at timestamptz not null default now()
    )
  `);

  await client.query(`
    create table if not exists categories (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references users(id) on delete cascade,
      kind category_kind not null,
      name text not null,
      created_at timestamptz not null default now(),
      unique (user_id, kind, name)
    )
  `);

  await client.query(`
    create table if not exists transactions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      type transaction_type not null,
      amount numeric(14,2) not null check (amount > 0),
      category_id uuid references categories(id),
      savings_instrument_id uuid,
      funded_by_budget_id uuid,
      merchant text,
      title text not null,
      description text not null,
      notes text,
      tags text[],
      is_recurring boolean not null default false,
      receipt_image_url text,
      occurred_at timestamptz not null,
      deleted_at timestamptz,
      created_at timestamptz not null default now(),
      constraint savings_instrument_only_for_savings check (type = 'savings' or savings_instrument_id is null),
      constraint funded_budget_only_for_expenses check (funded_by_budget_id is null or type = 'expense')
    )
  `);

  await client.query(
    "create index if not exists idx_transactions_user_id on transactions (user_id)",
  );
  await client.query(
    "create index if not exists idx_transactions_user_type_date on transactions (user_id, type, occurred_at desc)",
  );
  await client.query(
    "create index if not exists idx_transactions_user_category on transactions (user_id, category_id)",
  );
  await client.query(
    "create index if not exists idx_transactions_description_trgm on transactions using gin (description gin_trgm_ops)",
  );

  await client.query(`
    create or replace function refresh_user_transaction_balances(target_user_id uuid)
    returns void as $$
    begin
      if target_user_id is null then
        return;
      end if;

      update users
      set
        spendable_balance = coalesce((
          select sum(
            case
              when t.type = 'income' then t.amount
              when t.type = 'expense' and t.funded_by_budget_id is null then -t.amount
              when t.type = 'savings' then -t.amount
              else 0
            end
          )
          from transactions t
          where t.user_id = target_user_id
            and t.deleted_at is null
        ), 0),
        total_saved = coalesce((
          select sum(t.amount)
          from transactions t
          where t.user_id = target_user_id
            and t.deleted_at is null
            and t.type = 'savings'
        ), 0),
        updated_at = now()
      where id = target_user_id;
    end;
    $$ language plpgsql
  `);

  await client.query(`
    create or replace function apply_transaction_to_balance()
    returns trigger as $$
    begin
      if tg_op = 'DELETE' then
        perform refresh_user_transaction_balances(old.user_id);
        return old;
      end if;

      perform refresh_user_transaction_balances(new.user_id);

      if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
        perform refresh_user_transaction_balances(old.user_id);
      end if;

      return new;
    end;
    $$ language plpgsql
  `);

  await client.query(
    "drop trigger if exists trg_apply_transaction_to_balance on transactions",
  );
  await client.query(`
    create trigger trg_apply_transaction_to_balance
    after insert or update or delete on transactions
    for each row execute function apply_transaction_to_balance()
  `);
};

const seedDemoUser = async (client: pg.Client) => {
  const result = await client.query<DemoUserRow>(
    `
    insert into users (name, email, currency, timezone, spendable_balance, total_saved)
    values ('Demo User', $1, 'NPR', 'Asia/Kathmandu', 0, 0)
    on conflict (email) do update
    set name = excluded.name,
        currency = excluded.currency,
        timezone = excluded.timezone,
        spendable_balance = 0,
        total_saved = 0
    returning id
  `,
    [demoUserEmail],
  );

  const userId = result.rows[0]?.id;

  if (!userId) {
    throw new Error("Could not seed demo user");
  }

  for (const category of [
    "electronics",
    "clothing",
    "groceries",
    "food & dining",
    "other",
  ]) {
    await client.query(
      `
      insert into categories (user_id, kind, name)
      values ($1, 'expense', $2)
      on conflict (user_id, kind, name) do nothing
    `,
      [userId, category],
    );
  }

  return userId;
};

const createTransactionFromMessage = async (
  client: pg.Client,
  userId: string,
  message: string,
) => {
  const parsed = parseExpenseMessage(message);
  const categoryResult = await client.query<CategoryRow>(
    `
    select id
    from categories
    where user_id = $1 and kind = 'expense' and name = $2
    limit 1
  `,
    [userId, parsed.category],
  );
  const categoryId = categoryResult.rows[0]?.id;

  if (!categoryId) {
    throw new Error(`Missing category ${parsed.category}`);
  }

  const inserted = await client.query<InsertedTransactionRow>(
    `
    insert into transactions (user_id, type, amount, category_id, title, description, merchant, occurred_at)
    values ($1, 'expense', $2, $3, $4, $5, $6, now())
    returning id
  `,
    [
      userId,
      parsed.amount,
      categoryId,
      parsed.title,
      parsed.description,
      parsed.merchant ?? null,
    ],
  );

  const transactionId = inserted.rows[0]?.id;

  if (!transactionId) {
    throw new Error("Could not insert transaction");
  }

  return transactionId;
};

const readBackTransaction = async (
  client: pg.Client,
  transactionId: string,
) => {
  const result = await client.query<SmokeResultRow>(
    `
    select
      u.name as user_name,
      u.email,
      t.id as transaction_id,
      t.type,
      t.amount,
      c.name as category,
      t.title,
      t.description,
      u.spendable_balance,
      t.occurred_at
    from transactions t
    join users u on u.id = t.user_id
    left join categories c on c.id = t.category_id
    where t.id = $1
  `,
    [transactionId],
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error("Inserted transaction was not found during read-back");
  }

  return row;
};

const main = async () => {
  const client = await connect();

  try {
    await ensureSchema(client);
    const userId = await seedDemoUser(client);
    const transactionId = await createTransactionFromMessage(
      client,
      userId,
      demoMessage,
    );
    const row = await readBackTransaction(client, transactionId);

    console.log(
      JSON.stringify(
        {
          message: demoMessage,
          recordAppeared: true,
          transaction: {
            id: row.transaction_id,
            type: row.type,
            amount: row.amount,
            category: row.category,
            title: row.title,
            description: row.description,
            occurredAt: row.occurred_at,
          },
          user: {
            name: row.user_name,
            email: row.email,
            spendableBalanceAfterInsert: row.spendable_balance,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
