# ADR-0003: The system never generates scripture, and citations are retrieval-only

Date: 2026-08-19
Status: accepted

## Context

The categories this system reasons about come from a single Qur'anic verse, and the
institutional policies interpreting them quote scripture and fatwa text directly. The obvious
implementation lets the model quote its grounding. The evidence says not to.

Bouchekif et al. (ArabicNLP 2025, arXiv:2509.01081) evaluated frontier and open models on
1,000 expert-reviewed questions in Islamic inheritance law and found, verbatim, that "some
models base their reasoning on fabricated Quranic verses or prophetic narrations." Accuracy
fell from 86.8% on beginner items to 61.2% on advanced ones for GPT-4.5. Inheritance law is
the most algorithmic area of fiqh: fixed shares, arithmetic, minimal discretion. If models
fabricate scripture on the most rule-bound sub-domain available, the prior for a
discretionary, madhab-contingent task is worse, not better.

Atif et al. (arXiv:2508.08287) found GPT-4o at 46% in English and 28% in Arabic across four
Sunni schools, and, importantly here, that under basic abstention prompting in English
"GPT-4o exhibits no abstention." The strongest model was the least willing to decline. So
"instruct it not to make things up" is not a control.

Egypt's Dar al-Ifta' has stated that it is impermissible in Islamic law to rely on AI
applications to obtain a fatwa. Independent of the engineering argument, a fabricated verse
attributed to a system operating in this domain is a category of harm that no amount of
downstream review makes acceptable.

## Decision

The system does not generate scriptural, prophetic or juristic text. Not as a quotation, not
as a paraphrase, not as a justification.

Any Qur'anic verse, hadith, fatwa passage or policy clause that appears in output is
**retrieved verbatim from the versioned policy corpus and carries its source identifier**.
The model's role is to select which stored passage is relevant and to point at campaign text;
it never authors the passage.

This is enforced structurally, not by instruction. Model-authored fields are separated from
retrieved fields in the schema, and a CI check asserts that every rendered citation matches a
corpus entry byte-for-byte. A citation with no corpus match fails the build. There is no
formatting path that renders model-generated text in a citation position.

Where no stored passage covers the situation, the system says so and escalates. It does not
reason from memory to fill the gap.

## Alternatives considered

- **Let the model quote and add a verification pass.** Rejected: a verifier catches
  mismatches against a corpus, which is the retrieval design with an extra generation step in
  front of it. The generation step adds risk and nothing else.
- **Prompt the model to abstain when unsure.** Rejected on Atif et al.: the strongest model
  tested showed no abstention under exactly this prompting. Abstention has to be a property
  of the type, not a request.
- **Fine-tune on a curated fiqh corpus.** Rejected: fine-tuning makes the corpus
  unversionable and unauditable, which collides directly with ADR-0002, and the January 2026
  boundary move shows the corpus is not static.
- **Allow paraphrase but not direct quotation, on the theory that paraphrase is not
  attribution.** Rejected as the more dangerous option: a paraphrase carries the same
  authority to a reader and is harder to check, since there is nothing to diff it against.

## Consequences

Easy: every citation in every output is checkable against a file in this repository, and
fabricated scripture is a build failure rather than a discovered incident. The corpus doubles
as the audit trail.

Hard: coverage is bounded by the corpus, so the system is silent on anything not yet ingested,
and building that corpus is real editorial work requiring qualified review. Output reads
drier than a fluent generated explanation, which is a demo cost accepted on purpose.

Lived with: the system cannot explain *why* a passage applies in its own words without
crossing this line, so explanation is the reviewer's job, supported by spans and stored text.
That is the same trade ADR-0001 made, applied to language rather than to verdicts.
