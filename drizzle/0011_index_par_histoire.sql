-- Rejouable sans erreur (IF NOT EXISTS) : d’autres migrations arrivent en parallèle sur main
CREATE INDEX IF NOT EXISTS "ai_usage_story_idx" ON "ai_usage" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vocal_ecoutes_story_idx" ON "vocal_ecoutes" USING btree ("story_id");
