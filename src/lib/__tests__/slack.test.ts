import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { CampaignInput } from "../campaign";
import type { EscalationDecision } from "../escalation";
import { SlackConfigError, SlackDeliveryError, postEscalationToSlack } from "../slack";

const webhookUrl = "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX";

const campaign: CampaignInput = {
  id: "cmp_0301",
  title: "Clearing the Sabri family's debt and reopening the Alder Road centre",
  story:
    "Part of what we raise will clear that debt in full. The rest will go to the community centre on Alder Road.",
  category: "Community",
  goalAmount: 22000,
  currency: "GBP",
  organizer: { name: "Yusuf Adeyemi", location: "Birmingham, United Kingdom" },
};

const mixedUseQuestion =
  "The campaign puts the money it raises to more than one use. Part of the money clears the Sabri family's debt and the rest funds the community centre. Which portion of the amount raised does each of those uses account for, and can the portion that is zakat eligible be ring-fenced from the rest?";

const escalated: EscalationDecision = {
  escalate: true,
  reasons: [
    {
      kind: "mixed_use",
      question: mixedUseQuestion,
      citations: [
        { quote: "Part of what we raise will clear that debt in full.", start: 0, end: 50 },
        { quote: "The rest will go to the community centre on Alder Road", start: 51, end: 105 },
      ],
    },
  ],
};

type Call = { url: string; init: RequestInit | undefined };

function fetchReturning(status: number): { fetch: typeof globalThis.fetch; calls: Call[] } {
  const calls: Call[] = [];

  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return { status, ok: status >= 200 && status < 300 } as Response;
  }) as typeof globalThis.fetch;

  return { fetch, calls };
}

function bodyOf(call: Call): string {
  expect(typeof call.init?.body).toBe("string");

  return call.init?.body as string;
}

const environment = { ...process.env };

beforeEach(() => {
  delete process.env.SLACK_WEBHOOK_URL;
  delete process.env.APP_BASE_URL;
});

afterEach(() => {
  process.env = { ...environment };
});

describe("posting a refusal to Slack", () => {
  it("sends one request to the configured webhook and no other", async () => {
    const { fetch, calls } = fetchReturning(200);

    await postEscalationToSlack(campaign, escalated, { webhookUrl, fetch });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(webhookUrl);
    expect(calls[0].init?.method).toBe("POST");
  });

  it("carries the specific question into the message word for word", async () => {
    const { fetch, calls } = fetchReturning(200);

    await postEscalationToSlack(campaign, escalated, { webhookUrl, fetch });

    expect(bodyOf(calls[0])).toContain(mixedUseQuestion);
  });

  it("quotes the cited spans so the reviewer reads the story rather than our summary", async () => {
    const { fetch, calls } = fetchReturning(200);

    await postEscalationToSlack(campaign, escalated, { webhookUrl, fetch });

    const payload = JSON.parse(bodyOf(calls[0]));
    const section = payload.blocks.find(
      (block: { type: string; text?: { text: string } }) =>
        block.type === "section" && block.text?.text.includes(mixedUseQuestion),
    );

    expect(section.text.text).toContain("> Part of what we raise will clear that debt in full.");
    expect(section.text.text).toContain(
      "> The rest will go to the community centre on Alder Road",
    );
  });

  it("names the campaign and the kind of refusal in terms a person reads", async () => {
    const { fetch, calls } = fetchReturning(200);

    await postEscalationToSlack(campaign, escalated, { webhookUrl, fetch });

    const body = bodyOf(calls[0]);

    expect(body).toContain(campaign.title);
    expect(body).toContain(campaign.id);
    expect(body).toContain("Mixed use");
    expect(body).not.toContain("mixed_use");
  });

  it("links to the campaign's file when a base URL is configured", async () => {
    const { fetch, calls } = fetchReturning(200);

    await postEscalationToSlack(campaign, escalated, {
      webhookUrl,
      appBaseUrl: "https://triage.example.org/",
      fetch,
    });

    expect(bodyOf(calls[0])).toContain("https://triage.example.org/campaigns/cmp_0301");
  });

  it("leaves the link out rather than posting a broken one when no base URL is configured", async () => {
    const { fetch, calls } = fetchReturning(200);

    await postEscalationToSlack(campaign, escalated, { webhookUrl, fetch });

    expect(bodyOf(calls[0])).not.toContain("/campaigns/");
  });

  it("reads the webhook and the base URL from the environment when neither is passed", async () => {
    process.env.SLACK_WEBHOOK_URL = webhookUrl;
    process.env.APP_BASE_URL = "https://triage.example.org";

    const { fetch, calls } = fetchReturning(200);

    await postEscalationToSlack(campaign, escalated, { fetch });

    expect(calls[0].url).toBe(webhookUrl);
    expect(bodyOf(calls[0])).toContain("https://triage.example.org/campaigns/cmp_0301");
  });
});

