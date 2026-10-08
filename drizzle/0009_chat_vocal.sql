-- Rejouable sans erreur (IF NOT EXISTS) : d’autres migrations arrivent en parallèle sur main
CREATE TABLE IF NOT EXISTS "chat_vocals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"story_id" uuid NOT NULL,
	"voix" text NOT NULL,
	"audio" "bytea" NOT NULL,
	"duree_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN IF NOT EXISTS "chat_vocal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "chat_vocals" ADD CONSTRAINT "chat_vocals_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_vocals_story_idx" ON "chat_vocals" USING btree ("story_id");
