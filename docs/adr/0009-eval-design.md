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
guard cannot cover. And the line between `insufficient_evidence` and `not_supported` can be
drawn in the wrong place, hedging on a category the story never raised or settling one it
gestures at. Those four failure modes are the ones that make a green deterministic run mean
less than it looks, and no label can catch any of them.

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
specific and sendable as they stand, nothing adjudicates a difference or issues a ruling, and a
category is left unresolved when the story engages it and closed when it does not. The fourth
tests the line drawn in the `CategoryFinding` docblock in `src/lib/mapping.ts` and does not
restate it; see the second addendum for what happened when it did.

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

Reproducibility is bounded. The harness asks for temperature zero through AI SDK middleware,
so no pipeline signature had to change to accommodate it. It does not get it: see the addendum
below. Either way the same campaign can map differently on two runs, so a threshold sitting one
fixture above the bar will eventually cross it for no reason anyone changed. That is an
argument for the bars being where they are rather than tight, and it is also the reason a
report exists to be argued from when one moves.

## Addendum, 2026-08-19: what the first two live runs changed

The design above was written before the harness had ever run against a real model. Two full
runs then falsified two of its claims. Recorded here rather than edited into the text above,
so the correction is legible as a correction.

**An infrastructure failure was reading as the behavioural failure this system exists to
prevent.** On the first run, 12 of 16 judged records failed schema validation, on the rule
requiring the judge's reason to be a single sentence. Because a response that failed to parse
was charged as a failure on all four rubric dimensions, the report stated that the pipeline had
adjudicated a scholarly difference twelve times. It had not adjudicated anything; the judge's
answers had simply not been recorded. The four responses that did parse contained specific,
checkable findings, so the judge was working whenever it was heard from.

Three things follow, and all three are now in the code.

1. **The one-sentence rule is gone**, replaced by a 400-character cap. It was validating the
   wrong thing. The pass and fail booleans are the contract the gates read; the reason beside
   them is diagnostic prose for a person deciding whether a gate moved for a good cause, and
   discarding four sound judgments to enforce a preference about prose is a bad trade. Nothing
   forbids quotation marks in it, which is the opposite of the rule the pipeline's own model
   prose lives under: this text reaches a report and never a reviewer, and the judge quoting
   the phrase it objects to is what makes the reason checkable against the record.
2. **A rejected response buys one repair attempt** with the validation error quoted back. Once,
   not until it works, because a retry loop turns a persistently broken judge into a slow
   expensive one that eventually says something, and seeing that the judge is broken is the
   point of counting these at all.
3. **A response that survives the retry is a judge error, not four dimension failures.** It is
   gated separately, at most 2 of 18, and reported in its own section. The original argument
   for the all-four charge was that dropping the outcome would shrink the denominator and make
   the gate quieter the worse things got. That concern was real and the answer was wrong: it is
   now answered by the separate gate, while the dimension rates compute over the records
   actually judged, with that denominator printed wherever a rate appears.

The general form of the mistake is worth keeping. **A harness that cannot distinguish "the
measurement failed" from "the thing measured is bad" will report the second when it means the
first**, and it will do so most loudly on the dimension that matters most, because that is the
one with the strictest gate. The deterministic half already had this right, counting a thrown
`ExtractionError` as a fixture failure while never letting it touch citation validity. The
judge half did not, and now does.

**Temperature zero is requested and not honoured.** Both runs logged, once per call,
that `temperature is not supported by claude-sonnet-5` and the same for `claude-opus-5`, and
that the value would be ignored. So the sentence above about both models running at temperature
zero was never true in practice. The middleware is kept, since it is free and correct if
support returns, but no reproducibility claim rests on it: run-to-run variation is a property
of these models that this harness cannot currently turn off. That strengthens rather than
weakens the case for the thresholds being loose and for a report existing to argue from.

Two further findings from those runs are recorded here as observations for whoever calibrates
next, not as changes. The deterministic gates failed well short of their bars, at 62.5 percent
category agreement against an 80 percent floor. And two fixtures threw in the pipeline rather
than being scored, one on a fabricated extraction quote and one on a mapping schema failure.
Whether those are pipeline defects, prompt defects or labels that are wrong is exactly the
question a calibration commit has to argue, and it is not answered here.

## Addendum, 2026-08-19: the rubric had drifted from the status definitions

The fourth dimension was written when the eval harness was built, before the three statuses
were pinned to a single definition in the `CategoryFinding` docblock. It said that a category
the story does not speak to should be left unresolved with the missing fact named. The pinned
definition says the opposite: `not_supported` covers a story that "does not engage the category
at all", and `insufficient_evidence` is for one that "engages the category, or gestures at it,
and the qualifying facts are missing".

The live run showed the cost. The judge failed records for closing al-muallafati-qulubuhum on
stories that never mention faith background, and for closing al-gharimin on stories that never
mention debt, and gave articulate specific reasons for both. The pipeline was right and the
rubric was wrong, and nothing in the harness could have noticed, because a rubric is prose sent
to a model and no compiler reads it.

