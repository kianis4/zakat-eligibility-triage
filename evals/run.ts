import type { LanguageModel } from "ai";

import type { CampaignInput } from "../src/lib/campaign";
import { RECIPIENT_CATEGORY_IDS, type RecipientCategory } from "../src/lib/categories";
import { evaluateEscalation, type EscalationReason } from "../src/lib/escalation";
import {
  MINIMUM_CORPUS_SIZE,
  type EvalDifficulty,
  type EvalFixture,
} from "../src/lib/eval-fixture";
import { extractFacts } from "../src/lib/extraction";
import {
  MappingError,
  mapCategories,
  type CategoryFinding,
  type CategoryMapping,
} from "../src/lib/mapping";
import { buildMissingEvidenceReport } from "../src/lib/missing-evidence";

type EscalationReasonKind = EscalationReason["kind"];

/**
 * The two model calls a fixture costs, injected rather than constructed.
 *
 * Injection is what makes the harness testable by the same rule ADR-0002 applies to the
 * pipeline: the scoring below is the part that can be wrong in a way nobody notices, because
 * a harness that miscounts reports a number rather than an error. Passing the models in lets
 * the unit suite drive real fixtures through real scoring against mock models, with no
 * network and no key, and check that the counts are what they claim to be.
 *
 * They are two fields rather than one because the stages are separately mockable, and a test
 * that wants a well-formed extraction followed by a broken mapping has to be able to say so.
 */
export type SubjectModels = {
  readonly extraction: LanguageModel;
  readonly mapping: LanguageModel;
};

/**
 * One category where the pipeline and the label read the same text differently.
 *
 * Both statuses are carried rather than a bare count, because the direction of a disagreement
 * is the whole of its meaning: a label expecting `insufficient_evidence` against a pipeline
 * saying `supported` is an over-claim, and the reverse is an over-refusal, and those are not
 * the same defect.
 */
export type CategoryDisagreement = {
  readonly category: RecipientCategory;
  readonly expected: EvalFixture["label"]["expectedFindings"][RecipientCategory]["status"];
  readonly actual: CategoryFinding["status"];
};

/**
 * A citation that is not true, which is the only thing this type now covers.
 *
 * `not_verbatim` is the offsets not slicing the quote back out of the story, which should be
 * impossible by construction because `resolveCitation` computes the offsets by exact search.
 * It is checked here anyway, end to end on the real output, because "guaranteed by
 * construction" is a claim about code that a harness is in a position to actually test.
 * `unresolvable` is the mapping stage refusing a quote it could not find, which is the same
 * contract failing one step earlier and is counted here rather than being lost inside a
 * fixture-level error.
 *
 * A third kind used to live here, for a citation that was true but landed outside the span the
 * label anticipated. It is an `AnchoringMiss` now. Both are disagreements with the corpus and
 * only one of them means the output was untrue, and a gate at 100 percent has to be about the
 * second kind alone.
 */
export type CitationSite = RecipientCategory | "mixed-use" | "pipeline";

export type CitationViolation = {
  readonly category: CitationSite;
  readonly kind: "not_verbatim" | "unresolvable";
  readonly detail: string;
};

/**
 * A supported finding that cited the story truthfully, somewhere the label did not expect.
 *
 * This is not a citation defect and it used to be counted as one. The finding is on the right
 * category, its quote is a real span of the story, and it resolves byte-exact; what happened
 * is that the label anticipated one set of words and the model picked out another set that
 * also carries the point. Two people writing a label would disagree the same way.
 *
 * Both spans are carried so a reader can settle it by eye. `nearest` is the actual citation
 * closest to the expected span, which is the one worth looking at: an anchoring miss where
 * the nearest quote is a sentence away is a label being narrow, and one where the nearest
 * quote is at the other end of the story is worth a harder look at the finding.
 */
export type AnchoringMiss = {
  readonly category: RecipientCategory;
  readonly expected: string;
  readonly nearest: string;
};

export type CategoryAgreementScore = {
  readonly agreed: number;
  readonly total: number;
  readonly disagreements: readonly CategoryDisagreement[];
};

export type CitationScore = {
  readonly checked: number;
  readonly valid: number;
  readonly violations: readonly CitationViolation[];
};

export type AnchoringScore = {
  readonly checked: number;
  readonly anchored: number;
  readonly misses: readonly AnchoringMiss[];
};

export type EscalationScore = {
  readonly passed: boolean;
  readonly expected: readonly EscalationReasonKind[];
  readonly actual: readonly EscalationReasonKind[];
};

export type MissingEvidenceScore = {
  readonly covered: number;
  readonly expected: number;
  readonly uncovered: readonly RecipientCategory[];
};

