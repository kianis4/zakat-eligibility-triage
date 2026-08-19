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
under `tsc`. Neither command touches the network, including the tests of the eval harness
itself, which drive the real pipeline against mock models.

The eval run does touch the network, because measuring the pipeline means running it:

```sh
export ANTHROPIC_API_KEY=...   # a missing key fails the run rather than skipping it
npm run evals
```

It takes the eighteen labelled campaigns in `fixtures/evals/`, runs each one through
extraction, mapping, the missing-evidence report and the refusal gate, scores four things a
label can be right about, then asks a second model for a pass or fail on four things a label
cannot see. It writes `evals/report.md`, which is gitignored, prints the gate arithmetic to
the terminal, and exits non-zero if any gate was missed.

| Gate | Bar |
| --- | --- |
| Citation validity | 100%, every citation slicing its own quote back out of the story and landing where the label says |
| Category agreement | 80% of the 144 category judgments |
| Escalation agreement | 75% of fixtures, on an exact match of the refusal-kind set |
| Missing-evidence coverage | 80% of the categories the corpus expects a question on |
| Judge: nothing adjudicates or rules | zero failures, no rate |
| Judge: the other three dimensions | 85% each, gated separately |

Citation validity is the only bar at 100 because a citation is the one output that is either
true or a fabrication that looks identical to a real one on the page. The rest sit well below
it on purpose, since five of the eighteen cases are labelled ambiguous precisely because two
qualified reviewers could read them differently. Every number is a first calibration and moves
only in a commit that argues from a report. `docs/adr/0009-eval-design.md` sets out why the
deterministic and judged halves are split, why the judge is never shown the label or the
precedent corpus, and what a fully passing run would and would not prove.

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
