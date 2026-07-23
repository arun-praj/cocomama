ALTER TABLE "budgets" ADD COLUMN "recurring_contribution" numeric(14, 2);
--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "contribution_cadence" text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "notification_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "notification_cadence" text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "notification_day_of_month" integer;
--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "notification_until_paid_off" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "next_notification_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_recurring_contribution_positive" CHECK ("budgets"."recurring_contribution" IS NULL OR "budgets"."recurring_contribution" > 0);
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_contribution_cadence_valid" CHECK ("budgets"."contribution_cadence" IN ('none', 'monthly'));
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_notification_cadence_valid" CHECK ("budgets"."notification_cadence" IN ('none', 'once', 'daily', 'monthly'));
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_notification_day_valid" CHECK ("budgets"."notification_day_of_month" IS NULL OR ("budgets"."notification_day_of_month" >= 1 AND "budgets"."notification_day_of_month" <= 31));
--> statement-breakpoint
CREATE TABLE "budget_notification_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"app_delivered_at" timestamp with time zone,
	"browser_delivered_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget_notification_logs" ADD CONSTRAINT "budget_notification_logs_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "budget_notification_logs" ADD CONSTRAINT "budget_notification_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_budget_notification_logs_budget_scheduled" ON "budget_notification_logs" USING btree ("budget_id", "scheduled_for");
--> statement-breakpoint
CREATE INDEX "idx_budget_notification_logs_user_created" ON "budget_notification_logs" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX "idx_budgets_user_next_notification" ON "budgets" USING btree ("user_id", "next_notification_at");