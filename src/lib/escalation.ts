import { z } from "zod";

import type { CampaignInput } from "./campaign";
import { RECIPIENT_CATEGORY_IDS } from "./categories";
import type { ExtractedFacts } from "./extraction";
import { type CategoryMapping, Citation, resolveCitation } from "./mapping";

/**
 * Why the pipeline stopped, in the vocabulary of the thing that stopped it.
 *
 * The kinds are not severity bands and they do not rank. They name which of the four
 * conditions below fired, so a reviewer opening the file knows what kind of question is
 * waiting for them before they read it.
 */
export const ESCALATION_REASON_KINDS = [
  "mixed_use",
  "scholarly_difference",
  "claim_without_support",
  "nothing_resolvable",
] as const;

/**
 * One refusal, with the question that resolves it.
 *
 * The question is the whole point. A refusal that says only that the campaign needs review
 * has moved the triage work back onto the person the triage was for, and section 7 of
 * `docs/RESEARCH.md` asks for the opposite: escalate, and say which disagreement was hit.
 * So every reason here names something specific the reviewer can answer, and carries the
 * spans of story that put the question on the table.
 *
 * The citation list can be empty, unlike a supported finding's. Some refusals are triggered
 * by the absence of text rather than by the presence of it, and an absence has no span.
 */
export const EscalationReason = z.object({
  kind: z.enum(ESCALATION_REASON_KINDS),
  question: z.string().min(1),
  citations: z.array(Citation),
});

export type EscalationReason = z.infer<typeof EscalationReason>;

/**
 * Whether the pipeline hands this campaign to a human unfinished, and why.
 *
 * The union enforces the part that matters: `escalate: true` carries a reason list typed as
 * non-empty, so a refusal with nothing on it cannot be constructed. That shape is the
 * generic needs-review flag the issue rules out, and a type is a better place to rule it out
 * than a code review.
 *
 * No field here is a score or a confidence figure, which would reintroduce the threshold
 * ADR-0001 rejected, this time at the point where the system decides whether to decide at
 * all. The only numbers a decision carries are a citation's offsets, which say where a span
 * sits rather than how strongly anything is held.
 */
export const EscalationDecision = z.discriminatedUnion("escalate", [
  z.object({ escalate: z.literal(false) }),
  z.object({
    escalate: z.literal(true),
    reasons: z.tuple([EscalationReason], EscalationReason),
  }),
]);

export type EscalationDecision = z.infer<typeof EscalationDecision>;

/**
 * Joins a fragment written by someone else onto a sentence of ours without doubling its
 * punctuation. A closing quotation mark counts as terminal, because the fragment it closes
 * has already ended.
 */
