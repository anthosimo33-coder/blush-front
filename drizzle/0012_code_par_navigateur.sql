-- Un code de connexion par email et par navigateur (src/server/auth.ts) : le code ne vaut que dans le navigateur qui l’a
-- demandé. Les codes en cours sont effacés (ils n’ont pas de navigateur) : qui en attendait un le redemande.
DELETE FROM "login_codes";--> statement-breakpoint
ALTER TABLE "login_codes" DROP CONSTRAINT IF EXISTS "login_codes_pkey";--> statement-breakpoint
ALTER TABLE "login_codes" ADD COLUMN "navigateur" text NOT NULL;--> statement-breakpoint
ALTER TABLE "login_codes" ADD CONSTRAINT "login_codes_email_navigateur_pk" PRIMARY KEY("email","navigateur");
