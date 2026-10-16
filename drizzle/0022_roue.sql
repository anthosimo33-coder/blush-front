CREATE TABLE "roue" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"case_tiree" smallint,
	"lot" text,
	"tiree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"expire_le" timestamp with time zone,
	"prise_le" timestamp with time zone,
	"achat_id" uuid
);
--> statement-breakpoint
ALTER TABLE "achats" ADD COLUMN "lot_roue" text;--> statement-breakpoint
ALTER TABLE "roue" ADD CONSTRAINT "roue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roue" ADD CONSTRAINT "roue_achat_id_achats_id_fk" FOREIGN KEY ("achat_id") REFERENCES "public"."achats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "roue_tiree_idx" ON "roue" USING btree ("tiree_le");