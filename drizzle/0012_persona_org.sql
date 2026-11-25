ALTER TABLE "personas" ADD COLUMN "org" text;--> statement-breakpoint
-- Before spaces existed, only genezio.com / genez.io Workspace accounts could sign in: they own everything so far.
UPDATE "personas" SET "org" = 'genezio.com' WHERE "org" IS NULL;--> statement-breakpoint
ALTER TABLE "personas" ALTER COLUMN "org" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "personas_org" ON "personas" USING btree ("org");
