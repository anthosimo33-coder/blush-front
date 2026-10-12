ALTER TABLE "rate_limits" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "ai_usage_created_idx" ON "ai_usage" USING btree ("created_at");