CREATE TABLE "persona_souls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"persona_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"sections" jsonb NOT NULL,
	"sheet" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "persona_souls" ADD CONSTRAINT "persona_souls_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "persona_souls_persona_version" ON "persona_souls" USING btree ("persona_id","version");