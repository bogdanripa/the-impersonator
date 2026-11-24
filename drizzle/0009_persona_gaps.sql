CREATE TABLE "persona_gaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"persona_id" uuid NOT NULL,
	"conversation_id" uuid,
	"question" text NOT NULL,
	"note" text,
	"asked_by" text,
	"live_tried" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "persona_gaps" ADD CONSTRAINT "persona_gaps_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persona_gaps" ADD CONSTRAINT "persona_gaps_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "persona_gaps_persona" ON "persona_gaps" USING btree ("persona_id");