ALTER TABLE "achats" ADD COLUMN "population" text;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "population" text;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "sans_compte" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "ai_usage_a_ranger_idx" ON "ai_usage" USING btree ("id") WHERE "ai_usage"."population" is null;