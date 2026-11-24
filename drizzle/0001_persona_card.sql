ALTER TABLE "personas" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "summary_insight_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "summary_story_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;