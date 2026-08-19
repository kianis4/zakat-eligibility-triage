# ADR-0003: Models emit verbatim quotes, the server resolves the offsets

Date: 2026-08-19
Status: accepted

## Context
ADR-0001 commits the system to a citation behind every supported mapping: no span, no
support. That turns the citation into the load-bearing part of the output, so it has to be
checkable by machine rather than merely present. A citation is checkable when it names a
range of the campaign story and the text at that range is the text the citation claims.

The model is the only component that knows which words support a mapping, and it is the
worst available component for saying where those words are. Character offsets are a
counting task carried out on tokenised text; a model produces plausible integers for them,
and a plausible integer is indistinguishable from a correct one until someone slices the
string. An off-by-forty citation points a reviewer at the wrong sentence while looking
exactly like a good one.

## Decision
The model-facing schema contains quote strings and no offsets. A server-side pass locates
each quote in `campaign.story` by exact search and constructs the citation from the result,
so `story.slice(start, end) === quote` holds for every citation the module hands out by
construction rather than by inspection.

A quote that cannot be located is a hard failure: `MappingError('citation_unresolvable')`.
The verdict does not survive without its citation.

The type system carries the rule as well. `CategoryFinding`, named `CategoryVerdict` when
this was written and renamed by ADR-0007, is a discriminated union on
`status`, and the `supported` member requires a non-empty citation array in both the zod
schema and the TypeScript type. An uncited supported verdict is not discouraged, it is
unconstructable, so the guarantee holds against future code that has not read this ADR.

## Alternatives considered
- **Model emits offsets directly.** Rejected: LLMs miscount characters, and the failure is
  silent. Validating the offsets against the story would catch it, but at that point the
  model's numbers have been thrown away and the search is doing the work anyway.
- **Fuzzy or embedding match to rescue a near-miss quote.** Rejected: a quote that needs
  rescuing is not a quote from the story. Rescue converts a caught fabrication into an
  accepted citation that points at text the organizer did not write, which is the exact
  failure the citation requirement exists to prevent. Fail closed instead.
- **Keep the verdict and drop the unresolvable citation.** Rejected on the same ground and
  worse: it produces a supported verdict with no evidence behind it, and it does so quietly.
- **Runtime validation alone, with a plain `citations: Citation[]` field.** Rejected: it
  makes the invariant a thing every caller has to remember. The union costs one type
  definition and enforces it at every construction site.

## Consequences
Easy: every citation in the system is verifiable with a string slice, the reviewer UI can
highlight spans without trusting the model, and the eval harness can check citation
correctness mechanically rather than by reading.

Hard: a model that paraphrases even slightly, fixes a typo in the organizer's text, or
joins two fragments produces a failure rather than a mapping, so mapping is more brittle
than it would be with fuzzy matching, and prompt work has to carry the verbatim requirement.
That brittleness is the guarantee doing its job. We also accept that a quote occurring
twice resolves to its first occurrence, which is deterministic and lands the reviewer on
identical text either way.

## Addendum 2026-08-19: one re-ask, with the failure named

The brittleness above turned up in the eval gate as thrown fixtures rather than as wrong
findings. Across runs, three cases threw: `eval_0003` failed extraction on a paraphrased quote
for the second run in a row, and `eval_0007` and `eval_0015` failed mapping schema validation.
A thrown fixture fails every dimension it is scored on, so the three of them took
missing-evidence coverage to 76.9% against an 80% floor. The failures were also mute: the SDK
reports a rejected response as "no object generated" and buries the zod error two causes down,
so a run said which fixture died and not which field killed it.

`extractFacts` and `mapCategories` now re-ask once. A response that fails validation is handed
back to the model with the failure named in it, the field, the rule and the offending value,
and the same request is asked again. A second failure throws the same typed error as before.
A call that never completed is not re-asked, because it produced no answer to correct and
retrying transport belongs to the SDK. The zod issues are lifted out of the cause chain into
the thrown error's own message, so a live failure now names its cause instead of inviting a
guess at it.

This is not the fuzzy rescue rejected above, and the distinction is worth stating precisely.
Rescue accepts a quote the story does not contain by deciding a near miss was close enough,
which puts text the organizer never wrote in citation position. A re-ask accepts nothing: the
schema is the same schema, the verbatim check is the same check, and the only thing that
changed is that the model gets to read its own failure and answer the same question again. The
contract is untouched, byte-exact or refuse. What moved is the number of chances, from one to
two.

The cost is one extra model call on a failing case, and the risk taken with it is that a model
handed its own failure produces a differently wrong answer twice. That costs a call and lands
where it landed before, on the error, which is why the count is fixed at two and not left to a
loop.
