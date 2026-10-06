DROP TABLE "decisions" CASCADE;--> statement-breakpoint
ALTER TABLE "triage_runs" DROP CONSTRAINT "triage_runs_campaign_id_id_key";--> statement-breakpoint
ALTER TABLE "triage_runs" DROP CONSTRAINT "triage_runs_slack_delivery_recorded";--> statement-breakpoint
ALTER TABLE "triage_runs" DROP CONSTRAINT "triage_runs_escalation_has_a_delivery_state";--> statement-breakpoint
ALTER TABLE "triage_runs" DROP COLUMN "slack_delivery";