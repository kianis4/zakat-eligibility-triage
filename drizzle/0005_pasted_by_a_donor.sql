ALTER TABLE "campaigns" ALTER COLUMN "category" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "goal_amount" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "currency" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" DROP COLUMN "organizer_name";--> statement-breakpoint
ALTER TABLE "campaigns" DROP COLUMN "organizer_location";--> statement-breakpoint
ALTER TABLE "campaigns" DROP COLUMN "organizer_relationship_to_beneficiary";