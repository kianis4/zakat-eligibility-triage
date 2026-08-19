# ADR-0007: Nothing about a scholarly position is model-authored

Date: 2026-08-19
Status: accepted

Raised in #14.

## Context
ADR-0001 keeps the system out of the ruling business, and ADR-0003 makes every citation of the
campaign a verbatim span the server can check by slicing a string. Neither covers the other
text a triage file carries: what recognised scholars hold. That was written by the model. A
finding carried `scholarlyDifference: { topic, note }`, and the note was prose the model
produced describing a disagreement between named bodies, which the escalation step then put in
front of a reviewer beside the corpus summary, in the same paragraph and in the same voice.

Two 2025 benchmarks, recorded in section 5.6 of `docs/RESEARCH.md`, say why that is the wrong
place to leave it.

Bouchekif et al. (arXiv:2509.01081) evaluate seven models on 1,000 expert-reviewed
multiple-choice questions in Islamic inheritance law. Their error analysis states that "some
models base their reasoning on fabricated Quranic verses or prophetic narrations that do not
appear in any canonical collection", and their analysis of correct answers adds that "accuracy
alone provides an incomplete and potentially misleading assessment". Inheritance law is the
most algorithmic area of fiqh available to test. Fabrication there is a floor for what to
expect on a discretionary, school-contingent reading of a campaign story, not a ceiling.

Atif et al. (arXiv:2508.08287, AIES 2025) evaluate 960 questions across the four Sunni schools
in Arabic and English, and measure abstention rather than accuracy alone. Under basic
abstention prompting, "for English, GPT-4o exhibits no abstention, producing outputs for all
inputs". The strongest model on accuracy was the least willing to decline. That is the
load-bearing result for this repository: a model that will not abstain when it is instructed to
cannot be trusted to abstain when it matters, so a refusal has to be a shape the output can
take rather than a behaviour a prompt requests.

## Decision
**No Qur'anic text, hadith, fatwa passage or policy clause is ever model-authored, as quotation
or as paraphrase, and the schema is what enforces it.** Paraphrase is the more dangerous of the
two, not the safer one: it carries the same authority to a reader and there is nothing to diff
it against.

Concretely, four things.

1. **A scholarly difference is selected, never described.** Every entry in
   `SCHOLARLY_DIFFERENCES` carries a stable id. The model-facing schema offers a `z.enum` over
   that closed set plus `whyThisApplies`, one bounded sentence about what this campaign does
   that puts it inside the difference. An id outside the set fails schema validation. The
   server resolves the id to the human-authored entry, and the output type carries that entry
   with its id; parsing rejects an entry whose text is not what the corpus holds under that id,
   so it cannot be edited in transit by a model, a fixture or a JSON round-trip. The invariant
   that results: **everything the pipeline renders in a citation position is either a verbatim
   span of the campaign, byte-checked by ADR-0003, or versioned in-repo human-authored
   reference data retrieved by id.** `src/lib/__tests__/mapping-types.test.ts` asserts the
   model-facing scholarly-difference field is the id enum and the bounded why and nothing else,
   and that no field anywhere in the model-facing schema is named in a way that invites a
   position, a ruling or a source text.

   The bounds on `whyThisApplies` are part of the guarantee rather than tidiness. One sentence
   has no room for an account of a school's reasoning; a quotation mark or a chapter-and-verse
   reference is the shape scripture arrives in and is refused outright. The escalation question
   carries it as the model's sentence about the campaign, next to the corpus text, which is the
   only description of the disagreement anywhere in the system.

2. **Every mapping is stamped with a policy version.** `POLICY_VERSION` is a sha256 over the
   canonical form of the category definitions, the scholarly differences and the cross-cutting
   restrictions, truncated to twelve hex characters and computed at module load.
   `mapCategories` stamps it server-side; the model-facing schema has no such field. The
   guidance data is the policy corpus, and it moves: the Fiqh Council fatwa recorded under
   al-mu'allafati qulubuhum is dated January 2026. Without a stamp there is no way to tell
   which stored outputs a policy change invalidated. A content hash rather than a number
   someone raises by hand, because the failure of a manual version is silence.

