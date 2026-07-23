CREATE TABLE IF NOT EXISTS "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"kind" "category_kind" NOT NULL,
	"name" text NOT NULL,
	"keywords" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "keywords" text[] DEFAULT ARRAY[]::text[] NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'categories_user_id_users_id_fk'
	) THEN
		ALTER TABLE "categories"
		ADD CONSTRAINT "categories_user_id_users_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_categories_user_kind_name_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_categories_user_kind_name_unique" ON "categories" USING btree ("user_id", "kind", lower("name")) WHERE "categories"."user_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_categories_global_kind_name_unique" ON "categories" USING btree ("kind", lower("name")) WHERE "categories"."user_id" IS NULL;