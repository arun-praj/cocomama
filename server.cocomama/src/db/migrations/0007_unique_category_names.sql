WITH ranked_categories AS (
	SELECT
		id,
		FIRST_VALUE(id) OVER (
			PARTITION BY user_id, lower(name)
			ORDER BY created_at ASC, id ASC
		) AS keeper_id,
		ROW_NUMBER() OVER (
			PARTITION BY user_id, lower(name)
			ORDER BY created_at ASC, id ASC
		) AS duplicate_rank
	FROM categories
), duplicate_categories AS (
	SELECT id, keeper_id
	FROM ranked_categories
	WHERE duplicate_rank > 1
)
UPDATE transactions
SET category_id = duplicate_categories.keeper_id
FROM duplicate_categories
WHERE transactions.category_id = duplicate_categories.id;
--> statement-breakpoint
WITH ranked_categories AS (
	SELECT
		id,
		ROW_NUMBER() OVER (
			PARTITION BY user_id, lower(name)
			ORDER BY created_at ASC, id ASC
		) AS duplicate_rank
	FROM categories
)
DELETE FROM categories
USING ranked_categories
WHERE categories.id = ranked_categories.id
	AND ranked_categories.duplicate_rank > 1;
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_categories_user_kind_name_unique";
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_categories_global_kind_name_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_categories_user_name_unique" ON "categories" USING btree ("user_id", lower("name")) WHERE "categories"."user_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_categories_global_name_unique" ON "categories" USING btree (lower("name")) WHERE "categories"."user_id" IS NULL;