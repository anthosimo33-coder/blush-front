CREATE TABLE "counters" (
	"day" date NOT NULL,
	"key" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "counters_day_key_pk" PRIMARY KEY("day","key")
);
