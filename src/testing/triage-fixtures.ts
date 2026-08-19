import type { CampaignInput } from "../lib/campaign";
import { POLICY_VERSION, RECIPIENT_CATEGORY_IDS, type RecipientCategory } from "../lib/categories";
import type { EscalationDecision } from "../lib/escalation";
import type { ExtractedFacts } from "../lib/extraction";
import { CategoryMapping, resolveCitation } from "../lib/mapping";
import { buildMissingEvidenceReport } from "../lib/missing-evidence";
import type { NewCampaignRow, NewTriageRunRow } from "../db/schema";

/**
 * A campaign and an agent file over it, for the tests about what may be stored.
 *
 * The values are built through the same parsers the pipeline uses rather than written out
 * as literals, so a fixture that has drifted from the schema fails here instead of making a
 * storage test pass against a shape the pipeline could never produce.
 */
export const FIXTURE_CAMPAIGN: CampaignInput = {
  id: "cmp_fixture_0001",
  title: "Help the Haddad family clear their hospital debt",
  story:
    "My sister was hospitalised for four months last winter. The family borrowed to cover the treatment and cannot repay it.",
  category: "Medical",
  goalAmount: 9000,
  currency: "JOD",
  organizer: {
    name: "Yusuf Haddad",
    location: "Irbid, Jordan",
    relationshipToBeneficiary: "brother",
  },
};

export function campaignRow(campaign: CampaignInput = FIXTURE_CAMPAIGN): NewCampaignRow {
  return {
    id: campaign.id,
    title: campaign.title,
    story: campaign.story,
    category: campaign.category,
    goalAmount: campaign.goalAmount.toFixed(2),
    currency: campaign.currency,
    organizerName: campaign.organizer.name,
    organizerLocation: campaign.organizer.location,
    organizerRelationshipToBeneficiary: campaign.organizer.relationshipToBeneficiary ?? null,
  };
}

export const FIXTURE_FACTS: ExtractedFacts = {
  beneficiary: { kind: "family_member", description: "The organizer's sister." },
  statedPurposes: [
    { purpose: "Repay what the family borrowed", quote: "cannot repay it" },
  ],
  amountsMentioned: [],
  organizerRoleClaim: null,
  hardshipClaims: [{ claim: "A debt the family cannot repay", quote: "cannot repay it" }],
  explicitZakatClaim: { present: false, quote: null },
  fundRecipient: { recipient: "unstated", quote: null },
};

/**
 * A mapping where the named categories came out supported and the rest tell against.
 *
 * Everything else defaults to `not_supported` rather than to `insufficient_evidence`, so a
 * fixture asking for no supported categories produces a file the escalation rules leave
 * alone. A file that refuses is a different test, and it should have to say so.
 */
export function mappingSupporting(
  supported: readonly RecipientCategory[],
  story: string = FIXTURE_CAMPAIGN.story,
): CategoryMapping {
  const citation = resolveCitation(story, "cannot repay it");

  return CategoryMapping.parse({
    policyVersion: POLICY_VERSION,
    categories: Object.fromEntries(
      RECIPIENT_CATEGORY_IDS.map((id) => [
        id,
        supported.includes(id)
          ? {
              status: "supported",
              citations: [citation],
              rationale: "The story states a debt the family says it cannot repay.",
            }
          : {
              status: "not_supported",
              rationale: "The story says nothing that bears on this category.",
            },
      ]),
    ),
    mixedUseSignals: [],
  });
}

export const NOT_ESCALATED: EscalationDecision = { escalate: false };

export const ESCALATED: EscalationDecision = {
  escalate: true,
  reasons: [
    {
      kind: "nothing_resolvable",
      question:
        "Should the organizer be asked for the missing information, or should this campaign be declined without a further round?",
      citations: [],
    },
  ],
};

/**
 * An agent file ready to store, with the escalation and delivery state a caller wants.
 *
 * `slackDelivery` defaults to null and the fixture does not fill it in for an escalating
 * run, because the table refuses that pairing and a fixture that quietly repaired it would
 * hide the constraint the tests are here to prove.
 */
export function triageRunRow(overrides: Partial<NewTriageRunRow> = {}): NewTriageRunRow {
  const mapping = overrides.mapping ?? mappingSupporting(["al-gharimin"]);

  return {
    id: "run_fixture_0001",
    campaignId: FIXTURE_CAMPAIGN.id,
    facts: FIXTURE_FACTS,
    mapping,
    missingEvidence: buildMissingEvidenceReport(mapping),
    escalation: NOT_ESCALATED,
    policyVersion: POLICY_VERSION,
    model: "test-model",
    slackDelivery: null,
    ...overrides,
  };
}
