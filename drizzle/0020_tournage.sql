CREATE TABLE "tournages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"story_id" uuid NOT NULL,
	"cle" "bytea" NOT NULL,
	"cle_hash" text NOT NULL,
	"cree_par_id" uuid,
	"arrete_le" timestamp with time zone,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournages_cle_hash_unique" UNIQUE("cle_hash")
);
--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "tournage_id" uuid;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "tournage_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tournages" ADD CONSTRAINT "tournages_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournages" ADD CONSTRAINT "tournages_cree_par_id_users_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_tournage_id_tournages_id_fk" FOREIGN KEY ("tournage_id") REFERENCES "public"."tournages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stories_tournage_idx" ON "stories" USING btree ("tournage_id");