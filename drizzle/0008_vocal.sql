-- Rejouable sans erreur (IF NOT EXISTS) : ces tables sont arrivées en production avant cette migration (sous le nom 0007_vocal)
CREATE TABLE IF NOT EXISTS "vocal_ecoutes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"story_id" uuid NOT NULL,
	"voix" text NOT NULL,
	"evenement" text NOT NULL,
	"position_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vocals" (
	"story_id" uuid PRIMARY KEY NOT NULL,
	"voix" text NOT NULL,
	"data" "bytea" NOT NULL,
	"audio" "bytea" NOT NULL,
	"duree_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "vocal_ecoutes" ADD CONSTRAINT "vocal_ecoutes_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "vocals" ADD CONSTRAINT "vocals_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vocal_ecoutes_voix_idx" ON "vocal_ecoutes" USING btree ("voix","evenement");