/**
 * Everything one fixture contributes to the gates, plus the mapping the judge reads.
 *
 * `outcome` is the honest field. A fixture the pipeline threw on has scores that look like
 * very bad scores rather than like an absence, which is deliberate: an eval run that quietly
 * dropped the cases it could not complete would report the average of the cases it found
 * easy. The thrown message is kept so the report can say what actually happened rather than
 * leaving a reader to infer a defect from a column of zeroes.
 */
export type FixtureScore = {
  readonly id: string;
  readonly title: string;
  readonly difficulty: EvalDifficulty;
  readonly outcome: "scored" | "failed";
  readonly failure: string | null;
  readonly categoryAgreement: CategoryAgreementScore;
  readonly citations: CitationScore;
  readonly anchoring: AnchoringScore;
  readonly escalation: EscalationScore;
  readonly missingEvidence: MissingEvidenceScore;
  readonly campaign: CampaignInput;
  readonly mapping: CategoryMapping | null;
};

export type DeterministicSummary = {
  readonly fixtures: readonly FixtureScore[];
  readonly categoryAgreementRate: number;
  readonly citationValidityRate: number;
  readonly citationAnchoringRate: number;
  readonly escalationAgreementRate: number;
  readonly missingEvidenceCoverageRate: number;
};

/**
 * A proportion, with an empty denominator reading as one rather than as NaN.
 *
 * Vacuous is the right reading for these four: a corpus that expects no missing-evidence
 * question anywhere has nothing to fail at, and a gate comparing against NaN would fail every
 * run for a reason that is not about the pipeline. The place this could hide a real problem
 * is citation validity, where a run whose fixtures all threw performs no citation checks and
 * scores a vacuous 100 percent. It cannot hide it for long: those same fixtures score zero on
 * category agreement, whose gate is not vacuous, so the run still fails and the report still
 * names the thrown errors.
 */
function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}

function statusOf(finding: CategoryFinding): CategoryFinding["status"] {
  return finding.status;
}

function scoreCategoryAgreement(
  fixture: EvalFixture,
  mapping: CategoryMapping,
): CategoryAgreementScore {
  const disagreements = RECIPIENT_CATEGORY_IDS.flatMap((category) => {
    const expected = fixture.label.expectedFindings[category].status;
    const actual = statusOf(mapping.categories[category]);

    return expected === actual ? [] : [{ category, expected, actual }];
  });

  return {
    agreed: RECIPIENT_CATEGORY_IDS.length - disagreements.length,
    total: RECIPIENT_CATEGORY_IDS.length,
    disagreements,
  };
}

/**
 * Checks that every citation is true, which is the whole of what validity means.
 *
 * Byte-exactness only. It is checked against the story the fixture holds rather than against
 * anything the mapping stage carried forward, so a story that changed shape on the way through
 * fails here rather than passing a self-consistent check.
 *
 * Whether a citation landed where the label expected is a different question and is scored in
 * `scoreAnchoring`. The two were one measurement behind one 100 percent gate until a live run
 * showed what that conflates: a supported finding on the right category, quoting a real span
 * of the story, failed the build because the label had anticipated different words. That is a
 * disagreement about which sentence carries the point, not a fabricated quote, and the gate
 * that exists to catch fabrication should not be the gate that fires on it.
 *
 * Exported for one reason: the byte-exactness check cannot fire through the pipeline, because
 * `resolveCitation` computes the offsets by exact search and fails closed on anything else.
 * A check that cannot fire is a check nobody has evidence about, so the test reaches this
 * function directly with a mapping whose offsets have been moved by hand.
 */
export function scoreCitations(fixture: EvalFixture, mapping: CategoryMapping): CitationScore {
  const violations: CitationViolation[] = [];
  let checked = 0;

  const verbatim = (
    category: CitationSite,
    citation: { quote: string; start: number; end: number },
  ) => {
    checked += 1;

    if (fixture.story.slice(citation.start, citation.end) !== citation.quote) {
      violations.push({
        category,
        kind: "not_verbatim",
        detail: `The span ${citation.start}..${citation.end} of the story is ${JSON.stringify(
          fixture.story.slice(citation.start, citation.end),
        )} and the citation quotes ${JSON.stringify(citation.quote)}.`,
      });
    }
  };

  for (const category of RECIPIENT_CATEGORY_IDS) {
    const finding = mapping.categories[category];

    if (finding.status !== "supported") {
      continue;
    }

    for (const citation of finding.citations) {
      verbatim(category, citation);
    }
  }

  /**
   * A mixed-use signal's citations are under the same contract and reach a reviewer by the
   * same route: `evaluateEscalation` carries them into the question it raises about the
   * split. Leaving them out would exempt from the strictest gate the citations attached to
   * the condition the backlog calls the case that matters most.
   */
  for (const signal of mapping.mixedUseSignals) {
    for (const citation of signal.citations) {
      verbatim("mixed-use", citation);
    }
  }

  return { checked, valid: checked - violations.length, violations };
}

