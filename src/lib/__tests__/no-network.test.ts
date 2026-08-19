import { describe, expect, it } from "vitest";

import type { CampaignInput } from "../campaign";
import type { EscalationDecision } from "../escalation";
import { postEscalationToSlack } from "../slack";

const campaign: CampaignInput = {
  id: "cmp_0401",
  title: "A campaign no test should be able to post about",
  story: "The family owe four months of rent and cannot clear it from what they earn.",
  category: "Housing",
  goalAmount: 4200,
  currency: "GBP",
  organizer: { name: "Ifeoma Bello", location: "London, United Kingdom" },
};

const escalated: EscalationDecision = {
  escalate: true,
  reasons: [
    {
      kind: "nothing_resolvable",
      question: "Should the organizer be asked for the missing information?",
      citations: [],
    },
  ],
};

/**
 * The guard in `vitest.setup.ts` is only worth having if it is wired in, and a setup file
 * that stops being loaded fails silently: the suite keeps passing and the protection is gone.
 * So the guard gets asserted like anything else.
 */
describe("the unit suite cannot reach the network", () => {
  it("refuses a bare fetch", () => {
    expect(() => globalThis.fetch("https://hooks.slack.com/services/T0/B0/X")).toThrow(
      /unexpected network call in unit tests/,
    );
  });

  it("catches a Slack post that forgot to inject a fetch", async () => {
    await expect(
      postEscalationToSlack(campaign, escalated, {
        webhookUrl: "https://hooks.slack.com/services/T0/B0/X",
      }),
    ).rejects.toThrow(/unexpected network call in unit tests/);
  });
});
