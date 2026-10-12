CREATE TABLE "actions_equipe" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"par_id" uuid,
	"action" text NOT NULL,
	"compte_id" uuid,
	"nombre" integer NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "relances_coupees_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "invite_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "actions_equipe" ADD CONSTRAINT "actions_equipe_par_id_users_id_fk" FOREIGN KEY ("par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions_equipe" ADD CONSTRAINT "actions_equipe_compte_id_users_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actions_equipe_cree_idx" ON "actions_equipe" USING btree ("cree_le");--> statement-breakpoint
CREATE INDEX "waitlist_a_inviter_idx" ON "waitlist" USING btree ("created_at") WHERE "waitlist"."invite_le" is null;