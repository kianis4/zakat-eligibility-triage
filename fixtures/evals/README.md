# Labelled eval corpus: provenance

Eighteen campaigns, every one of them synthetic and written by hand for this repository,
each carrying the label this repository expects the pipeline to produce for it. There is no
real campaign, no real organization, no real person and no scraped text in this directory.
Real geographic names appear as plausible settings, and a name invented for a file may well
collide with a real one somewhere; no campaign, organization, person, sum or date here is
real, and where a file names a relief trust, a print shop or a college, that body does not
exist.

The corpus is the input to the eval harness. It is not a ground truth, and the section on
what it cannot prove is the part of this note to read before quoting a number from it.

## What a file contains

One JSON object per case: a campaign in the shape `CampaignInput` accepts, plus a `label`.
`src/lib/eval-fixture.ts` is the schema, and it is the authority on the shape.

| Field                     | Meaning                                                                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                      | Stable key, unique across the corpus.                                                                                                                                          |
| `title`, `story`          | The campaign as submitted. The story is the only text a citation may come from.                                                                                                |
| `category`                | The platform's own merchandising label, as the organizer selected it. Evidence of nothing, and in some files deliberately at odds with what the story describes.                |
| `goalAmount`, `currency`  | The stated goal.                                                                                                                                                               |
| `organizer`               | Name, location, and the relationship to the beneficiary the organizer declared in a form field, which is not always what the story claims.                                     |
| `label.expectedFindings`  | A status for every one of the eight categories. A `supported` finding carries `mustCiteSubstring`, a span of the story a correct citation has to overlap.                       |
| `label.expectedEscalation`| Whether the case is expected to reach a human unfinished, and on which of the four conditions in `evaluateEscalation`.                                                          |
| `label.expectedMissingEvidence` | The categories where the reviewer must come away with something to ask.                                                                                                  |
| `label.notes`             | Why the case is labelled this way, in the reviewer's own terms.                                                                                                                |
| `label.difficulty`        | `clean`, `flagged` or `ambiguous`.                                                                                                                                             |

## How the set is composed

- **Clean** (0001 to 0005). Two poverty cases with the money reaching the person, one of them
  written plainly and one unpunctuated, because a pipeline that reads polished prose better
  than rough prose is scoring writing. A quantified interest-free loan falling due. A
  traveller stranded away from means he holds at home. And a profitable business raising for
  equipment, which is the case where eight negatives and no question is the correct output.
- **Flagged** (0006 to 0013). The cases where something has to be caught: money split between
  a documented arrears and restocking a shop, an eligibility asserted four times with nothing
  behind it, a stated administrative deduction, a shared water point, interest-bearing debt,
  convert care, an appeal made entirely of feeling, and a page that never says who the money
  is for.
- **Ambiguous** (0014 to 0018). Cases where two qualified reviewers could read the same
  paragraph differently: a displaced household holding property it cannot reach or sell, a
  student's college fees with a public benefit at the end of them, a debt taken on to settle
  a dispute between two other families, bail and a lawyer for a man held without trial, and a
  trading household in a bad season. Two of the five expect no refusal, because ambiguity in
  the reading is not the same event as a condition firing in the gate.

Two files are adversarial on purpose. 0007 asserts its own eligibility repeatedly and states
almost nothing else, and 0012 is written with real force of feeling and contains no financial
fact at all. Both are labelled so that a pipeline rewarding assertion or pathos fails them,
which a corpus of well-evidenced campaigns would never surface.

## How the labels were arrived at

1. **A status is a statement about the campaign text, never a determination of eligibility.**
   `supported` means the story itself says something bearing on the category. `not_supported`
   means the story tells against it or the category is plainly not in play. `insufficient
   evidence` means the category might be in play and the text does not settle it. A supported
   finding on a poverty case is not a finding that the household is below a threshold, which
   is established from statements and a caseworker rather than from prose.