function sentence(text: string): string {
  const trimmed = text.trim();

  return /[.!?"']$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * The campaign spends on more than one thing and the reviewer has to price the split.
 *
 * The question asks for the proportions and for whether the eligible part can be separated,
 * because those two facts are what a decision on a split campaign actually turns on, and
 * neither is a religious question. The signal's own description carries the uses into the
 * question verbatim, so the reviewer reads the split in the terms the story stated it.
 */
function mixedUseReasons(mapping: CategoryMapping): EscalationReason[] {
  return mapping.mixedUseSignals.map((signal) => ({
    kind: "mixed_use" as const,
    question: [
      "The campaign puts the money it raises to more than one use.",
      sentence(signal.description),
      "Which portion of the amount raised does each of those uses account for, and can the portion that is zakat eligible be ring-fenced from the rest?",
    ].join(" "),
    citations: [...signal.citations],
  }));
}

/**
 * The category's application turns on a disagreement between recognised scholars.
 *
 * The positions come from the versioned entry the mapping step selected by id, quoted as it
 * is written in `SCHOLARLY_DIFFERENCES`. The model's contribution is the one sentence saying
 * what this campaign does that puts it inside that difference, and it travels as that rather
 * than as an account of the disagreement. Nothing is summarised afresh here, and under
 * ADR-0007 nothing about the disagreement is authored anywhere in the pipeline.
 *
 * The question asks which position platform policy applies to this campaign. It never asks
 * the reviewer to settle the fiqh: that is not a question a triage file gets to put, and
 * the platform choosing a position for its own badge is a different act from a scholar
 * resolving the difference.
 */
function scholarlyDifferenceReasons(mapping: CategoryMapping): EscalationReason[] {
  return RECIPIENT_CATEGORY_IDS.flatMap((category) => {
    const finding = mapping.categories[category];
    const difference = finding.scholarlyDifference;

    if (difference === undefined) {
      return [];
    }

    return [
      {
        kind: "scholarly_difference" as const,
        question: [
          `Recognised scholars differ on ${difference.entry.topic}, and this campaign sits inside that difference.`,
          sentence(difference.whyThisApplies),
          sentence(difference.entry.summary),
          "Which of those positions does platform policy apply to this campaign?",
        ].join(" "),
        citations: finding.status === "supported" ? [...finding.citations] : [],
      },
    ];
  });
}

/**
 * The story says the campaign is zakat eligible and the story supports no category.
 *
 * The claim is the organizer's assertion, not evidence for itself, and a campaign asserting
 * an eligibility the text does nothing to bear out is the case where a reviewer most needs
 * to be told that the two things came apart. The claim's own span is cited so the reviewer
 * reads the assertion rather than our paraphrase of it.
 */
function claimWithoutSupportReasons(
  campaign: CampaignInput,
  facts: ExtractedFacts,
  mapping: CategoryMapping,
): EscalationReason[] {
  const claim = facts.explicitZakatClaim;
  const supported = RECIPIENT_CATEGORY_IDS.some(
    (category) => mapping.categories[category].status === "supported",
  );

  if (!claim.present || supported) {
    return [];
  }

  return [
    {
      kind: "claim_without_support" as const,
      question: [
        claim.quote === null
          ? "The campaign asserts its own zakat eligibility."
          : sentence(`The campaign asserts its own zakat eligibility, in its words: "${claim.quote}"`),
        "No category of recipient came out supported by the story, so the assertion rests on nothing the text states.",
        "On which basis, if any, should that claim be assessed?",
      ].join(" "),
      citations: claim.quote === null ? [] : [resolveCitation(campaign.story, claim.quote)],
    },
  ];
}

/**
 * Every category came back unresolved and the story does not say who the money is for.
 *
 * This is refuse-and-ask-the-organizer territory like the rest, but the reviewer has a prior
 * question: whether a campaign this thin is worth a round of correspondence at all. Asking
 * that explicitly is what stops the missing-evidence report from being sent reflexively to
 * an organizer who has not yet said anything to follow up on.
 */
function nothingResolvableReasons(
  facts: ExtractedFacts,
  mapping: CategoryMapping,
): EscalationReason[] {
  const allUnresolved = RECIPIENT_CATEGORY_IDS.every(
    (category) => mapping.categories[category].status === "insufficient_evidence",
  );

  if (!allUnresolved || facts.beneficiary.kind !== "unclear") {
    return [];
  }

  return [
    {
      kind: "nothing_resolvable" as const,
      question: [
        "No category of recipient was resolved either way and the story does not say who the money is for.",
        "Should the organizer be asked for the missing information, or should this campaign be declined without a further round?",
      ].join(" "),
      citations: [],
    },
  ];
}

/**
 * Decides whether this campaign can be triaged at all, or has to go to a human unfinished.
 *
 * Deterministic and pure: same inputs, same decision, no model call and no clock. That is
 * the load-bearing property, not an implementation detail. The model is the component whose
 * output is under doubt in every one of these conditions, so letting it judge whether the
 * doubt is serious enough to stop would make it the arbiter of its own reliability, and a
 * model asked whether it is sure enough will sometimes say yes. See ADR-0006.
 *
 * A quote from the extracted facts is resolved into a citation here, which throws when the
 * quote is not a verbatim span. Extraction has already rejected any facts whose quotes are
 * not verbatim, so the throw is a broken invariant rather than a case to handle, and
 * failing closed on it is the same choice ADR-0003 makes one step earlier.
 */
export function evaluateEscalation(
  campaign: CampaignInput,
  facts: ExtractedFacts,
  mapping: CategoryMapping,
): EscalationDecision {
  const reasons = [
    ...mixedUseReasons(mapping),
    ...scholarlyDifferenceReasons(mapping),
    ...claimWithoutSupportReasons(campaign, facts, mapping),
    ...nothingResolvableReasons(facts, mapping),
  ];

  if (reasons.length === 0) {
    return { escalate: false };
  }

  return EscalationDecision.parse({ escalate: true, reasons });
}
