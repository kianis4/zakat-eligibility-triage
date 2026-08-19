# ADR-0001: The agent never issues a religious ruling

Date: 2026-08-19
Status: accepted (output schema refined by ADR-0002)

## Context
Zakat eligibility is a religious determination. Automated fatwa generation is widely regarded
as inappropriate, and the categories in Surah At-Tawbah 9:60 include at least one
(fi sabilillah) where recognised scholars genuinely differ in ways that change a campaign
outcome. A system that outputs "eligible: true" is making a claim it has no standing to make.

## Decision
The system produces a triage file, never a determination. For each recipient category it
emits supported / not supported / insufficient evidence with a citation to the exact span of
campaign text, plus a missing-evidence report. A qualified human records the decision, and
that decision is authoritative.

There is no code path that publishes an eligibility outcome without a recorded human decision.

## Alternatives considered
- **Model outputs a determination, human reviews it.** Rejected: anchoring. A stated verdict
  becomes the default and review degrades into rubber-stamping.
- **Confidence score with a human-review threshold.** Rejected: a threshold is still the
  machine deciding, just with extra steps, and the number would be uncalibrated against a
  ground truth that is scholarly judgment.
- **Retrieval-augmented ruling citing fiqh sources.** Rejected: correctly citing a source is
  not the same as correctly applying it, and the failure would be confident and plausible.

## Consequences
Easy: the trust story, the audit trail, and honest behaviour on the ambiguous cases that
matter most. Hard: the product is less impressive in a naive demo, because the headline
output is a prepared file rather than an answer. Accepted deliberately; the refusal is the
feature.
