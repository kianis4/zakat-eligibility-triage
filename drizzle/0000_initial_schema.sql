CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."precedent_decision" AS ENUM('approved', 'declined', 'info_requested');--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"story" text NOT NULL,
	"category" text NOT NULL,
	"goal_amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"organizer_name" text NOT NULL,
	"organizer_location" text NOT NULL,
	"organizer_relationship_to_beneficiary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "precedents" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"story" text NOT NULL,
	"category_outcomes" jsonb NOT NULL,
	"decision" "precedent_decision" NOT NULL,
	"reviewer_note" text NOT NULL,
	"decided_at" timestamp with time zone NOT NULL,
	"embedding" vector(1536) NOT NULL
);
--> statement-breakpoint
CREATE INDEX "precedents_embedding_cosine_idx" ON "precedents" USING hnsw ("embedding" vector_cosine_ops);