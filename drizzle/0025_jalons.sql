CREATE TABLE "jalons" (
	"jour" date NOT NULL,
	"empreinte" text NOT NULL,
	"jalon" text NOT NULL,
	"le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jalons_jour_empreinte_jalon_pk" PRIMARY KEY("jour","empreinte","jalon")
);
--> statement-breakpoint
CREATE INDEX "jalons_le_idx" ON "jalons" USING btree ("le");