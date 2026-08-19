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
**Everything the pipeline puts in a citation position is either a verbatim span of the campaign,
byte-checked under ADR-0003, or versioned in-repo human-authored reference data retrieved by id.
No Qur'anic text, hadith, fatwa passage or policy clause reaches a reviewer as something a model
wrote.** That is a schema property and it is the whole of what the schema can give.

Model free text remains in the output: the rationale, the missing fact, the organizer question,
the mixed-use description and the one-sentence why on a scholarly difference. Those fields are
shape-guarded against quotation and citation-shaped text, they cannot be guarded against an
unquoted paraphrase, and they are always rendered as the model's own prose, never as a quotation
and never as a citation. Paraphrase is the more dangerous of the two forms, not the safer one: it
carries the same authority to a reader and there is nothing to diff it against, which is exactly
why the material that would be paraphrased is retrieved rather than generated.

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
   has no room for an account of a school's reasoning. The escalation question carries it as
   the model's sentence about the campaign, next to the corpus text, which is the only
   description of the disagreement anywhere in the system.

   The same shape guard, `src/lib/model-prose.ts`, runs on every field the model writes prose
   into: `rationale`, `missingFact`, `questionForOrganizer`, the mixed-use `description` and
   `whyThisApplies`, on the model-facing schema and the output schema both. It refuses
   quotation marks, chapter-and-verse references, a source word cited near a number, and a
   saying attributed to the Prophet or to God. It was added after a verification pass put
   fabricated scripture through all four of the fields the first version of this ADR left
   uncovered.

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
Easy: the description of a scholarly position that a reviewer reads is a file a human wrote, so
reviewing that text is reviewing one file rather than reviewing model output. Changing what the
platform says a difference is becomes an edit to `SCHOLARLY_DIFFERENCES`, visible in a diff, and
it moves `POLICY_VERSION` on its own. Stored mappings are comparable only when their stamps
match, which is the honest reading.

Hard: the pipeline can only name a difference the corpus already holds. A campaign sitting
inside a disagreement nobody has written up gets `null` and a rationale, so coverage of the
difference machinery is now bounded by the corpus rather than by the model's knowledge, and
extending it means an ADR-worthy edit to reference data rather than a prompt change. That is
the trade being made deliberately: the previous behaviour covered every case, and covered the
uncovered ones by inventing them.

The residual is model prose, and it is stated here rather than left to be discovered. Five
fields carry the model's own words to a reviewer: `rationale`, `missingFact`,
`questionForOrganizer`, the mixed-use `description` and `whyThisApplies`. `rationale` is the one
to watch, because rule 6 of the mapping prompt tells the model to put unresolved discussion of a
difference into it, which makes it the field most likely to reach for a source, and it was the
field with no guard at all until a verification pass demonstrated fabricated scripture passing
through it. The guard now covers it and the other four.

What the guard does is refuse a shape: quotation marks, a chapter-and-verse reference, a source
word cited near a number, a saying attributed to the Prophet or to God. What it cannot do, and
what no schema can do, is detect an unquoted paraphrase. A sentence stating in the model's own
words what a source says carries the same authority to a reader and has no shape to match on.
Two things stand against that residual and neither is a schema: the prompt, which now says the
validation refuses citation outright so the model states facts about the campaign text instead;
and the rule that model prose is always rendered as the model's prose, never styled or
introduced as a quotation or a citation. That rendering rule has no enforcement point yet,
because the reviewer UI renders only the campaign and its precedent. It is a requirement on the
reviewer-UI issue, and the place where this ADR is easiest to violate without touching any of
the code it constrains.

## Addendum, 2026-08-19: the model-facing schema is a list of findings

Raised in #23. The model-facing schema named the eight categories as eight properties, each a
three-member union carrying a nullable difference selection. The provider's structured-output
compiler counts union-typed parameters and refuses a schema that declares too many: thirty-two
against a limit of sixteen, so every live mapping call failed before the model saw a word of the
campaign. Unit tests missed it because a mock never compiles a schema.

The model now returns `findings`, a list of one item per category with the category id inside the
item, so the schema describes one item rather than eight copies of one. The item declares one
union-typed parameter, the nullable `scholarlyDifference`, and
`src/lib/__tests__/mapping-types.test.ts` counts them and holds the total under the limit.

Nothing this ADR decides is changed by that. The difference is still selected by id from the
closed enum and resolved server-side to the corpus entry, `whyThisApplies` is still the one
bounded sentence, `modelProse` still guards all five prose fields, and `POLICY_VERSION` is still
stamped server-side and absent from the model-facing schema. The tests that assert those points
walk the item schema now instead of a per-category property.

Two things move rather than disappear. The per-status field requirement, which the discriminated
union used to carry as a shape, is a check on the flat item: a supported finding with no quote,
or an unresolved one missing its fact or its question, fails parsing as it did before. And the
list can say what the record could not, a category twice or a category not at all, so the fold
back into `CategoryMapping` refuses both with `MappingError('schema_validation_failed')` rather
than let a finding be silently overwritten or silently absent. The output type is unchanged;
`CategoryFinding` remains the discriminated union ADR-0003 relies on.
