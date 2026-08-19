ALTER TABLE "triage_runs" ADD CONSTRAINT "triage_runs_campaign_id_id_key" UNIQUE("campaign_id","id");--> statement-breakpoint
ALTER TABLE "decisions" DROP CONSTRAINT "decisions_triage_run_id_triage_runs_id_fk";--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_campaign_id_triage_run_id_triage_runs_campaign_id_id_fk" FOREIGN KEY ("campaign_id","triage_run_id") REFERENCES "public"."triage_runs"("campaign_id","id") ON DELETE no action ON UPDATE no action;
