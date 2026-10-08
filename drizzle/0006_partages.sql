CREATE TABLE "shares" (
	"id" text PRIMARY KEY NOT NULL,
	"story_id" uuid NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shares_story_id_unique" UNIQUE("story_id")
);
--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;