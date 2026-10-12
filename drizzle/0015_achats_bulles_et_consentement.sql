CREATE TABLE "achats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"story_id" uuid,
	"offre" text NOT NULL,
	"centimes" integer NOT NULL,
	"devise" text DEFAULT 'eur' NOT NULL,
	"bulles" integer NOT NULL,
	"offre_unique" text,
	"statut" text DEFAULT 'en_attente' NOT NULL,
	"fournisseur" text NOT NULL,
	"checkout_id" text,
	"paiement_id" text,
	"membre_id" text,
	"moyen_id" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"paye_le" timestamp with time zone,
	"annule_le" timestamp with time zone,
	CONSTRAINT "achats_paiement_id_unique" UNIQUE("paiement_id")
);
--> statement-breakpoint
CREATE TABLE "evenements_paiement" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"recu_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mouvements_bulles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"raison" text NOT NULL,
	"ref" text NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mouvements_bulles_une_fois" UNIQUE("raison","ref"),
	CONSTRAINT "mouvements_bulles_delta" CHECK ("mouvements_bulles"."delta" <> 0)
);
--> statement-breakpoint
CREATE TABLE "offres_uniques" (
	"user_id" uuid NOT NULL,
	"offre" text NOT NULL,
	"story_id" uuid,
	"montree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"expire_le" timestamp with time zone,
	"prise_le" timestamp with time zone,
	CONSTRAINT "offres_uniques_user_id_offre_pk" PRIMARY KEY("user_id","offre")
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "cout" integer;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "verrouillee" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "debloque_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "consentement_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "consentement_version" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bulles" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "achats" ADD CONSTRAINT "achats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achats" ADD CONSTRAINT "achats_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements_bulles" ADD CONSTRAINT "mouvements_bulles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offres_uniques" ADD CONSTRAINT "offres_uniques_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offres_uniques" ADD CONSTRAINT "offres_uniques_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "achats_user_idx" ON "achats" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "achats_story_idx" ON "achats" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "achats_cree_idx" ON "achats" USING btree ("cree_le");--> statement-breakpoint
CREATE INDEX "mouvements_bulles_user_idx" ON "mouvements_bulles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "offres_uniques_montree_idx" ON "offres_uniques" USING btree ("montree_le");--> statement-breakpoint
CREATE INDEX "chat_messages_verrouillees_idx" ON "chat_messages" USING btree ("story_id") WHERE "chat_messages"."verrouillee";