3. **`CategoryVerdict` is now `CategoryFinding`.** The type records what campaign text does and
   does not say about a category. Nothing in it rules, and the name said otherwise before a
   reviewer read a line of it. The three status strings are unchanged: they are on disk in the
   precedent fixtures, and they are statements about evidence rather than rulings.

4. **The empirical record is in the brief.** Section 5.6 of `docs/RESEARCH.md` cites both
   papers from pages that were fetched, and marks the step from inheritance law to campaign
   triage as an inference of the issue rather than a finding either paper states.

## Alternatives considered
- **Drop the tri-state status for a status-free `Finding` record**, as the issue proposes:
  category, madhab scope, policy version, supporting spans, missing evidence, precedent,
  escalation question, and no status field at all. The argument is strong and it is the same
  argument this repository is built on. A ruling should not be expressible, "the model is
  instructed not to rule" is not a control, and putting the refusal in the shape of the data is
  the only place it holds. Rejected because the status is not the ruling. It is the triage
  information the reviewer acts on, and the distinction it draws is the one the queue turns on:
  `not_supported` says the text bears on the category and tells against it, while
  `insufficient_evidence` says the text is silent and names the fact that would settle it.
  Collapsing them hands the reviewer a pile of spans and no reading of them. The discriminated
  union is also what makes an uncited supported finding unconstructable (ADR-0003) and what
  types the missing fact and the organizer question onto exactly the status that cannot be
  acted on without them. The property the issue wants from the removal already holds: no
  eligibility verdict and no confidence score is representable anywhere in the output, ADR-0001
  keeps the authority boundary, and the no-numbers property test the issue asks for exists in
  `src/lib/__tests__/mapping-types.test.ts` and walks the generated JSON schema.
- **A per-finding `madhab_scope`, naming the school or schools under which a reading holds.**
  The motivation is real and documented: section 3 of the brief shows campaigns that are
  genuinely supported under one school's reasoning and inapplicable under another, and one
  unscoped value cannot carry both without lying about one of them. Rejected because the
  pipeline cannot ground the claim. Producing "supported under Maliki reasoning" means the
  model authoring school-specific fiqh, which is exactly what item 1 forbids and exactly what
  Bouchekif et al. measure going wrong. The retrieved-difference mechanism carries the same
  information without that: it names which recognised difference the campaign sits inside, in
  human-authored text that states every position, and leaves which position applies to the
  reviewer, which is where ADR-0001 already put it.
- **A CI check that every rendered citation matches a corpus entry byte for byte**, as the
  issue specifies. Not rejected, and largely subsumed: the check now runs at parse time on
  every mapping rather than in CI on a sample, because the difference text is retrieved by id
  and re-checked against the corpus by the schema. What remains for a later issue is the same
  check over the reviewer UI once it renders more than the campaign and its precedent.
- **Leave the note and instruct the model to be neutral.** Rejected by the Atif result. The
  instruction that a model most reliably ignores in this domain is the instruction to hold
  back.

## Consequences
Easy: there is no longer any text in the system describing a scholarly position that a human
did not write, so review of that text is review of one file rather than of model output.
Changing what the platform says a difference is becomes an edit to `SCHOLARLY_DIFFERENCES`,
visible in a diff, and it moves `POLICY_VERSION` on its own. Stored mappings are comparable
only when their stamps match, which is the honest reading.

Hard: the pipeline can only name a difference the corpus already holds. A campaign sitting
inside a disagreement nobody has written up gets `null` and a rationale, so coverage of the
difference machinery is now bounded by the corpus rather than by the model's knowledge, and
extending it means an ADR-worthy edit to reference data rather than a prompt change. That is
the trade being made deliberately: the previous behaviour covered every case, and covered the
uncovered ones by inventing them.

We also accept that `whyThisApplies` is model-authored prose reaching a reviewer. It is bounded
and it is about the campaign, and the reviewer sees it under its own name beside the corpus
text rather than blended into it. The residual risk is a sentence that characterises the
disagreement in passing while appearing to describe the campaign. The bound, the quotation ban
and the prompt are what stand against it, and if that proves insufficient the next step is to
require the sentence to quote the story rather than to loosen anything here.
