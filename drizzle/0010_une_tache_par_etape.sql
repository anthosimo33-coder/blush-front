-- Rejouable sans erreur (IF NOT EXISTS) : d’autres migrations arrivent en parallèle sur main.
-- Avant l’index : s’il reste en base deux étapes identiques en attente pour une histoire (planifiées en double),
-- seule la plus récente reste en attente ; les autres passent en échec (« doublon »), sans rien effacer.
UPDATE "tasks" SET "status" = 'echec', "error" = 'doublon', "updated_at" = now()
WHERE "id" IN (
	SELECT "id" FROM (
		SELECT "id", row_number() OVER (PARTITION BY "story_id", "kind" ORDER BY ("status" = 'en_cours') DESC, "created_at" DESC) AS "rang"
		FROM "tasks"
		WHERE "status" IN ('attente', 'en_cours') AND "kind" IN ('verdict', 'rapport_plan', 'rapport_chapitres', 'vocal', 'memoire')
	) AS "doubles"
	WHERE "rang" > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tasks_une_par_etape" ON "tasks" USING btree ("story_id","kind") WHERE "tasks"."status" in ('attente', 'en_cours') and "tasks"."kind" in ('verdict', 'rapport_plan', 'rapport_chapitres', 'vocal', 'memoire');
