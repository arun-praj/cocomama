import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { categories } from "../db/schema.js";
import type {
  CreateCategoryInput,
  DeleteCategoryInput,
  QueryCategoriesInput,
  TransactionType,
  UpdateCategoryInput,
} from "../tools/types.js";
import { resolveCategoryEmoji } from "./category-emoji-service.js";
import type { ChatToolCallSummary } from "./transaction-record-service.js";

export interface CategoryUserContext {
  id: string;
}

const normalizeCategoryName = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

const formatKindLabel = (kind: TransactionType) =>
  `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;

const categoryToolCall = ({
  name,
  input,
  label,
  category,
}: {
  name: "create_category" | "update_category" | "delete_category";
  input: Record<string, unknown>;
  label: string;
  category: {
    id?: string;
    kind: TransactionType;
    name: string;
    emoji?: string;
  };
}): ChatToolCallSummary => ({
  name,
  label,
  status: "success",
  input,
  result: {
    title: category.name,
    description: `${category.emoji ? `${category.emoji} ` : ""}${category.kind} category`,
    category: category.name,
    ...(category.emoji ? { emoji: category.emoji } : {}),
    status: "active",
    ...(category.id ? { savingId: category.id } : {}),
  },
});

const findUserCategory = async ({
  userId,
  kind,
  name,
}: {
  userId: string;
  kind: TransactionType;
  name: string;
}) => {
  const normalizedName = normalizeCategoryName(name);
  const [category] = await db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.userId, userId),
        eq(categories.kind, kind),
        sql`lower(${categories.name}) = ${normalizedName}`,
      ),
    )
    .limit(1);

  return category ?? null;
};

const findUserCategoryByName = async ({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) => {
  const normalizedName = normalizeCategoryName(name);
  const [category] = await db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.userId, userId),
        sql`lower(${categories.name}) = ${normalizedName}`,
      ),
    )
    .limit(1);

  return category ?? null;
};

const findGlobalCategory = async ({
  kind,
  name,
}: {
  kind: TransactionType;
  name: string;
}) => {
  const normalizedName = normalizeCategoryName(name);
  const [category] = await db
    .select()
    .from(categories)
    .where(
      and(
        isNull(categories.userId),
        eq(categories.kind, kind),
        sql`lower(${categories.name}) = ${normalizedName}`,
      ),
    )
    .limit(1);

  return category ?? null;
};

const findGlobalCategoryByName = async ({ name }: { name: string }) => {
  const normalizedName = normalizeCategoryName(name);
  const [category] = await db
    .select()
    .from(categories)
    .where(
      and(
        isNull(categories.userId),
        sql`lower(${categories.name}) = ${normalizedName}`,
      ),
    )
    .limit(1);

  return category ?? null;
};

export const createCategory = async ({
  user,
  input,
}: {
  user: CategoryUserContext;
  input: CreateCategoryInput;
}) => {
  const name = normalizeCategoryName(input.name);
  const existingUserCategory = await findUserCategoryByName({
    userId: user.id,
    name,
  });
  const existingGlobalCategory = await findGlobalCategoryByName({
    name,
  });

  if (existingUserCategory || existingGlobalCategory) {
    const category = existingUserCategory ?? existingGlobalCategory;
    const categorySummary = {
      ...(category?.id ? { id: category.id } : {}),
      kind: category?.kind ?? input.kind,
      name: category?.name ?? name,
      ...(category?.emoji ? { emoji: category.emoji } : {}),
    };

    return {
      response: `### Category already exists\n\n${categorySummary.emoji ?? ""} **${formatKindLabel(input.kind)}:** ${categorySummary.name}`,
      toolCalls: [
        categoryToolCall({
          name: "create_category",
          input: input as unknown as Record<string, unknown>,
          label: "Category already exists",
          category: categorySummary,
        }),
      ],
    };
  }

  const [category] = await db
    .insert(categories)
    .values({
      userId: user.id,
      kind: input.kind,
      name,
      emoji: resolveCategoryEmoji({ kind: input.kind, name }),
    })
    .returning();

  if (!category) {
    throw new Error("Could not create category");
  }

  return {
    response: `### Category added\n\n${category.emoji} **${formatKindLabel(input.kind)}:** ${name}`,
    toolCalls: [
      categoryToolCall({
        name: "create_category",
        input: input as unknown as Record<string, unknown>,
        label: "Category added",
        category,
      }),
    ],
  };
};

