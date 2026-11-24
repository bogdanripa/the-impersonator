CREATE TYPE "public"."element_category" AS ENUM('trait', 'opinion', 'budget', 'responsibility', 'belief', 'goal', 'pain_point', 'decision_process', 'objection', 'language', 'history');--> statement-breakpoint
CREATE TYPE "public"."insight_kind" AS ENUM('belief', 'opinion', 'budget', 'responsibility', 'team_structure', 'pain_point', 'goal', 'behavior', 'decision_process', 'objection', 'trait', 'language', 'history');--> statement-breakpoint
CREATE TYPE "public"."persona_status" AS ENUM('draft', 'discovering', 'reviewing', 'extracting', 'synthesizing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('candidate', 'approved', 'rejected', 'fetch_failed', 'extracted', 'no_evidence');--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"persona_id" uuid NOT NULL,
	"persona_version" integer NOT NULL,
	"title" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"persona_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"kind" "insight_kind" NOT NULL,
	"summary" text NOT NULL,
	"quote" text NOT NULL,
	"quote_offset" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"inner_thought" text,
	"insight_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"story_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ungrounded" boolean DEFAULT false NOT NULL,
	"raw" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "persona_elements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"persona_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"category" "element_category" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"disagreement" text,
	"basis" text DEFAULT 'peers' NOT NULL,
	"insight_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"story_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text DEFAULT 'Untitled persona' NOT NULL,
	"status" "persona_status" DEFAULT 'draft' NOT NULL,
	"status_detail" text,
	"icp" jsonb,
	"builder_messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rejections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"persona_id" uuid NOT NULL,
	"source_id" uuid,
	"stage" text NOT NULL,
	"item" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"persona_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"question" text NOT NULL,
	"status" text NOT NULL,
	"answer" text,
	"basis" text,
	"insight_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"story_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"persona_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"publisher" text,
	"published_at" text,
	"origin" text DEFAULT 'discovered' NOT NULL,
	"tier" text DEFAULT 'peer' NOT NULL,
	"claimed_subject_name" text,
	"claimed_subject_role" text,
	"fit_reason" text,
	"fit_score" integer,
	"status" "source_status" DEFAULT 'candidate' NOT NULL,
	"subject_id" uuid,
	"content_text" text,
	"content_hash" text,
	"fetched_at" timestamp with time zone,
	"error" text,
	"accepted_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"persona_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"title" text NOT NULL,
	"situation" text NOT NULL,
	"action" text NOT NULL,
	"outcome" text NOT NULL,
	"lesson" text,
	"quote" text NOT NULL,
	"quote_offset" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"persona_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"role" text,
	"organization" text,
	"identity_quote" text,
	"identity_source_id" uuid,
	"kind" text DEFAULT 'person' NOT NULL,
	"is_anchor" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persona_elements" ADD CONSTRAINT "persona_elements_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rejections" ADD CONSTRAINT "rejections_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rejections" ADD CONSTRAINT "rejections_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_answers" ADD CONSTRAINT "research_answers_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "insights_persona" ON "insights" USING btree ("persona_id");--> statement-breakpoint
CREATE INDEX "messages_conversation" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "elements_persona_version" ON "persona_elements" USING btree ("persona_id","version");--> statement-breakpoint
CREATE INDEX "answers_persona_version" ON "research_answers" USING btree ("persona_id","version");--> statement-breakpoint
CREATE INDEX "sources_persona" ON "sources" USING btree ("persona_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_persona_url" ON "sources" USING btree ("persona_id","url");--> statement-breakpoint
CREATE INDEX "stories_persona" ON "stories" USING btree ("persona_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_persona_name" ON "subjects" USING btree ("persona_id","name_key");