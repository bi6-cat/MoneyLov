CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"number" text,
	"import_source" text,
	"opening_balance" bigint DEFAULT 0 NOT NULL,
	"credit_limit" bigint,
	"color" text DEFAULT '#64748b' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_import_source_unique" UNIQUE("import_source")
);
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"scopes" text[] NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer,
	"month" text NOT NULL,
	"amount" bigint NOT NULL,
	"rollover" boolean DEFAULT false NOT NULL,
	"basis" text DEFAULT 'mine' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"parent_id" integer,
	"icon" text DEFAULT 'circle' NOT NULL,
	"color" text DEFAULT '#94a3b8' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_id" integer NOT NULL,
	"ext_id" text,
	"counterparty" text,
	"raw_content" text,
	"amount" bigint NOT NULL,
	"suggested" jsonb,
	"final" jsonb NOT NULL,
	"question" text,
	"answer" text,
	"changed" boolean NOT NULL,
	"by" text NOT NULL,
	"rule_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"filename" text,
	"checksum" text NOT NULL,
	"version" integer NOT NULL,
	"period_id" integer,
	"stats" jsonb NOT NULL,
	"checks" jsonb NOT NULL,
	"reconciliation" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"loan_id" integer NOT NULL,
	"amount" bigint NOT NULL,
	"paid_at" date NOT NULL,
	"transaction_id" integer,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" serial PRIMARY KEY NOT NULL,
	"person" text NOT NULL,
	"direction" text NOT NULL,
	"amount" bigint NOT NULL,
	"started_at" date NOT NULL,
	"due_at" date,
	"period_id" integer,
	"note" text,
	"closed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"paid_by" text,
	"sheet_column" text,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"rent_total" bigint,
	"carried_override" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"snapshot" jsonb,
	"closed_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"amount" bigint NOT NULL,
	"direction" text DEFAULT 'out' NOT NULL,
	"frequency" text NOT NULL,
	"day_of_period" integer DEFAULT 1 NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"account_id" integer,
	"category_id" integer,
	"match_counterparty" text,
	"tolerance_pct" integer DEFAULT 10 NOT NULL,
	"tolerance_days" integer DEFAULT 5 NOT NULL,
	"suggestion" jsonb,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"match" jsonb NOT NULL,
	"action" jsonb NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"confirmations" integer DEFAULT 0 NOT NULL,
	"overrides" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_id" integer NOT NULL,
	"person" text NOT NULL,
	"amount" bigint NOT NULL,
	"transaction_id" integer,
	"paid_at" timestamp NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlements_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE "splits" (
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_id" integer,
	"period_id" integer NOT NULL,
	"title" text NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"is_rent" boolean DEFAULT false NOT NULL,
	"config" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"category_id" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "splits_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"ext_id" text,
	"account_id" integer,
	"occurred_at" timestamp NOT NULL,
	"amount" bigint NOT NULL,
	"direction" text NOT NULL,
	"kind" text,
	"category_id" integer,
	"scope" text,
	"title" text,
	"counterparty" text,
	"counterparty_account" text,
	"counterparty_bank" text,
	"raw_content" text DEFAULT '' NOT NULL,
	"note" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"suggestion" jsonb,
	"confidence" text DEFAULT 'nghi' NOT NULL,
	"question" text,
	"answer" text,
	"pair_ext_id" text,
	"rule_id" integer,
	"person" text,
	"to_account_id" integer,
	"loan_id" integer,
	"period_id" integer,
	"batch_id" integer,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_ext_id_unique" UNIQUE("ext_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "budget_cat_month" ON "budgets" USING btree ("category_id","month");--> statement-breakpoint
CREATE INDEX "decision_tx" ON "decisions" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "tx_occurred" ON "transactions" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "tx_status" ON "transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tx_period" ON "transactions" USING btree ("period_id");