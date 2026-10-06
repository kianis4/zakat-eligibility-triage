CREATE TABLE "analysis_quota" (
	"bucket" text PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"uses" integer NOT NULL
);
