CREATE TABLE "decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"triage_run_id" text NOT NULL,
	"action" text NOT NULL,
	"reviewer" text NOT NULL,
	"note" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"sequence" bigserial NOT NULL,
	CONSTRAINT "decisions_action_is_recorded" CHECK ("decisions"."action" in ('approve', 'request_info', 'escalate')),
	CONSTRAINT "decisions_reviewer_is_named" CHECK (length(btrim("decisions"."reviewer", E' \t\n\r\f\v')) > 0),
	CONSTRAINT "decisions_note_carries_reasoning" CHECK (length(btrim("decisions"."note", E' \t\n\r\f\v')) > 0)
);
--> statement-breakpoint
CREATE TABLE "triage_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"facts" jsonb NOT NULL,
	"mapping" jsonb NOT NULL,
	"missing_evidence" jsonb NOT NULL,
	"escalation" jsonb NOT NULL,
	"policy_version" text NOT NULL,
	"model" text NOT NULL,
	"slack_delivery" text,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"sequence" bigserial NOT NULL,
	CONSTRAINT "triage_runs_slack_delivery_recorded" CHECK ("triage_runs"."slack_delivery" is null or "triage_runs"."slack_delivery" in ('delivered', 'not_configured') or "triage_runs"."slack_delivery" like 'failed:%'),
	CONSTRAINT "triage_runs_escalation_has_a_delivery_state" CHECK (("triage_runs"."escalation"->>'escalate' = 'true') = ("triage_runs"."slack_delivery" is not null))
);
--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_triage_run_id_triage_runs_id_fk" FOREIGN KEY ("triage_run_id") REFERENCES "public"."triage_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triage_runs" ADD CONSTRAINT "triage_runs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;