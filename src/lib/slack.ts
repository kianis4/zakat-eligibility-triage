import type { CampaignInput } from "./campaign";
import type { EscalationDecision, EscalationReason } from "./escalation";

export class SlackConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlackConfigError";
  }
}

export class SlackDeliveryError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SlackDeliveryError";
    this.status = status;
  }
}

export type SlackPostOptions = {
  /** Defaults to `process.env.SLACK_WEBHOOK_URL`. */
  webhookUrl?: string;
  /** Base URL the reviewer UI is served from. Defaults to `process.env.APP_BASE_URL`. */
  appBaseUrl?: string;
  /** Injected so the suite proves what was sent without reaching the network. */
  fetch?: typeof globalThis.fetch;
};

/**
 * The kinds, as a person reading a channel would say them.
 *
 * The identifiers are ours and mean nothing to the reviewer who opens Slack on a Friday
 * afternoon. What they need on the first line is which kind of question is waiting.
 */
const REASON_LABELS: Record<EscalationReason["kind"], string> = {
  mixed_use: "Mixed use",
  scholarly_difference: "Scholarly difference",
  claim_without_support: "Eligibility claimed, nothing supporting it",
  nothing_resolvable: "Nothing resolvable from the story",
};

/**
 * Slack reads `&`, `<` and `>` as markup, so campaign text containing them would render as
 * something the organizer did not write. The quoted spans are the part of this message a
 * reviewer is meant to trust as verbatim, so they have to survive the trip intact.
 */
function escapeForSlack(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function sectionFor(reason: EscalationReason) {
  const lines = [
    escapeForSlack(REASON_LABELS[reason.kind]),
    `*${escapeForSlack(reason.question)}*`,
    ...reason.citations.map((citation) => `> ${escapeForSlack(citation.quote)}`),
  ];

  return { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } };
}

function blocksFor(campaign: CampaignInput, reasons: readonly EscalationReason[], link: string | null) {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: `Escalated, not determined: ${campaign.title}` },
    },
    { type: "context", elements: [{ type: "mrkdwn", text: `Campaign \`${campaign.id}\`` }] },
    ...reasons.map(sectionFor),
    ...(link === null
      ? []
      : [{ type: "section", text: { type: "mrkdwn", text: `<${link}|Open the triage file>` } }]),
  ];
}

/**
 * Posts a refusal to a Slack incoming webhook, so the question reaches a reviewer rather
 * than waiting in a database for someone to go looking.
 *
 * There is no retry. A webhook post either lands or it does not, and a retry loop buried in
 * here would decide on the caller's behalf how long the campaign waits and how many copies
 * of the same refusal a channel gets. The caller knows whether this ran inside a request or
 * inside a queue worker that already has a retry policy, so the error goes to them.
 *
 * A missing webhook URL throws rather than returning quietly. The alternative is a system
 * that appears to escalate and does not, which is the worst available failure here: the
 * campaign stalls looking handled, and nobody learns it stalled.
 *
 * Calling this with a decision that did not escalate is a programmer error, not a no-op.
 * Nothing else in the pipeline has anything to say to a channel, so a call that gets here
 * with `escalate: false` means the caller lost track of what it was holding.
 */
export async function postEscalationToSlack(
  campaign: CampaignInput,
  decision: EscalationDecision,
  options: SlackPostOptions = {},
): Promise<void> {
  if (!decision.escalate) {
    throw new Error(
      `Campaign ${campaign.id} did not escalate, so there is no refusal to post to Slack.`,
    );
  }

  const webhookUrl = options.webhookUrl ?? process.env.SLACK_WEBHOOK_URL;

  if (webhookUrl === undefined || webhookUrl === "") {
    throw new SlackConfigError(
      "No Slack webhook URL is configured. Set SLACK_WEBHOOK_URL or pass webhookUrl.",
    );
  }

  const appBaseUrl = options.appBaseUrl ?? process.env.APP_BASE_URL;
  const link =
    appBaseUrl === undefined || appBaseUrl === ""
      ? null
      : `${appBaseUrl.replace(/\/+$/, "")}/campaigns/${campaign.id}`;

  const post = options.fetch ?? globalThis.fetch;

  const response = await post(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ blocks: blocksFor(campaign, decision.reasons, link) }),
  });

  if (response.status < 200 || response.status >= 300) {
    throw new SlackDeliveryError(
      response.status,
      `Slack rejected the escalation for campaign ${campaign.id} with status ${response.status}.`,
    );
  }
}
