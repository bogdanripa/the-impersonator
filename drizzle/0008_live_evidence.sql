CREATE TABLE "live_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"query" text NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"quote" text NOT NULL,
	"speaker" text NOT NULL,
	"is_anchor" boolean NOT NULL,
	"summary" text NOT NULL,
	"content_hash" text,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "live_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "live_evidence" ADD CONSTRAINT "live_evidence_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "live_evidence_conversation" ON "live_evidence" USING btree ("conversation_id");