ALTER TABLE "users" ADD COLUMN "code_parrainage" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "parrain_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_parrain_id_users_id_fk" FOREIGN KEY ("parrain_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_code_parrainage_unique" UNIQUE("code_parrainage");