The dimension is now `unresolved-only-where-engaged`, and it tests the pinned line rather than
restating it: closing an unraised category is explicitly correct, while settling a category the
story does engage, or justifying a closure with facts the story does not state, fails. The
rename is deliberate. The old id asserted the old rule, and an identifier that states a
superseded definition is the same drift in a shorter form.

The general lesson is the one the docblock itself makes when it says the statuses are defined
there and nowhere else: **every restatement of a definition is a copy that can rot**, and the
eval rubric is a restatement that lives outside the type system, outside the prompt, and
outside the corpus. It is now pinned by assertions in `evals/__tests__/judge.test.ts` that
check the criterion still says what the definition says, and that no dimension anywhere tells
the judge to leave an unraised category unresolved. Those tests are weak, being string
matches against prose, and they are still the strongest check available on text whose only
other reader is a model.

## Addendum, 2026-08-19: citation validity and citation anchoring are two measurements

A later run failed the build on `citation-validity` at 98.2 percent, 56 of 57. The one miss
was eval_0011, which scored 8 of 8 on category agreement: a supported finding, on a category
the label agrees is supported, quoting a real span of the story that resolves byte-exact, in
different words than the label had anticipated.

That is not an invalid citation. `mustCiteSubstring` is documented in the corpus README as an
overlap target rather than a required span, precisely so a label does not have to guess which
words a correct citation will pick out, and two people writing the corpus would disagree about
this the same way. Scoring it under a 100 percent gate meant one difference of reading failed a
build on the gate reserved for fabricated quotes.

The measurement is now split. `citation-validity` keeps the 100 percent floor and asks only
whether a citation is true: does it slice its own quote back out of the story, with a
`citation_unresolvable` throw charged here as the same contract failing a step earlier. That is
ADR-0003's contract and one violation should indeed fail a build. `citation-anchoring` is new,
scored over the supported findings whose category the label already agrees with, and floored at
90 rather than 100 because a miss is a disagreement about which words carry the support and not
a defect. It is floored high rather than removed because the labels' claim to check anything
rests on a supported finding pointing where the label had in mind, and systematic drift would
leave every citation valid, every status agreeing, and the corpus testing nothing.

The report prints both counts in one cell and the terminal summary prints both spans for each
miss, the label's expected substring against the nearest actual quote, because settling one of
these is a matter of reading them side by side: the next sentence over means the label was
narrow, the far end of the story means the finding needs a harder look.

This is the same error as the judge addendum above, in a second place. **A gate is only as
meaningful as the single question it asks**, and both of these had quietly come to ask two.

## Addendum, 2026-08-19: the engagement dimension is floored at inter-reader agreement

Four full runs of the judge dimension `unresolved-only-where-engaged`, in order: 6.3 percent,
46.7 percent, and then 72.2 percent once the last of the harness faults was out of the way. The
first two were not measurements of the pipeline. They were the rubric and the pinned status
definitions disagreeing with each other, twice, in the two ways the addenda above record. Both
are fixed, and the fixes are what the third number is a measurement of.

At 72.2 percent the dimension is the single red gate in a run that is green on the other nine,
several of them emphatically: category agreement 99.3 percent, escalation agreement 94.4,
missing-evidence coverage 97.6, citation validity 100, anchoring 92.9, no-ruling at zero
failures, and the other two judge dimensions at 94.4 each. This is the case the threshold rule
above reserved, so here is the argument.

The five residual disagreements, in the latest report, are 0003, 0008, 0011, 0012 and 0013. All
five sit in the same place: the faint-gesture middle, where a story states something that may or
may not be a concrete fact under the operational test. An ongoing hotel bill. A mention that
cash would vanish into an overdraft. Hardship ambiance that one reader leaves open and another
closes. Several are in the corpus's ambiguous tier, which the labels declare in advance to be
cases two qualified reviewers would read differently.

So what the number measures at this point is agreement between two strong models applying the
same written boundary independently, and that agreement is 13 of 18. **A floor set above the
measured agreement between careful readers does not enforce quality. It enforces flakiness**:
the gate would go red and green across runs on unchanged code, and the only reliable way to
clear it would be to stop believing it, which is worse for this repository than not having it.

The floor for this dimension alone moves to two-thirds, 12 of 18. The other two rate-gated
dimensions stay at 85 percent, and the no-ruling gate stays at zero tolerated failures, which is
the one that carries ADR-0001 and is not a matter of degree. Two-thirds sits below the observed
agreement and above collapse, and it is deliberately not comfortable: at 13 of 18 the margin is
a single record. The dimension stays in the report as a diagnostic with every disagreement
printed beside the judge's stated reason, which is the thing actually worth reading, and it is
not softened into an advisory.

**What would justify raising it again**: a sharper operational test for the faint-gesture
middle, one that two models demonstrably apply consistently, measured across several runs.
Runs, not aspiration. The two previous attempts to tighten this dimension by rewording it
produced confident, specific, wrong judgments rather than agreement, which is the failure mode
this dimension has now shown twice, and the evidence for a higher floor is a higher rate that
holds rather than a conviction that it should.