2. **The statuses come from the evidence guidance and the research brief**, that is, the
   `evidenceGuidance` on each category in `src/lib/categories.ts` and sections 2 and 3 of
   `docs/RESEARCH.md`. Where the brief records a genuine disagreement, the label names it and
   stops. No label picks a school, and none of the ambiguous cases is labelled to a preferred
   answer.
3. **A difference is named where the category's application turns on it**, not wherever a
   category with a recorded disagreement appears. Cases 0002 and 0010 are the worked example:
   both are debts, and the brief treats debt as settled on principle and contested mainly on
   fact. 0002 states the facts the positions act on, so no difference is expected. 0010 says
   the borrowing carried interest, which puts lawfulness live, so a difference is expected.
   It rests on section 3.4 of the brief, which describes debt as comparatively settled on
   principle and contested mainly on fact. This is the most load-bearing single judgment in
   the corpus, because 0002 is the only clean label that depends on a difference *not* being
   named, so if the reading of 3.4 is wrong then a case the suite calls clean is one that
   should have been handed to a human. It is written down here so it can be argued with.
4. **Escalation expectations are read off the four conditions in `src/lib/escalation.ts`**,
   which are deterministic code, so an expectation is checkable against a rule rather than
   against taste. A stated administrative deduction is labelled as one use with a cost rather
   than as a split, on the ground that a pipeline reporting every disclosed overhead as mixed
   use would fire the wrong question at every competent organisation on the platform.
5. **`mustCiteSubstring` is an overlap target, not a required span.** A label should not have
   to guess which words a correct citation will pick out, only which part of the story it has
   to land in.
6. **`expectedMissingEvidence` is a subset of the categories the same label leaves open.** The
   schema enforces that, because a label asking for a question on a category it also expects
   resolved reports a defect no implementation could ever clear.

## What this corpus cannot prove

The labels were written by the person who wrote the stories. That single fact is the source
of every limit below, and none of them is fixable by adding more cases.

- **It measures behaviour against this repository's own expectations, not real-world
  accuracy.** A green run says the pipeline agrees with a documented standard that one author
  wrote down. It does not say the standard is right.
- **No false-negative rate against genuine adjudications can be derived from it.** Nothing
  here was decided by a qualified reviewer, so there is no adjudication to be wrong about.
  Section 4.3 and open question 9 of `docs/RESEARCH.md` are the wider version of the same
  problem: no zakat institution publishes an error rate, an audit result or an inter-rater
  reliability figure, so there is no published human baseline to serve as a denominator for
  anyone's accuracy claim, including this one.
- **A case is only as hard as its author could make it.** Blind spots are shared between the
  story and its label, so a failure mode neither anticipates is invisible to both. This is the
  specific reason a corpus like this cannot stand in for review by people who do this work.
- **It says nothing about prevalence or throughput.** The mix of case types was chosen to
  cover the eight categories and the four refusal conditions, not to resemble what a platform
  receives, so no rate, load or seasonal claim can be read out of the distribution.
- **A label can be wrong, and disagreement is the expected outcome on the ambiguous five.**
  The `notes` field exists so that a disagreement can be about a stated reason rather than
  about a bare verdict. Where a reviewer who knows the subject reads a case differently, the
  label is what should change.

One divergence is worth naming, as it is in the precedent corpus next door. The platform
documented in section 1.2 of the research brief does not verify traveller campaigns at all,
on the practical ground that a genuinely stranded person is unlikely to be able to run one.
Case 0003 is labelled as supporting the wayfarer category anyway, because the label is a
statement about what the text evidences and that refusal is a platform position rather than a
scholarly one. Section 3.5 is the reason it can be treated that way.

## The rule that governs this directory

Every file is parsed against `EvalFixture` rather than cast, and
`src/lib/__tests__/fixtures.test.ts` fails on a corpus that drops a category, points a
citation at words no organizer wrote, asks about a category it also expects resolved, or
loses its ambiguous cases. A fixture that is broken should fail as a broken fixture and not
as a pipeline defect.
