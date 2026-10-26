CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid,
	"envoi" text NOT NULL,
	"type" text NOT NULL,
	"appli" text NOT NULL,
	"ecrans" integer DEFAULT 0 NOT NULL,
	"lots" integer DEFAULT 0 NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "imports_story_id_unique" UNIQUE("story_id"),
	CONSTRAINT "imports_envoi_unique" UNIQUE("envoi")
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "envoi" text;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "imports_cree_idx" ON "imports" USING btree ("cree_le");--> statement-breakpoint
CREATE INDEX "ai_usage_envoi_idx" ON "ai_usage" USING btree ("envoi");