CREATE TABLE "app_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"org" text,
	"actor" text,
	"kind" text NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"persona_id" uuid,
	"conversation_id" uuid,
	"run_id" uuid,
	"duration_ms" integer,
	"data" jsonb
);
--> statement-breakpoint
CREATE INDEX "app_events_org_created" ON "app_events" USING btree ("org","created_at");--> statement-breakpoint
CREATE INDEX "app_events_persona" ON "app_events" USING btree ("persona_id");