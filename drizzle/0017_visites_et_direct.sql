CREATE TABLE "fil_direct" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"le" timestamp with time zone DEFAULT now() NOT NULL,
	"genre" text NOT NULL,
	"ville" text,
	"source" text,
	"offre" text,
	"ref" text
);
--> statement-breakpoint
CREATE TABLE "presences" (
	"onglet" uuid NOT NULL,
	"minute" timestamp with time zone NOT NULL,
	"vu_le" timestamp with time zone DEFAULT now() NOT NULL,
	"etape" text NOT NULL,
	"source" text NOT NULL,
	"ville" text,
	"pays" text,
	"lat" real,
	"lon" real,
	CONSTRAINT "presences_onglet_minute_pk" PRIMARY KEY("onglet","minute")
);
--> statement-breakpoint
CREATE TABLE "sels_des_visites" (
	"jour" date PRIMARY KEY NOT NULL,
	"sel" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visites" (
	"jour" date NOT NULL,
	"empreinte" text NOT NULL,
	"source" text NOT NULL,
	"arrive_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visites_jour_empreinte_pk" PRIMARY KEY("jour","empreinte")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "source" text;--> statement-breakpoint
CREATE INDEX "fil_direct_le_idx" ON "fil_direct" USING btree ("le");--> statement-breakpoint
CREATE INDEX "fil_direct_ref_idx" ON "fil_direct" USING btree ("ref");--> statement-breakpoint
CREATE INDEX "presences_vu_idx" ON "presences" USING btree ("vu_le");--> statement-breakpoint
CREATE INDEX "presences_minute_idx" ON "presences" USING btree ("minute");--> statement-breakpoint
CREATE INDEX "visites_arrive_idx" ON "visites" USING btree ("arrive_le");