# Zakat-Eligibility Triage

A triage agent for crowdfunding campaigns. It assembles evidence for a qualified human
reviewer and **never issues a religious ruling**.

Zakat is obligatory almsgiving and may only go to the categories of recipient named in
Surah At-Tawbah (9:60). Donors filter for zakat-eligible campaigns, hardest during Ramadan,
which is exactly when review capacity is most saturated. A wrong determination on a Muslim
giving platform is a religious problem, not only an operational one.

So this system does not decide. For a submitted campaign it:

1. extracts a typed record from free-text campaign copy
2. maps the text against each recipient category as supported / not supported /
   insufficient evidence, citing the exact span behind every mapping
3. reports what evidence is missing and what a reviewer should ask the organizer
4. retrieves comparable previously-adjudicated cases and shows them to the reviewer as
   precedent, rather than feeding them back to the model to imitate
5. refuses to determine ambiguous cases and escalates with the specific question a human
   must answer
6. records the human decision, which is authoritative and overrides the agent

Every claim it makes is traceable to a span of the campaign it read. Nothing is a bare score.

## Trust boundary

The agent prepares the file. A qualified human adjudicates. That boundary is architectural,
not a disclaimer: there is no code path in which a determination is published without a
recorded human decision.

## Evaluation

`docs/adr/` records the decisions. The eval suite runs in CI with a failing threshold and
includes cases the system gets wrong on purpose, because a suite that only contains cases it
passes measures self-consistency rather than accuracy.

Run `npm test` and `npm run typecheck`, both. Part of the suite is enforced by the compiler
rather than by the test runner: `src/lib/__tests__/mapping-types.test.ts` proves that a
supported finding with no citation does not typecheck, and a proof of that shape only fails
under `tsc`.

## Data

Two corpora, both synthetic and written by hand for this repository. No real campaigns, no
scraped charity data, no real organizations or organizer names, no personal information.

- `fixtures/precedents/` holds previously adjudicated cases with the reviewer's recorded
  reasoning, seeded into the retrieval index and shown to a reviewer as reference.
  Provenance: [`fixtures/precedents/README.md`](fixtures/precedents/README.md).
- `fixtures/evals/` holds labelled campaigns for the eval suite, each stating the per-category
  status, the refusal, and the questions this repository expects. Provenance, including what a
  self-authored corpus cannot prove: [`fixtures/evals/README.md`](fixtures/evals/README.md).

Both notes say the same thing in different words, and it belongs here too: a corpus written by
the same person who wrote the system measures consistency with a documented standard, not
real-world accuracy, and no error rate against genuine adjudications can be derived from it.
