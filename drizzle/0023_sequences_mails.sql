CREATE TABLE "envois_mails" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"story_id" uuid,
	"cle" text NOT NULL,
	"occasion" text NOT NULL,
	"parti" boolean DEFAULT true NOT NULL,
	"envoye_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "conseils_coupes_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "envois_mails" ADD CONSTRAINT "envois_mails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envois_mails" ADD CONSTRAINT "envois_mails_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "envois_mails_occasion_idx" ON "envois_mails" USING btree ("user_id","cle","occasion");--> statement-breakpoint
CREATE INDEX "envois_mails_compte_idx" ON "envois_mails" USING btree ("user_id","envoye_le");