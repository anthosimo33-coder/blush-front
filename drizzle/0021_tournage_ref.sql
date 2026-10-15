ALTER TABLE "tournages" ADD COLUMN "ref" text;--> statement-breakpoint
ALTER TABLE "tournages" ADD CONSTRAINT "tournages_ref_unique" UNIQUE("ref");