/**
 * The campaign id reaches this module from whatever submitted the campaign, and it lands in
 * a message that a reviewer is being asked to act on. Slack's mrkdwn turns `<!channel>` into
 * a real ping and `<url|text>` into a real link, so an id carrying those reads as the
 * platform itself shouting and offering a one-click approval to somewhere else.
 */
describe("a campaign id that tries to write the message itself", () => {
  const hostileId = "a` <!channel> <https://evil.example.com|URGENT: approve> `b";
  const hostileCampaign: CampaignInput = { ...campaign, id: hostileId };

  it("does not let the id ping the channel or plant a link", async () => {
    const { fetch, calls } = fetchReturning(200);

    await postEscalationToSlack(hostileCampaign, escalated, { webhookUrl, fetch });

    const body = bodyOf(calls[0]);

    expect(body).not.toContain("<!channel>");
    expect(body).not.toContain("<https://evil.example.com|URGENT: approve>");
    expect(body).toContain("&lt;!channel&gt;");
  });

  it("encodes the id into the link rather than letting it end the link", async () => {
    const { fetch, calls } = fetchReturning(200);

    await postEscalationToSlack(hostileCampaign, escalated, {
      webhookUrl,
      appBaseUrl: "https://triage.example.org",
      fetch,
    });

    const payload = JSON.parse(bodyOf(calls[0]));
    const link = payload.blocks.at(-1);

    expect(link.text.text).toBe(
      `<https://triage.example.org/campaigns/${encodeURIComponent(hostileId)}|Open the triage file>`,
    );

    /**
     * The hostile host survives as inert path text, which is fine and is the point: what
     * must not survive is a character that ends the link early. One `|` in the URL and
     * everything after it becomes the link's label, which is how the id would have got a
     * link to somewhere else in front of a reviewer.
     */
    const url = link.text.text.slice(1, link.text.text.indexOf("|"));

    expect(url.startsWith("https://triage.example.org/campaigns/")).toBe(true);
    expect(url).not.toMatch(/[<>|]/);
  });
});

describe("a delivery that does not happen", () => {
  it("refuses to post a decision that did not escalate", async () => {
    const { fetch, calls } = fetchReturning(200);

    await expect(
      postEscalationToSlack(campaign, { escalate: false }, { webhookUrl, fetch }),
    ).rejects.toThrow(/escalate/i);

    expect(calls).toHaveLength(0);
  });

  it("throws rather than skipping quietly when no webhook is configured", async () => {
    const { fetch, calls } = fetchReturning(200);

    await expect(postEscalationToSlack(campaign, escalated, { fetch })).rejects.toBeInstanceOf(
      SlackConfigError,
    );

    expect(calls).toHaveLength(0);
  });

  it("reports the status Slack answered with when the post is rejected", async () => {
    const { fetch, calls } = fetchReturning(404);

    const failure = await postEscalationToSlack(campaign, escalated, {
      webhookUrl,
      fetch,
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(SlackDeliveryError);
    expect((failure as SlackDeliveryError).status).toBe(404);
    expect(calls).toHaveLength(1);
  });

  it("does not retry a rejected post", async () => {
    const { fetch, calls } = fetchReturning(500);

    await expect(
      postEscalationToSlack(campaign, escalated, { webhookUrl, fetch }),
    ).rejects.toBeInstanceOf(SlackDeliveryError);

    expect(calls).toHaveLength(1);
  });
});
