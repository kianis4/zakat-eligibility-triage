# ADR-0009: The eval suite splits deterministic checks from a pass/fail judge, and fails the build

Date: 2026-08-19
Status: accepted

## Context
The README claims the eval suite runs in CI with a failing threshold and includes cases the
system gets wrong on purpose. Until this issue neither half of that was true. The labelled
corpus existed and was schema-checked, and nothing read it.

Two things have to be measured and they are not the same kind of thing. Some of what the
pipeline produces is checkable against a hand-written label: a status per category, a citation
that either does or does not resolve to the span it quotes, which of four refusal conditions
fired, whether the report carries a question for a category the label expects one on. Those
are facts, and a label written by a careful person can be right about them.

The rest is not checkable that way. A category can be given the correct status by a rationale
that asserts rather than argues. A question can satisfy every schema rule, ending in a
question mark and naming no internal vocabulary, and still be one a reviewer would rewrite
before sending. A sentence can quietly settle a scholarly difference in prose that no regular
expression matches, which `src/lib/model-prose.ts` already records as the residual its shape
guard cannot cover. And `insufficient_evidence` can be a hedge instead of the honest reading
of a silent story. Those four failure modes are the ones that make a green deterministic run
mean less than it looks, and no label can catch any of them.

## Decision
Two scorers, one gate, arranged so each measures only what it can.

**Deterministic scoring** (`evals/run.ts`) runs each of the eighteen fixtures through
`extractFacts`, `mapCategories`, `evaluateEscalation` and `buildMissingEvidenceReport` against
a live model, and counts four things: per-category status agreement with the label, citation
validity, exact-set agreement on refusal kinds, and whether every category the label expects a
question on got one. A thrown `ExtractionError` or `MappingError` makes that fixture a failure
on every dimension rather than ending the run.

**Judge scoring** (`evals/judge.ts`) asks a second model, once per fixture, for a verdict on
four rubric dimensions: rationales argue from the campaign's own words, organizer questions are
specific and sendable as they stand, nothing adjudicates a difference or issues a ruling, and
silence is recorded as unresolved rather than guessed either way.

Each dimension is **pass or fail with a one-sentence reason, never a score**. A number here
would be the thing ADR-0001 rejected arriving through the back door of the test harness. That
ADR turned down a confidence score on the ground that the figure would be uncalibrated against
a ground truth which is scholarly judgment; a judge scoring reasoning quality out of five has
the same problem with the same denominator missing, and a gate reading that number would treat
it as meaningful. Pass or fail with a stated reason is a claim someone can argue with, and
counting failures is arithmetic the underlying judgments actually support.

**The judge is shown the campaign text and the record, and nothing else.** Not the label: a
judge shown the expected answer grades agreement with it, which the deterministic half already
measures and measures better, and the run would then be scoring the same thing twice while
appearing to score two things. Not precedent: ADR-0004 keeps adjudicated cases away from the
mapping model because examples in a model's context are examples to imitate, and a judge with
precedent in front of it would reward a record for resembling past decisions rather than for
reasoning from this campaign. Not the scholarly-difference summaries either, since those are
human-authored corpus text rather than anything the model wrote, and the question here is only
about what the model wrote. `reviewBrief` is exported so a test asserts those absences instead
of the prompt being trusted to hold them.

**The thresholds** live in `evals/gate.ts` as data with an argued comment per number, and a
missed threshold exits non-zero. Citation validity is the only one at 100 percent, because a
citation is the one output that is either true or a fabrication indistinguishable from a real
one on the page. Category agreement and missing-evidence coverage sit at 80 percent, well below
100 on purpose: five of the eighteen cases are labelled ambiguous precisely because two
qualified reviewers could read them differently, so a gate demanding agreement everywhere would
demand agreement about cases the corpus itself calls contestable. Escalation agreement is
loosest at 75 percent because it is measured strictest, on an exact match of the refusal-kind
set with no partial credit for catching three conditions of four. The judge's ruling dimension
is a count of zero rather than a rate, because ADR-0001 is the product and a percentage bar
would price one record in seven settling a scholarly difference as acceptable. The other three
judge dimensions are gated at 85 percent each, per dimension rather than pooled, so a run
cannot pass by being excellent at two of them and poor at the third.

**Every one of those numbers is a first calibration.** There is no prior run they were derived
from, and there is no published human baseline anywhere to derive them against: section 4.3 and
open question 9 of `docs/RESEARCH.md` record that no zakat institution publishes an error rate,
an audit result or an inter-rater reliability figure. So the governing rule is procedural
rather than statistical. **A threshold moves only in a commit that argues from a report**,
naming the run, the fixtures that moved it and why the new number is the right one. Lowering a
bar to make a red run green is the failure mode this rule exists to make visible, because it is
the one that leaves the gate in place while removing everything it was for.

