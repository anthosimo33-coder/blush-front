CREATE TABLE "effacements" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"quoi" text NOT NULL,
	"cible" text NOT NULL,
	"le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erreurs_navigateur" (
	"jour" date NOT NULL,
	"signature" text NOT NULL,
	"nom" text NOT NULL,
	"message" text NOT NULL,
	"source" text,
	"etape" text NOT NULL,
	"famille" text NOT NULL,
	"fois" integer DEFAULT 1 NOT NULL,
	"premiere_le" timestamp with time zone DEFAULT now() NOT NULL,
	"derniere_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "erreurs_navigateur_jour_signature_pk" PRIMARY KEY("jour","signature")
);
--> statement-breakpoint
CREATE TABLE "mesures_navigateur" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"le" timestamp with time zone DEFAULT now() NOT NULL,
	"etape" text NOT NULL,
	"mobile" boolean NOT NULL,
	"metrique" text NOT NULL,
	"valeur" real NOT NULL
);
--> statement-breakpoint
CREATE INDEX "effacements_le_idx" ON "effacements" USING btree ("le");--> statement-breakpoint
CREATE INDEX "erreurs_navigateur_derniere_idx" ON "erreurs_navigateur" USING btree ("derniere_le");--> statement-breakpoint
CREATE INDEX "mesures_navigateur_le_idx" ON "mesures_navigateur" USING btree ("le");