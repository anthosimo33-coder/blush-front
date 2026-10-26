ALTER TABLE "ai_usage" ADD COLUMN "population" text;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_user_idx" ON "ai_usage" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_usage_a_ranger_idx" ON "ai_usage" USING btree ("id") WHERE "ai_usage"."population" is null;