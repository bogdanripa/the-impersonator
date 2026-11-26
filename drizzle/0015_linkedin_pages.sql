CREATE TABLE "linkedin_pages" (
	"url" text PRIMARY KEY NOT NULL,
	"title" text,
	"text" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
