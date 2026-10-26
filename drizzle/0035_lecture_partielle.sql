CREATE TABLE "ecrans_gardes" (
	"envoi" text NOT NULL,
	"rang" smallint NOT NULL,
	"story_id" uuid,
	"medias" text[] NOT NULL,
	"tailles" integer[] NOT NULL,
	"data" "bytea" NOT NULL,
	"lu" "bytea",
	"saute" boolean DEFAULT false NOT NULL,
	"expire_le" timestamp with time zone NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ecrans_gardes_envoi_rang_pk" PRIMARY KEY("envoi","rang")
);
--> statement-breakpoint
CREATE TABLE "suites_video" (
	"story_id" uuid PRIMARY KEY NOT NULL,
	"envoi" text NOT NULL,
	"recents" "bytea" NOT NULL,
	"appli" text NOT NULL,
	"jour" text NOT NULL,
	"ecrans" integer NOT NULL,
	"lots" integer NOT NULL,
	"payee_le" timestamp with time zone,
	"expire_le" timestamp with time zone NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "bras" text;--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "lots_gardes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "suite" text;--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "contrefactuel" text;--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "lots_epargnables" integer;--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "titre" text;--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "titre_entier" text;--> statement-breakpoint
ALTER TABLE "ecrans_gardes" ADD CONSTRAINT "ecrans_gardes_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suites_video" ADD CONSTRAINT "suites_video_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ecrans_gardes_story_idx" ON "ecrans_gardes" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "ecrans_gardes_expire_idx" ON "ecrans_gardes" USING btree ("expire_le");--> statement-breakpoint
CREATE INDEX "suites_video_expire_idx" ON "suites_video" USING btree ("expire_le");