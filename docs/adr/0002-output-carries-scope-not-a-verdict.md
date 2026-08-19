# ADR-0002: Every finding carries madhab scope and a policy version, and the schema has no verdict field

Date: 2026-08-19
Status: accepted
Refines: ADR-0001

## Context

ADR-0001 established that the system never rules. It sketched a per-category output of
supported / not supported / insufficient evidence. Research since (`docs/RESEARCH.md` §1.3,
§1.4, §2.2, §2.3) showed that sketch is still too strong in one direction and too weak in
another.

Too strong, because "supported" reads as a verdict to a reviewer scanning at Ramadan volume,
and because for several categories the answer is genuinely different depending on which
school is applied. LaunchGood's own published policy prints the four-madhab split on
*al-mu'allafah qulubuhum* without declaring a house position: Hanafis hold it inapplicable
after the Prophet's lifetime, Malikis extend it to non-Muslims, Shafi'is to new Muslims,
Hanbalis to both. A single unscoped "supported" is not a compressed answer to that. It is a
wrong one.

Too weak, because LaunchGood does not treat "Zakat-verified" as a single binary. It exposes
donor-side toggles so a donor can include or exclude contested categories from their own
zakat. That means the platform's own product model is per-category and donor-conditional, and
a tool emitting one badge-shaped answer does not fit the surface it feeds.

Two further facts made versioning non-optional. On 30 January 2026 the Fiqh Council of North
America and AMJA's Resident Fatwa Committee jointly issued a fatwa moving a category boundary,
and Darul Qasim College publicly rejected it. A category definition changed inside the last
seven months and is contested right now. And LaunchGood's policy itself is a dated document
(24 February 2025) that renumbers the canonical categories in its operational section, so
"the categories" is not a fixed referent even within one organisation.

## Decision

The unit of output is a **finding**, not a determination. One campaign yields zero or more
findings. The schema is:

    Finding
      category              one of the eight, by canonical index
      madhab_scope          the school(s) under which this reading holds
      policy_version        identifier of the policy document this was produced under
      supporting_spans[]    verbatim character ranges in the campaign text
      missing_evidence[]    ranked, minimal, what a reviewer would need to see
      precedent[]           prior adjudicated cases, by id, with their recorded outcome
      escalation_question   optional; one specific question for a human

There is **no field in this schema that can hold an eligibility verdict**, and no field that
holds a confidence score. Adding one is a schema change, reviewable in a diff, not a prompt
tweak. A CI property test asserts the absence.

Category definitions, madhab positions and the verify / do-not-verify rules live in a
versioned policy corpus loaded at runtime. They are never fine-tuned into a model and never
inlined in a prompt template. Every finding stamps the version it was produced under, so a
finding produced before a policy change is identifiable as such after one.

Where the policy corpus is silent, the system emits an escalation question and no finding.

## Alternatives considered

- **Keep the ADR-0001 tri-state per category, unscoped.** Rejected on the four-madhab split:
  the same campaign is genuinely supported under Maliki reasoning and inapplicable under
  Hanafi reasoning, and one value cannot carry both without lying about one of them.
- **Declare a house madhab and resolve ambiguity by fiat, as National Zakat Foundation does
  ("NZF uses the Hanafi Fiqh criteria").** Rejected for this tool, though it is a legitimate
  institutional choice. NZF is the institution and can set its own policy; this system is a
  tool offered to an institution that has *not* declared one, and picking on its behalf is
  exactly the overreach ADR-0001 forbids. The schema supports a declared default if
  LaunchGood ever sets one: it becomes a filter over findings, not a change to the type.
- **Emit a verdict plus a `scope_caveat` string.** Rejected: the caveat is unread and the
  verdict is anchoring. If the caveat is load-bearing it belongs in the type, not beside it.
- **Confidence score per category.** Rejected, extending ADR-0001's reasoning: there is no
  calibration set, the ground truth is contested scholarly judgment, and a number invites the
  deference this design exists to prevent.
- **Bake the policy rules into the prompt.** Rejected: the January 2026 boundary move would
  have silently invalidated every historical output with no way to tell which ones.

## Consequences

Easy: the tool survives a fiqh disagreement without being wrong, and it fits the donor-toggle
product surface LaunchGood already ships. Findings are re-auditable after a policy change
because each one names its policy version. Multi-madhab handling is a data question, so
adding a school is a corpus edit rather than a code change.

Hard: the output is a list rather than an answer, so the reviewer interface has to do real
work to stay readable at volume, and the demo has to earn its clarity rather than assert it.
Precedent retrieval assumes prior decisions are logged in a retrievable form, which is
Open Question 3 and unresolved. And a policy corpus is a maintained asset with an owner, not
a file checked in once.

Lived with deliberately: on a campaign where the policy is silent, this system returns a
question and nothing else. That is the correct behaviour and it will occasionally look like
the tool did nothing.
