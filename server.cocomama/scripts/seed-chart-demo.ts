import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { categories, transactions, users } from "../src/db/schema.js";

const demoMarker = "chart-demo-seed";

const months = [
  { month: 0, income: 65000, expense: 18000, savings: 8000 },
  { month: 1, income: 68000, expense: 24000, savings: 9000 },
  { month: 2, income: 72000, expense: 13500, savings: 12000 },
  { month: 3, income: 69000, expense: 31000, savings: 7000 },
  { month: 4, income: 76000, expense: 22000, savings: 15000 },
  { month: 5, income: 73000, expense: 28000, savings: 9500 },
  { month: 6, income: 81000, expense: 19000, savings: 20000 },
  { month: 7, income: 78000, expense: 26000, savings: 12000 },
  { month: 8, income: 84000, expense: 36000, savings: 10000 },
  { month: 9, income: 82000, expense: 21000, savings: 18000 },
  { month: 10, income: 88000, expense: 29000, savings: 22000 },
  { month: 11, income: 91000, expense: 33000, savings: 25000 },
];

const recentWeekExpenses = [
  { daysAgo: 1, title: "Lunch", description: "Lunch at cafe", amount: 1350, category: "food" },
  { daysAgo: 2, title: "Taxi ride", description: "Office commute", amount: 850, category: "transport" },
  { daysAgo: 3, title: "Movie night", description: "Cinema tickets", amount: 2400, category: "entertainment" },
  { daysAgo: 4, title: "Groceries", description: "Weekly grocery run", amount: 4200, category: "food" },
  { daysAgo: 5, title: "Coffee", description: "Coffee meeting", amount: 650, category: "food" },
  { daysAgo: 6, title: "Fuel", description: "Fuel top up", amount: 3000, category: "transport" },
  { daysAgo: 7, title: "Subscription", description: "Streaming subscription", amount: 1200, category: "entertainment" },
];

const getMonthDate = (monthOffset: number, day: number) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (11 - monthOffset), day, 9, 0, 0, 0));
};

const getRecentDate = (daysAgo: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  date.setUTCHours(9, 0, 0, 0);
  return date;
};

async function ensureCategory(userId: string, kind: "expense" | "income" | "savings", name: string) {
  const [existingCategory] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.kind, kind), sql`lower(${categories.name}) = ${name.toLowerCase()}`))
    .limit(1);

  if (existingCategory) {
    return existingCategory.id;
  }

  const [category] = await db
    .insert(categories)
    .values({ userId, kind, name })
    .returning({ id: categories.id });

  if (!category) {
    throw new Error(`Could not create ${kind} category ${name}`);
  }

  return category.id;
}

async function seedForUser(user: { id: string; email: string }) {
  await db.delete(transactions).where(and(eq(transactions.userId, user.id), sql`${transactions.notes} = ${demoMarker}`));

  const foodCategoryId = await ensureCategory(user.id, "expense", "food");
  const transportCategoryId = await ensureCategory(user.id, "expense", "transport");
  const entertainmentCategoryId = await ensureCategory(user.id, "expense", "entertainment");
  const salaryCategoryId = await ensureCategory(user.id, "income", "salary");
  const savingsCategoryId = await ensureCategory(user.id, "savings", "emergency fund");

  await db.insert(transactions).values(
    months.flatMap((entry, index) => [
      {
        userId: user.id,
        type: "income" as const,
        amount: entry.income.toFixed(2),
        categoryId: salaryCategoryId,
        title: "Salary",
        description: `Monthly salary ${index + 1}`,
        notes: demoMarker,
        occurredAt: getMonthDate(entry.month, 1),
      },
      {
        userId: user.id,
        type: "expense" as const,
        amount: entry.expense.toFixed(2),
        categoryId: index % 3 === 0 ? foodCategoryId : index % 3 === 1 ? transportCategoryId : entertainmentCategoryId,
        merchant: index % 3 === 0 ? "Bhatbhateni" : index % 3 === 1 ? "Pathao" : "QFX",
        title: index % 3 === 0 ? "Household spend" : index % 3 === 1 ? "Transport spend" : "Entertainment spend",
        description: `Monthly expense ${index + 1}`,
        notes: demoMarker,
        occurredAt: getMonthDate(entry.month, 12),
      },
      {
        userId: user.id,
        type: "savings" as const,
        amount: entry.savings.toFixed(2),
        categoryId: savingsCategoryId,
        title: "Monthly saving",
        description: `Savings contribution ${index + 1}`,
        notes: demoMarker,
        occurredAt: getMonthDate(entry.month, 20),
      },
    ]),
  );

  await db.insert(transactions).values(
    recentWeekExpenses.map((entry, index) => ({
      userId: user.id,
      type: "expense" as const,
      amount: entry.amount.toFixed(2),
      categoryId: entry.category === "transport" ? transportCategoryId : entry.category === "entertainment" ? entertainmentCategoryId : foodCategoryId,
      merchant: entry.category === "transport" ? "Pathao" : entry.category === "entertainment" ? "QFX" : "Local Cafe",
      title: entry.title,
      description: entry.description,
      notes: demoMarker,
      occurredAt: getRecentDate(entry.daysAgo),
      createdAt: getRecentDate(entry.daysAgo),
      tags: ["demo", `week-${index + 1}`],
    })),
  );

  return user.email;
}

const allUsers = await db.select({ id: users.id, email: users.email }).from(users);

if (allUsers.length === 0) {
  throw new Error("No users found. Sign in once before seeding chart demo data.");
}

const seededEmails = [];
for (const user of allUsers) {
  seededEmails.push(await seedForUser(user));
}

console.log(JSON.stringify({ ok: true, marker: demoMarker, users: seededEmails }, null, 2));
