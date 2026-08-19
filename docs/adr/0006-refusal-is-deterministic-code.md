# ADR-0006: The decision to refuse is deterministic code, not model judgment

Date: 2026-08-19
Status: accepted

## Context
ADR-0001 commits the system to preparing evidence rather than ruling, and section 6.3 of
`docs/RESEARCH.md` argues that the correct behaviour on a hard case is to stop, name what is
contested or missing, and hand the file to a human. Nothing enforced that. The mapping step
happily produces eight well-formed verdicts for a campaign that splits its money between a
named family's debt and a community centre's programme, and a well-formed mapping reads as a
finished one.

So the pipeline needs a gate that stops. The question is what runs the gate. Every condition
that should trigger a refusal is a condition in which the model's own reading of the campaign
is what is in doubt: the uses are mixed, the category turns on a disagreement between
recognised scholars, the story asserts an eligibility it does not evidence, or nothing came
back resolved at all.

## Decision
The refusal rules are plain functions over the typed output of the earlier stages.
`evaluateEscalation` takes the campaign, the extracted facts and the category mapping and
returns an `EscalationDecision`. It is pure and deterministic: no model call, no clock, no
network. The same campaign evaluated twice refuses for the same reasons in the same order.

Four conditions fire it: mixed use, scholarly difference, an eligibility claim with no
supported category behind it, and a story that resolved nothing about a beneficiary it never
identified. Each produces a reason carrying the specific question a reviewer answers and the
spans of story that raised it. `EscalationDecision` is a discriminated union whose escalating
member types its reason list as non-empty, so a refusal with nothing on it does not compile.

The decision carries no numeric field of any kind.

## Alternatives considered
- **The model self-assesses its confidence and decides whether to escalate.** Rejected on two
  grounds that compound. The component being doubted cannot be the arbiter of the doubt: in
  every one of these conditions it is the model's reading that is in question, and a model
  asked whether it is sure enough will sometimes say yes. And ADR-0001 already rejected a
  confidence threshold, because the number would need calibrating against a ground truth that
  is scholarly judgment. Moving the same number from the verdict to the gate does not fix it,
  it only moves where the uncalibrated figure decides.
- **A second model call as a reviewer of the first.** Rejected: it doubles the cost per
  campaign and buys a disagreement with no principled resolver, since neither call has
  standing over the other and a tie needs the human this stage exists to reach anyway. It is
  also unnecessary. The mixed-use signal and the scholarly-difference note are already in the
  typed output, put there by the mapping step while the story was in front of it. Reading a
  field is not a judgment call.
- **A generic `needs_review` flag.** Rejected by the issue and by the point of the product. A
  refusal without the question hands the triage work straight back to the person the triage
  was for, and it does so at the moment their queue is longest. The reviewer still has to
  read the campaign, find the ambiguity, and work out what to ask, which is all of the work.

## Consequences
Easy: the gate is auditable by reading it, the rules are testable without a network, and a
change to what the platform refuses on is a diff rather than a prompt edit whose effect has
to be measured. The reasons are stable across runs, so a reviewer comparing two evaluations
of the same campaign is looking at a real difference.

Hard: the rules only see what the earlier stages recorded. A mixed use the mapping step did
not signal is a mixed use this gate does not catch, so a recall failure upstream stays a
recall failure, and the coverage of the refusal is bounded by the coverage of the extraction
and mapping prompts rather than by anything here. Adding a fifth condition means writing code
and a test rather than adding a sentence to a prompt, which is slower and is the trade being
made deliberately.

We also accept that `nothing_resolvable` will fire on some campaigns a reviewer would have
dispatched without help. It is deliberately narrow, requiring every category unresolved *and*
an unidentified beneficiary, so it lands on stories that genuinely say nothing rather than on
thin ones. It is kept because the question it asks is one the other three assume away: whether
this campaign is worth a round of correspondence at all. If it proves noisy in practice, the
fix is to drop the condition, not to soften the question it asks.