export const queryCategories = async ({
  user,
  input,
}: {
  user: CategoryUserContext;
  input: QueryCategoriesInput;
}) => {
  const conditions = [
    sql`(${categories.userId} = ${user.id} OR ${categories.userId} IS NULL)`,
  ];

  if (input.kind) {
    conditions.push(eq(categories.kind, input.kind));
  }

  const rows = await db
    .select({
      kind: categories.kind,
      name: categories.name,
      emoji: categories.emoji,
    })
    .from(categories)
    .where(and(...conditions))
    .orderBy(categories.kind, categories.name);
  const grouped = rows.reduce<Record<TransactionType, string[]>>(
    (currentGroups, row) => ({
      ...currentGroups,
      [row.kind]: [...currentGroups[row.kind], `${row.emoji} ${row.name}`],
    }),
    { expense: [], income: [], savings: [] },
  );
  const kinds = input.kind
    ? [input.kind]
    : (["expense", "income", "savings"] as const);
  const response = [
    "### Saved categories",
    "",
    ...kinds.map((kind) => {
      const categoryNames = grouped[kind];

      return `**${formatKindLabel(kind)}:** ${categoryNames.length ? categoryNames.join(", ") : "none"}`;
    }),
  ].join("\n");
  const toolCall: ChatToolCallSummary = {
    name: "query_categories",
    label: "Categories listed",
    status: "success",
    input: input as unknown as Record<string, unknown>,
    result: {
      title: "Categories",
      description: response,
    },
  };

  return {
    response,
    toolCalls: [toolCall],
  };
};

export const updateCategory = async ({
  user,
  input,
}: {
  user: CategoryUserContext;
  input: UpdateCategoryInput;
}) => {
  const category = await findUserCategory({
    userId: user.id,
    kind: input.kind,
    name: input.name,
  });

  if (!category) {
    return {
      response: `### Category not found\n\nI could not find your **${input.kind}** category named **${input.name}**.\n\nGlobal default categories cannot be renamed directly; create a new category instead.`,
      toolCalls: [],
    };
  }

  const newName = normalizeCategoryName(input.new_name);
  const emoji = resolveCategoryEmoji({ kind: input.kind, name: newName });
  const [updatedCategory] = await db
    .update(categories)
    .set({ name: newName, emoji })
    .where(
      and(
        eq(categories.id, category.id),
        eq(categories.userId, user.id),
        eq(categories.kind, input.kind),
      ),
    )
    .returning();

  if (!updatedCategory) {
    throw new Error("Could not update category");
  }

  return {
    response: `### Category renamed\n\n${updatedCategory.emoji} **${formatKindLabel(input.kind)}:** ${input.name} -> ${newName}`,
    toolCalls: [
      categoryToolCall({
        name: "update_category",
        input: input as unknown as Record<string, unknown>,
        label: "Category updated",
        category: updatedCategory,
      }),
    ],
  };
};

export const deleteCategory = async ({
  user,
  input,
}: {
  user: CategoryUserContext;
  input: DeleteCategoryInput;
}) => {
  const category = await findUserCategory({
    userId: user.id,
    kind: input.kind,
    name: input.name,
  });

  if (!category) {
    return {
      response: `### Category not found\n\nI could not find your **${input.kind}** category named **${input.name}**.\n\nGlobal default categories cannot be deleted.`,
      toolCalls: [],
    };
  }

  await db
    .delete(categories)
    .where(
      and(
        eq(categories.id, category.id),
        eq(categories.userId, user.id),
        eq(categories.kind, input.kind),
      ),
    );

  return {
    response: `### Category deleted\n\n**${formatKindLabel(input.kind)}:** ${category.name}`,
    toolCalls: [
      categoryToolCall({
        name: "delete_category",
        input: input as unknown as Record<string, unknown>,
        label: "Category deleted",
        category,
      }),
    ],
  };
};