/**
 * Checks whether a supported finding cited the part of the story its label anticipated.
 *
 * Scored only where the label and the pipeline already agree the category is supported. Where
 * they disagree about the status, that is a category disagreement and is counted there;
 * charging it here as well would move two gates for one reading error. Overlap rather than
 * equality is what the label promises, per `mustCiteSubstring`: a label says which part of the
 * story a correct citation has to land in, not which words it has to pick out.
 *
 * A miss is a weaker signal than an invalid citation and is gated accordingly. It says the
 * label and the model read different words as carrying the same point, which one run can
 * reasonably contain and a corpus cannot systematically contain without the labels ceasing to
 * check anything.
 */
export function scoreAnchoring(fixture: EvalFixture, mapping: CategoryMapping): AnchoringScore {
  const misses: AnchoringMiss[] = [];
  let checked = 0;

  for (const category of RECIPIENT_CATEGORY_IDS) {
    const finding = mapping.categories[category];
    const expected = fixture.label.expectedFindings[category];

    if (finding.status !== "supported" || expected.status !== "supported") {
      continue;
    }

    checked += 1;
    const start = fixture.story.indexOf(expected.mustCiteSubstring);
    const end = start + expected.mustCiteSubstring.length;

    if (finding.citations.some((citation) => citation.start < end && start < citation.end)) {
      continue;
    }

    /**
     * The gap to the expected span, zero when they touch. Sorting by it picks the citation a
     * reader should look at first, which is the one that came closest to the words the label
     * had in mind.
     */
    const distance = (citation: { start: number; end: number }) =>
      Math.max(0, Math.max(citation.start - end, start - citation.end));
    const nearest = [...finding.citations].sort((a, b) => distance(a) - distance(b))[0];

    misses.push({
      category,
      expected: expected.mustCiteSubstring,
      nearest: nearest.quote,
    });
  }

  return { checked, anchored: checked - misses.length, misses };
}

function sameKinds(left: readonly string[], right: readonly string[]): boolean {
  const seen = new Set(left);

  return seen.size === new Set(right).size && right.every((kind) => seen.has(kind));
}

/**
 * Runs one fixture through the pipeline and scores what came back.
 *
 * A throw anywhere in the three stages is caught and turned into a fixture that failed every
 * dimension, rather than being allowed to end the run. Seventeen scored fixtures and one
 * named failure is a result a reader can act on; a stack trace on fixture six is a run that
 * measured nothing. The one refinement is that a `citation_unresolvable` mapping error is
 * also recorded as a failed citation check, because that error is precisely the citation
 * contract breaking and it belongs against the gate that exists to catch it.
 */
export async function scoreFixture(
  fixture: EvalFixture,
  models: SubjectModels,
): Promise<FixtureScore> {
  const { label, ...campaign } = fixture;
  const base = {
    id: fixture.id,
    title: fixture.title,
    difficulty: label.difficulty,
    campaign,
  };

  try {
    const facts = await extractFacts(campaign, models.extraction);
    const mapping = await mapCategories(campaign, facts, models.mapping);
    const escalation = evaluateEscalation(campaign, facts, mapping);
    const report = buildMissingEvidenceReport(mapping);

    const actualKinds = escalation.escalate
      ? escalation.reasons.map((reason) => reason.kind)
      : [];
    const asked = new Set(report.items.map((item) => item.category));
    const uncovered = label.expectedMissingEvidence.filter((category) => !asked.has(category));

    return {
      ...base,
      outcome: "scored",
      failure: null,
      categoryAgreement: scoreCategoryAgreement(fixture, mapping),
      citations: scoreCitations(fixture, mapping),
      anchoring: scoreAnchoring(fixture, mapping),
      escalation: {
        passed: sameKinds(label.expectedEscalation.kinds, actualKinds),
        expected: label.expectedEscalation.kinds,
        actual: actualKinds,
      },
      missingEvidence: {
        covered: label.expectedMissingEvidence.length - uncovered.length,
        expected: label.expectedMissingEvidence.length,
        uncovered,
      },
      mapping,
    };
  } catch (thrown: unknown) {
    const unresolvable = thrown instanceof MappingError && thrown.reason === "citation_unresolvable";

    return {
      ...base,
      outcome: "failed",
      failure: thrown instanceof Error ? `${thrown.name}: ${thrown.message}` : String(thrown),
      categoryAgreement: {
        agreed: 0,
        total: RECIPIENT_CATEGORY_IDS.length,
        disagreements: [],
      },
      citations: unresolvable
        ? {
            checked: 1,
            valid: 0,
            violations: [
              {
                category: "pipeline",
                kind: "unresolvable",
                detail: thrown.message,
              },
            ],
          }
        : { checked: 0, valid: 0, violations: [] },
      /**
       * No anchoring checks, rather than failed ones. A fixture that threw produced no
       * supported finding to anchor, and scoring it zero here would charge one pipeline
       * failure to a second gate on top of the three it already fails.
       */
      anchoring: { checked: 0, anchored: 0, misses: [] },
      escalation: { passed: false, expected: label.expectedEscalation.kinds, actual: [] },
      missingEvidence: {
        covered: 0,
        expected: label.expectedMissingEvidence.length,
        uncovered: label.expectedMissingEvidence,
      },
      mapping: null,
    };
  }
}

