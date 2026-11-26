CREATE TABLE "linkedin_scrapes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"actor" text NOT NULL,
	"items" integer NOT NULL,
	"cost_usd" double precision NOT NULL,
	"ok" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "linkedin_pages" ADD COLUMN "pending_since" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "linkedin_scrapes_created" ON "linkedin_scrapes" USING btree ("created_at");