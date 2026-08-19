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

The type system carries the rule as well. `CategoryVerdict` is a discriminated union on
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
