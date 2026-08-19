# ADR-0002: One TypeScript runtime, structured outputs via the AI SDK, no agent framework

Date: 2026-08-19
Status: accepted

## Context
The pipeline needs schema-validated model output (extraction, category mapping), a database,
a reviewer UI, and an eval harness. The stack question is whether the model-facing layer
earns a second runtime (Python, where Pydantic AI and LangGraph live) or an orchestration
framework at all.

## Decision
TypeScript end to end. Model calls go through the Vercel AI SDK's `generateObject` with zod
schemas; the schema that validates the model response is the same type the UI and database
layer consume. Models are injected as parameters so unit tests run against mock models and
live calls are confined to the eval harness.

No agent framework. The pipeline is a linear assembly with rule-based gates: extract, map,
report gaps, retrieve precedent, escalate or hand to a human. There is no cyclic tool-use
loop, no planning step, and, by ADR-0001, no autonomy at the decision point.

## Alternatives considered
- **Pydantic AI in a Python service.** Structurally the same offering (typed, validated
  model outputs) at the cost of a second runtime, a second deploy target, and a serialization
  boundary between the extraction types and the UI that renders them. Rejected: zod already
  provides validated structured outputs inside the runtime that owns the UI and the database.
- **LangGraph or similar orchestration.** Graph state machines pay for themselves when
  control flow is dynamic. This control flow is fixed by design; the interesting decisions
  (refuse, escalate) are deterministic rules over typed output, which we want auditable in
  plain code, not framework config.
- **Raw Anthropic API calls with hand-rolled JSON parsing.** Rejected: re-implements the
  schema-enforcement and error taxonomy the AI SDK already provides, and hand-rolled parsing
  is exactly where silent degradation creeps in. A malformed response must throw
  (`ExtractionError`), not coerce.

## Consequences
Easy: one deploy, one type system, mockable models, test suite runs with no network.
Hard: we take a dependency on AI SDK release cadence, and we forgo the agent-framework
résumé line; if a future workflow genuinely needs cyclic tool use, that becomes a new
decision, not a default.
