-- Un code de connexion par email et par navigateur (src/server/auth.ts) : le code ne vaut que dans le navigateur qui l’a
-- demandé. Les codes en cours sont effacés (ils n’ont pas de navigateur) : qui en attendait un le redemande.
-- Les sessions déjà ouvertes passent à un mois au plus, la durée d’une session (S-16) : leur cookie change de nom
-- (__Host- en https), personne ne les renvoie plus, et leur secret ne vaut pas plus longtemps qu’une session neuve.
-- Mise en production : Vercel applique cette migration au build, quand l’ancien code sert encore. Le temps du build,
-- l’ancien /api/auth/code répond 500 (son ON CONFLICT (email) n’a plus de contrainte, et `navigateur` lui manque) : à
-- déployer à une heure creuse, comme « chacun se reconnecte une fois ».
DELETE FROM "login_codes";--> statement-breakpoint
ALTER TABLE "login_codes" DROP CONSTRAINT IF EXISTS "login_codes_pkey";--> statement-breakpoint
ALTER TABLE "login_codes" ADD COLUMN "navigateur" text NOT NULL;--> statement-breakpoint
ALTER TABLE "login_codes" ADD CONSTRAINT "login_codes_email_navigateur_pk" PRIMARY KEY("email","navigateur");--> statement-breakpoint
UPDATE "sessions" SET "expires_at" = least("expires_at", now() + interval '30 days');
