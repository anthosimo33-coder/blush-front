CREATE TABLE "lots" (
	"id" text PRIMARY KEY NOT NULL,
	"tache_id" uuid,
	"story_id" uuid,
	"user_id" uuid,
	"envoye_le" timestamp with time zone DEFAULT now() NOT NULL,
	"annule_le" timestamp with time zone,
	"lu_le" timestamp with time zone,
	"traite_le" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "lot_avant" "bytea";--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_tache_id_tasks_id_fk" FOREIGN KEY ("tache_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;