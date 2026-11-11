CREATE TABLE "touchers_lents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"le" timestamp with time zone DEFAULT now() NOT NULL,
	"etape" text NOT NULL,
	"mobile" boolean NOT NULL,
	"famille" text NOT NULL,
	"duree" integer NOT NULL,
	"attente" integer NOT NULL,
	"traitement" integer NOT NULL,
	"affichage" integer NOT NULL,
	"cible" text,
	"script" text
);
--> statement-breakpoint
CREATE INDEX "touchers_lents_le_idx" ON "touchers_lents" USING btree ("le");