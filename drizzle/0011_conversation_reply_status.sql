ALTER TABLE "conversations" ADD COLUMN "forked_from" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "reply_status" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "reply_error" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "reply_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_forked_from_conversations_id_fk" FOREIGN KEY ("forked_from") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;