## Alternatives considered
- **Deterministic checks only.** Cheaper, fully reproducible, and needs no second model. It
  loses exactly the four failure modes above, all of which ship an output that looks correct.
  The one that decides it is the ruling dimension: a rationale that settles a difference passes
  every schema rule and every label comparison in the suite, and it is the single output this
  architecture exists to prevent.
- **Judge only, scoring the whole record.** Rejected because it makes the harness's answer a
  model's opinion end to end, with nothing underneath that is checkable by reading. Citation
  validity in particular has an exact answer, and asking a model for it would be slower, more
  expensive and worse.
- **Numeric judge scores with a mean threshold.** Rejected on ADR-0001's argument, restated
  above, and on a second one: a mean over dimensions lets a serious failure on one be paid for
  by a good result on another, which is the arithmetic that would let a record adjudicate a
  scholarly difference and still clear the bar.
- **The subject model as its own judge.** Rejected. It would grade prose it would have written
  the same way, which measures self-consistency by a second route after the corpus already
  measures it by the first. The judge runs on a different model for that reason. The
  independence that buys is partial and should not be overstated: the subject and the judge
  come from one vendor and one training lineage, so a blind spot they share is a blind spot
  neither will report, and a judge from a different vendor would be a stronger check at the
  cost of a second credential in CI and a second provider to keep working.
- **A judge with the label in context, asked to explain disagreements.** Tempting, because the
  explanations would be useful. Rejected because it stops being an independent measurement: the
  same call would be producing both the judgment and the account of it, anchored on the answer.
  The report gets the disagreements from the deterministic half, where they are facts.
- **Gates as advisory output with a green build.** Rejected. That is a dashboard, and a
  dashboard is a thing people stop reading. The build failing is what makes a regression
  something a person answers for before it merges.

## Consequences
The suite can fail, and it can fail on the ambiguous tier for reasons that are not defects. The
report prints those five cases in their own section for that reason, so a reader sees the
honest misses as honest misses rather than averaging them into a total.

**What this measures is agreement with one author's documented standard, not accuracy.** The
corpus was written by the person who wrote the pipeline, which `fixtures/evals/README.md` states
at length and which belongs here too, because it is the limit on every number this harness
prints. A green run says the pipeline and the standard agree. It does not say the standard is
right, and no false-negative rate against genuine adjudications can be derived from it, because
nothing in the corpus was decided by a qualified reviewer. A case is also only as hard as its
author could make it: blind spots are shared between a story and its label, so a failure mode
neither anticipates is invisible to both.

That limit is the reason the corpus contains cases the system is expected to get wrong. Five
ambiguous cases and two adversarial ones are there deliberately: 0007 asserts its own
eligibility four times and states almost nothing else, and 0012 is written with real force of
feeling and contains no financial fact at all. Both fail a pipeline that rewards assertion or
pathos, and a corpus of well-evidenced campaigns would never surface either. **A suite that
passes everything measures self-consistency**, which is worth knowing and is not what a
threshold should be defended as. The thresholds are set below 100 so that the honest misses can
exist without the gate becoming a thing people route around.

The gate is a hard dependency on a credential. `ANTHROPIC_API_KEY` missing fails both the
harness and the CI job rather than skipping, because a gate that passes without running is
green for a run nobody performed, and a fork or a misconfigured environment arrives in exactly
that state.

Cost per full run, since it now runs on every pull request into main. Eighteen fixtures at two
subject calls and one judge call each, so 54 calls. The mapping call carries the whole policy
corpus in its system prompt, roughly 1,300 tokens of category guidance and 1,200 of scholarly
differences, which dominates: about 5,500 input tokens per mapping call against about 1,300 per
extraction and 1,700 per judge call, on stories averaging a little over 200 tokens. That is
roughly 120,000 input and 30,000 output tokens on the subject model, and 30,000 input and 3,000
output on the judge, for a whole run. The money is small enough that it is not what bounds how
often this runs; wall clock and provider rate limits are, which is why `scoreCorpus` and
`judgeCorpus` work four fixtures at a time rather than one or eighteen.

Reproducibility is bounded. Both models run at temperature zero, applied through AI SDK
middleware so no pipeline signature had to change to accommodate the harness. That buys
reproducibility, not determinism: the same campaign can still map differently on two runs, so a
threshold sitting one fixture above the bar will eventually cross it for no reason anyone
changed. That is an argument for the bars being where they are rather than tight, and it is
also the reason a report exists to be argued from when one moves.
