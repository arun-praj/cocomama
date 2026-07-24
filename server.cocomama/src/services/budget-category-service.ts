import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { categories } from "../db/schema.js";

const normalizeName = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

const tokenizeName = (value: string) =>
  normalizeName(value)
    .split(/[^a-z0-9]+/i)
    .filter((part) => part.length >= 3);

const genericCategoryTokens = new Set([
  "budget",
  "category",
  "expense",
  "fund",
  "goal",
  "income",
  "money",
  "savings",
  "target",
]);

const tokenizeForCategoryMatch = (value: string) =>
  tokenizeName(value).filter((token) => !genericCategoryTokens.has(token));

const budgetCategoryHintCandidates = (value: string) => {
  const normalizedValue = normalizeName(value);

  if (
    /\b(laptop|headphone|headset|phone|gadget|electronics?)\b/.test(
      normalizedValue,
    )
  ) {
    return ["shopping", "electronics"];
  }

  if (/\b(holiday|vacation|trip|travel|flight|hotel)\b/.test(normalizedValue)) {
    return ["travel", "travel savings"];
  }

  if (/\b(tuition|school|education|course|class)\b/.test(normalizedValue)) {
    return ["education", "education savings"];
  }

  if (/\b(food|grocery|groceries|restaurant|dining)\b/.test(normalizedValue)) {
    return ["food & dining"];
  }

  if (/\b(rent|house|home|apartment|mortgage)\b/.test(normalizedValue)) {
    return ["housing", "home savings"];
  }

  if (/\b(emergency|rainy day)\b/.test(normalizedValue)) {
    return ["emergency fund"];
  }

  return [];
};

const getCategoryMatchScore = ({
  category,
  candidates,
}: {
  category: { name: string; keywords: string[]; userId: string | null };
  candidates: string[];
}) => {
  const normalizedCandidates = candidates.map(normalizeName).filter(Boolean);
  const categoryName = normalizeName(category.name);
  const categoryNameTokens = new Set(tokenizeForCategoryMatch(category.name));
  const keywordEntries = category.keywords.map((keyword) => ({
    phrase: normalizeName(keyword),
    tokens: new Set(tokenizeForCategoryMatch(keyword)),
  }));
  let bestScore = 0;

  for (const candidate of normalizedCandidates) {
    const candidateTokens = new Set(tokenizeForCategoryMatch(candidate));

    if (candidate === categoryName) {
      bestScore = Math.max(bestScore, 1_000);
    }

    if (
      candidate.length >= 4 &&
      categoryName.length >= 4 &&
      (candidate.includes(categoryName) || categoryName.includes(candidate))
    ) {
      bestScore = Math.max(bestScore, 700);
    }

    const categoryNameOverlap = [...categoryNameTokens].filter((token) =>
      candidateTokens.has(token),
    ).length;

    if (categoryNameOverlap > 0) {
      bestScore = Math.max(bestScore, 100 + categoryNameOverlap * 20);
    }

    for (const keyword of keywordEntries) {
      if (!keyword.phrase) {
        continue;
      }

      if (candidate === keyword.phrase) {
        bestScore = Math.max(bestScore, 900);
      }

      if (
        candidate.length >= 4 &&
        keyword.phrase.length >= 4 &&
        (candidate.includes(keyword.phrase) ||
          keyword.phrase.includes(candidate))
      ) {
        bestScore = Math.max(bestScore, 500);
      }

      const keywordOverlap = [...keyword.tokens].filter((token) =>
        candidateTokens.has(token),
      ).length;

      if (keywordOverlap > 0) {
        bestScore = Math.max(bestScore, 40 + keywordOverlap * 10);
      }
    }
  }

  return bestScore + (category.userId ? 5 : 0);
};

export const resolveBudgetCategory = async ({
  userId,
  categoryName,
  budgetName,
}: {
  userId: string;
  categoryName?: string | undefined;
  budgetName: string;
}) => {
  const candidates = [
    categoryName,
    budgetName,
    ...budgetCategoryHintCandidates(categoryName ?? ""),
    ...budgetCategoryHintCandidates(budgetName),
  ].filter((candidate): candidate is string => Boolean(candidate?.trim()));
  const categoryRows = await db
    .select()
    .from(categories)
    .where(
      sql`${categories.userId} = ${userId} OR ${categories.userId} IS NULL`,
    );

  const [matchedCategory] = categoryRows
    .map((category) => ({
      category,
      score: getCategoryMatchScore({ category, candidates }),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score);

  if (matchedCategory) {
    return matchedCategory.category;
  }

  const [shoppingCategory] = await db
    .select()
    .from(categories)
    .where(
      and(
        sql`lower(${categories.name}) = 'shopping'`,
        sql`${categories.userId} = ${userId} OR ${categories.userId} IS NULL`,
      ),
    )
    .orderBy(isNull(categories.userId), eq(categories.userId, userId))
    .limit(1);

  return shoppingCategory ?? null;
};
