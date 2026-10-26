ALTER TABLE "login_codes" ADD COLUMN "revenu_le" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "login_codes_navigateur_idx" ON "login_codes" USING btree ("navigateur");