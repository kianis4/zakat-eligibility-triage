import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { CampaignInput } from "./campaign";
import { RECIPIENT_CATEGORY_IDS } from "./categories";
import { ESCALATION_REASON_KINDS } from "./escalation";

const FIXTURES_DIR = fileURLToPath(new URL("../../fixtures/evals/", import.meta.url));

/**
 * What the corpus expects the pipeline to record for one recipient category.
 *
 * A label is a statement about the campaign text, not about a campaign's zakat eligibility.
 * The three statuses mean here exactly what the docblock on `CategoryFinding` in `./mapping`
 * says they mean, and that definition is not restated here: a corpus labelled against a
 * paraphrase of the pipeline's own vocabulary would report disagreements that are really the
 * two wordings drifting apart.
 *
 * `mustCiteSubstring` rides on `supported` and nowhere else, for the same reason
 * `CategoryFinding` puts citations there: a supported label with nothing to point at is the
 * uncited assertion the pipeline exists to refuse, and an eval corpus that permitted one
 * would be scoring the pipeline against a standard it does not hold itself to. It is a
 * substring rather than a span so that a fixture does not have to guess which words a
 * correct citation will pick out. The harness checks overlap, which is a check a hand-written
 * label can actually be right about.
 */
export const ExpectedFinding = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("supported"),
    mustCiteSubstring: z.string().min(1),
  }),
  z.object({ status: z.literal("not_supported") }),
  z.object({ status: z.literal("insufficient_evidence") }),
]);

export type ExpectedFinding = z.infer<typeof ExpectedFinding>;

/**
 * Whether the corpus expects this campaign to be handed to a human unfinished, and on which
 * of the four conditions in `evaluateEscalation`.
 *
 * The union mirrors `EscalationDecision`: expecting a refusal without saying what fires it
 * is the generic needs-review label, and a corpus written in those terms would pass a
 * pipeline that escalated everything. Expecting no refusal carries an empty kind list rather
 * than an absent field, so a fixture states the absence instead of leaving it to be read off
 * a missing key.
 */
export const ExpectedEscalation = z.discriminatedUnion("expected", [
  z.object({
    expected: z.literal(false),
    kinds: z.array(z.enum(ESCALATION_REASON_KINDS)).length(0),
  }),
  z.object({
    expected: z.literal(true),
    kinds: z
      .array(z.enum(ESCALATION_REASON_KINDS))
      .min(1)
      .refine((kinds) => new Set(kinds).size === kinds.length, {
        message: "A kind names a condition that fires, so naming it twice says nothing extra.",
      }),
  }),
]);

export type ExpectedEscalation = z.infer<typeof ExpectedEscalation>;

/**
 * How hard the case is meant to be, which is the axis the suite is read along.
 *
 * `clean` is a case a reviewer would map without argument, `flagged` is a case the pipeline
 * is expected to catch something in, and `ambiguous` is a case where two qualified reviewers
 * could read the same text differently. The third is the reason the corpus exists: a suite
 * of cases the system already handles measures self-consistency rather than accuracy.
 */
export const EVAL_DIFFICULTIES = ["clean", "flagged", "ambiguous"] as const;

export type EvalDifficulty = (typeof EVAL_DIFFICULTIES)[number];

/**
 * The hand-written expectation attached to one campaign.
 *
 * The refinements below are consistency rules between fields, not extra expectations. Each
 * one rules out a label that contradicts itself, and a self-contradictory label is worse than
 * a missing one: the harness would report a failure that no implementation could ever clear.
 */
export const EvalLabel = z
  .object({
    expectedFindings: z.record(z.enum(RECIPIENT_CATEGORY_IDS), ExpectedFinding),
    expectedEscalation: ExpectedEscalation,
    expectedMissingEvidence: z.array(z.enum(RECIPIENT_CATEGORY_IDS)),
    notes: z.string().min(1),
    difficulty: z.enum(EVAL_DIFFICULTIES),
  })
  .superRefine((label, ctx) => {
    const findings = label.expectedFindings;

    if (new Set(label.expectedMissingEvidence).size !== label.expectedMissingEvidence.length) {
      ctx.addIssue({
        code: "custom",
        path: ["expectedMissingEvidence"],
        message: "A category is asked about once, so listing it twice says nothing extra.",
      });
    }

    /**
     * `buildMissingEvidenceReport` reads the unresolved findings and nothing else, so a
     * category can only carry a question if it is also expected unresolved. The list is a
     * subset rather than a copy of them: it names the categories where a reviewer must come
     * away with something to ask, which is the part of the report a label is willing to
     * assert.
     */
    for (const category of label.expectedMissingEvidence) {
      if (findings[category].status !== "insufficient_evidence") {
        ctx.addIssue({
          code: "custom",
          path: ["expectedMissingEvidence"],
          message: `A question is expected on ${category}, which the same label expects resolved as ${findings[category].status}.`,
        });
      }
    }

    const kinds = label.expectedEscalation.kinds;
    const supported = Object.values(findings).filter((finding) => finding.status === "supported");

    if (kinds.includes("claim_without_support") && supported.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["expectedEscalation"],
        message:
          "A claim counts as unsupported only when no category came out supported, which this label does not expect.",
      });
    }

    const unresolved = Object.values(findings).filter(
      (finding) => finding.status === "insufficient_evidence",
    );

    if (kinds.includes("nothing_resolvable") && unresolved.length !== RECIPIENT_CATEGORY_IDS.length) {
      ctx.addIssue({
        code: "custom",
        path: ["expectedEscalation"],
        message:
          "Nothing is resolvable only when every category is expected unresolved, which this label does not expect.",
      });
    }
  });

export type EvalLabel = z.infer<typeof EvalLabel>;

/**
 * A labelled campaign on disk: the campaign exactly as the platform would hand it over, plus
 * what this repository expects the pipeline to make of it.
 *
 * Parsed rather than cast, on the same ground as `PrecedentFixture`. These files are written
 * and edited by hand, so a mistyped category key or a status word that does not exist is a
 * likely error and a silent one, and a corpus that quietly drops a category is a corpus that
 * scores the pipeline on seven of eight.
 */
export const EvalFixture = CampaignInput.extend({ label: EvalLabel }).superRefine(
  (fixture, ctx) => {
    for (const [category, finding] of Object.entries(fixture.label.expectedFindings)) {
      if (finding.status !== "supported") {
        continue;
      }

      /**
       * A citation is a verbatim span of the story (ADR-0003), so a substring a citation is
       * expected to overlap has to be in the story to be overlappable. A label pointing at
       * words the organizer never wrote can never be met, and it fails looking exactly like
       * a pipeline defect.
       */
      if (!fixture.story.includes(finding.mustCiteSubstring)) {
        ctx.addIssue({
          code: "custom",
          path: ["label", "expectedFindings", category, "mustCiteSubstring"],
          message: `The expected citation ${JSON.stringify(finding.mustCiteSubstring)} is not a span of this campaign's story.`,
        });
      }
    }
  },
);

export type EvalFixture = z.infer<typeof EvalFixture>;

/**
 * Reads the labelled corpus off disk, in file-name order so a run is reproducible.
 *
 * Every file is parsed, and one bad file fails the load rather than being skipped. A corpus
 * that silently shrinks is a suite that silently stops testing something.
 */
export async function loadEvalFixtures(): Promise<EvalFixture[]> {
  const names = (await readdir(FIXTURES_DIR)).filter((name) => name.endsWith(".json")).sort();

  return Promise.all(
    names.map(async (name) =>
      EvalFixture.parse(JSON.parse(await readFile(join(FIXTURES_DIR, name), "utf8"))),
    ),
  );
}