/**
 * Adds the per-fixture scores up into the four numbers the deterministic gates read.
 *
 * Three of the four are pooled over the units the thing is actually made of: categories for
 * agreement, individual checks for citations, categories again for missing-evidence coverage.
 * Escalation is per fixture because the label is per fixture: the expectation is that the set
 * of conditions matches exactly, so there is no partial credit to pool.
 */
export function summarize(fixtures: readonly FixtureScore[]): DeterministicSummary {
  const sum = (pick: (fixture: FixtureScore) => number) =>
    fixtures.reduce((total, fixture) => total + pick(fixture), 0);

  return {
    fixtures,
    categoryAgreementRate: rate(
      sum((fixture) => fixture.categoryAgreement.agreed),
      sum((fixture) => fixture.categoryAgreement.total),
    ),
    citationValidityRate: rate(
      sum((fixture) => fixture.citations.valid),
      sum((fixture) => fixture.citations.checked),
    ),
    citationAnchoringRate: rate(
      sum((fixture) => fixture.anchoring.anchored),
      sum((fixture) => fixture.anchoring.checked),
    ),
    escalationAgreementRate: rate(
      fixtures.filter((fixture) => fixture.escalation.passed).length,
      fixtures.length,
    ),
    missingEvidenceCoverageRate: rate(
      sum((fixture) => fixture.missingEvidence.covered),
      sum((fixture) => fixture.missingEvidence.expected),
    ),
  };
}

/**
 * Refuses to score a corpus too small to be the corpus the gates were set against.
 *
 * Without this the harness has a hole with the worst possible shape. Every one of the four
 * rates reads an empty denominator as a vacuous pass, deliberately, so a `fixtures/evals/`
 * that was emptied, renamed or lost to a bad checkout produces eight green gates, exit zero,
 * and not one model call. The run would take about a second and report that everything holds.
 *
 * The vacuity argument in `rate` says the non-vacuous gates catch this, and that argument is
 * only sound while fixtures exist to fail them. At zero fixtures every denominator is zero
 * and nothing is left to notice. So the floor is asserted before any scoring rather than
 * inferred from the scores afterwards, and it is the same `MINIMUM_CORPUS_SIZE` the corpus
 * test pins, because a gate and a suite disagreeing about how much corpus is enough is the
 * next version of this bug.
 *
 * It throws rather than returning a failing summary. A missing corpus is not a bad result to
 * be reported alongside the others, it is the measurement never having happened, which is the
 * same thing a missing API key is and gets the same answer.
 */
export function assertCorpusIsWhole(fixtures: readonly EvalFixture[]): void {
  if (fixtures.length >= MINIMUM_CORPUS_SIZE) {
    return;
  }

  throw new Error(
    [
      `The eval corpus holds ${fixtures.length} fixture${fixtures.length === 1 ? "" : "s"}, and the gate requires at least ${MINIMUM_CORPUS_SIZE}.`,
      "",
      "This is a failure rather than a small run. Every gate reads an empty denominator as a",
      "vacuous pass, so a corpus that shrank away would take all of them green without a single",
      "model call. Restore fixtures/evals/ before trusting any result from this harness.",
    ].join("\n"),
  );
}

/**
 * Scores the whole corpus, a few fixtures at a time.
 *
 * Bounded concurrency rather than one at a time or all at once: eighteen fixtures at two
 * calls each is long enough sequentially to make a CI run tiresome, and firing all eighteen
 * together is how a provider rate limit turns into eighteen model_call_failed results that
 * look like a pipeline defect. Results come back in fixture order regardless of completion
 * order, so a report diffs against the previous one.
 */
export async function scoreCorpus(
  fixtures: readonly EvalFixture[],
  models: SubjectModels,
  concurrency = 4,
): Promise<DeterministicSummary> {
  assertCorpusIsWhole(fixtures);

  const scores: FixtureScore[] = new Array(fixtures.length);
  let next = 0;

  const worker = async () => {
    while (next < fixtures.length) {
      const index = next;
      next += 1;
      scores[index] = await scoreFixture(fixtures[index], models);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, fixtures.length) }, () => worker()),
  );

  return summarize(scores);
}
