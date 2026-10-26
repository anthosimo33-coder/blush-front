CREATE TABLE "jalons_par_appli" (
	"jour" date NOT NULL,
	"empreinte" text NOT NULL,
	"jalon" text NOT NULL,
	"appli" text NOT NULL,
	"le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jalons_par_appli_jour_empreinte_jalon_appli_pk" PRIMARY KEY("jour","empreinte","jalon","appli")
);
--> statement-breakpoint
CREATE INDEX "jalons_par_appli_le_idx" ON "jalons_par_appli" USING btree ("le");