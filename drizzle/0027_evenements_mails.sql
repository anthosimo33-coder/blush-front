CREATE TABLE "evenements_mails" (
	"id" text PRIMARY KEY NOT NULL,
	"le" timestamp with time zone DEFAULT now() NOT NULL,
	"type" text NOT NULL,
	"sorte" text NOT NULL,
	"compte_id" uuid
);
--> statement-breakpoint
ALTER TABLE "evenements_mails" ADD CONSTRAINT "evenements_mails_compte_id_users_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evenements_mails_le_idx" ON "evenements_mails" USING btree ("le");