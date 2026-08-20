# Zakat-Eligibility Triage

A triage agent for crowdfunding campaigns. It reads a submitted campaign, assembles the evidence a
zakat determination would turn on, names what the text leaves missing or contested, and hands the
file to a qualified human reviewer. It **never issues a religious ruling**. Every claim it makes
is traceable to a span of the campaign it read, and nothing it produces is a score.

The deployed prototype is public and needs no credentials:
**https://zakat-eligibility-triage.vercel.app**. Submit a campaign, watch the pipeline run, and
read the reviewer file it assembles. `docs/RESEARCH.md` is the sourced domain brief this design
argues from, and `docs/adr/` holds the nine decision records the invariants below cite.

## The problem

Zakat is obligatory almsgiving, and it may only go to the eight categories of recipient named in
Surah At-Tawbah (9:60). The word rendered "only" is why the list is read as exhaustive rather than
illustrative, so eligibility is a question about which named category a campaign falls under and
not about how deserving it looks. Donors on a Muslim crowdfunding platform filter for campaigns
carrying the designation, which makes the designation a claim the platform makes on a donor's
behalf about whether an obligation will be discharged.

That review load is not spread evenly through the year. LaunchGood's Ramadan giving report states
that "78% of Zakat donations came inside of Ramadan" (section 1.5 of the research brief), so the
demand arrives compressed into thirty days, at the one point in the year when reviewer attention
is scarcest. A triage system's value sits almost entirely inside that window, and so does its
risk.

A wrong determination is a religious harm in both directions, and the failure asymmetry in section
6 of the research brief is what shapes the design. A campaign wrongly badged eligible may leave a
donor's obligation undischarged, and that harm is silent: the donor will almost never learn of it,
the platform cannot identify who was affected, and each publicised instance erodes the reason the
badge exists. A campaign wrongly denied loses access to the zakat donor pool at the moment that
pool is largest, which during Ramadan is effectively a denial for the year, and the harm falls on
people who are by construction likely to be poor. Only one of the two generates its own corrective
signal, and only one is recoverable.

The binary also hides a third outcome that campaign prose actually warrants. Campaign copy is
marketing, not a case file: it rarely states the beneficiary's assets, who owns an asset
afterward, or whether a debt is lawfully incurred and currently due, and forcing a two-way answer
on text lacking the determinative fact converts a known unknown into a confident error. So the
honest default under uncertainty is a question, not a verdict. It costs throughput exactly where
throughput is scarcest, which is the real price of this design and is stated rather than hidden.

## What it does

For a submitted campaign it:

1. extracts a typed record of the facts from free-text campaign copy
2. maps the text against each of the eight recipient categories as supported, not supported, or
   insufficient evidence, citing the exact span behind every mapping
3. reports what evidence is missing and what a reviewer should ask the organizer
4. retrieves comparable previously adjudicated cases and shows them to the reviewer as precedent,
   rather than feeding them back to the model to imitate
5. refuses to determine ambiguous cases and escalates with the question a human must answer
6. records the human decision, which is authoritative

## What it refuses to be

The refusal is the feature, not a limitation worked around. Four conditions stop the pipeline and
send the file to a person, each naming the question waiting there:

- **Mixed use.** Money split between a use a category covers and one it does not.
- **Scholarly difference.** The determinative question is one recognised scholars genuinely differ
  on, such as the scope of fi sabilillah, tamlik, or organisational overhead. The difference is
  named and the reviewer is asked which position platform policy applies. The system does not pick
  a school, because choosing one is a religious act.
- **Claim without support.** The campaign asserts its own zakat eligibility and the text does not
  carry the facts that assertion would need.
- **Nothing resolvable.** Every category is open and no beneficiary is identified anywhere in the
  text, which puts a question about the queue itself to the reviewer.

An escalation is delivered over a real Slack webhook with a link back to the reviewer page. A
refusal saying only that a campaign needs review would move the triage work back onto the person
the triage was for, so every refusal carries an answerable question and the spans behind it.

## The three statuses

A finding is a statement about the campaign text, never a determination of eligibility.

- **`supported`**: the story states the qualifying facts the category asks for, and the spans
  stating them are cited. Hardship, urgency, a sympathetic account and a sum of money are not
  qualifying facts.
- **`insufficient_evidence`**: the story engages the category, or gestures at it, and the
  qualifying facts are missing. The absent fact is named and the question that would obtain it
  travels with it.
- **`not_supported`**: the story does not engage the category at all, or engages it and points away.

Gesturing has an operational test, because it was the word doing the most work and the least
definition: a story gestures at a category when it states a concrete fact the category's
qualifying facts would directly resolve or quantify, so a rent shortfall the page asks money to
cover leaves the debt line unresolved while general hardship ambiance gestures at nothing in
particular. The distinction decides what gets sent, because organizer questions attach to
`insufficient_evidence` alone. All of it lives in the `CategoryFinding` docblock in
`src/lib/mapping.ts` and nowhere else, because every restatement of a definition can rot.

## Trust design

The agent prepares the file and a qualified human adjudicates. That boundary is architectural
rather than a disclaimer: there is no code path in which a determination is published without a
recorded human decision.

| Invariant | How it is enforced | Record |
| --- | --- | --- |
| The agent never issues a religious ruling. It emits findings about text evidence, and carries no score or confidence figure anywhere. | A number would be a determination with a decimal point in it, and no field in any schema accepts one. | ADR-0001 |
| Citations are verbatim quotes resolved to offsets server side. | A supported finding with no citation is unrepresentable: the union types the citation list as non-empty, so it fails to construct in TypeScript and to parse at runtime. `src/lib/__tests__/mapping-types.test.ts` proves the compile-time half. | ADR-0003 |
| Retrieved precedent renders to the reviewer and never enters a prompt. | Retrieval belongs to the render, and `src/lib/triage.ts` has no way to reach it. A prompt-recording trace test and an import-graph fence hold it (`src/lib/__tests__/precedent-isolation.test.ts`). | ADR-0004 |
| The refusal is deterministic code over typed output. | The model cannot talk the pipeline out of an escalation, and `escalate: true` carries a non-empty reason list, so a bare needs-review flag cannot be constructed. | ADR-0006 |
| Nothing in citation position is model-authored. | Campaign spans are byte-checked against the story, scholarly-difference text is retrieved by id from versioned human-authored data, and model prose is guarded against quotation and citation shapes. | ADR-0007 |
| The only representation of an outcome in the entire schema is a human decision row. | SQL CHECK constraints enforce it, and the suite proves the constraints by inserting past the application-level validation. | ADR-0008 |

## Architecture

Next.js App Router and TypeScript end to end, on Vercel. Neon Postgres with pgvector for precedent
retrieval, Drizzle for the schema, and the AI SDK's `generateObject` with zod schemas for every
model call. Models are injected, so the unit suite runs against mocks with no network, and PGlite
boots the real shipped migrations so tests exercise the same schema production runs (ADR-0002,
ADR-0005). The six steps above are a linear assembly with rule-based gates, deliberately not an
agent loop: nothing in it chooses its own next action, so what a reviewer reads is the output of a
path that can be read off the source.

Four diagrams and the decisions behind them are served by the app itself, at
**https://zakat-eligibility-triage.vercel.app/design**: the pipeline and its trust boundary, the
evaluation gate, the runtime and its integrations, and the operations layer this pattern comes
from.

## Evaluation

Two scorers, one gate, arranged so each measures only what it can (ADR-0009). **Deterministic
scoring** runs the eighteen labelled campaigns in `fixtures/evals/` through extraction, mapping,
the refusal gate and the missing-evidence report against a live model, and checks what a
hand-written label can be right about: per-category status agreement, whether a citation slices
its own quote back out of the story, exact-set agreement on which refusal conditions fired, and
whether every category the label expects a question on got one.

**Judge scoring** asks a different model from the subject for a pass or fail with a stated reason
on four things no label can see: whether rationales argue from the
campaign's own words, whether organizer questions are specific and sendable as they stand, whether
anything adjudicates a difference, and whether a category is left unresolved only where the story
engages it. Each dimension is pass or fail and never a score, because a judge scoring reasoning
out of five would reintroduce through the test harness exactly the uncalibrated number ADR-0001
turned down. The judge is shown the campaign and the record and nothing else: not the label, which
the deterministic half already scores and scores better, and not the precedent corpus, which would
reward a record for resembling past decisions. The independence that buys is partial and should
not be overstated, since subject and judge come from one vendor and one training lineage, so a
blind spot they share is one neither will report.

The gate runs in CI on pull requests into `main` and on pushes to `main`, and a missed threshold
exits non-zero and fails the build. A missing `ANTHROPIC_API_KEY` fails the job rather than
skipping it, because a gate that passes without running is green for a run nobody performed. The
latest green run:

| Gate | Requires | Observed |
| --- | --- | --- |
| `citation-validity` | 100.0% | 100.0% (43 of 43) |
| `citation-anchoring` | 90.0% | 100.0% (14 of 14) |
| `category-agreement` | 80.0% | 97.2% (140 of 144) |
| `escalation-agreement` | 75.0% | 83.3% (15 of 18) |
| `missing-evidence-coverage` | 75.0% | 92.9% (39 of 42) |
| `judge/responded` | at most 2 unjudged | 0 of 18 |
| `judge/no-ruling` | 0 failures | 0 of 18 |
| `judge/evidence-not-assertion` | 85.0% | 94.4% (17 of 18) |
| `judge/sendable-questions` | 85.0% | 100.0% (18 of 18) |
| `judge/unresolved-only-where-engaged` | 66.7% | 66.7% (12 of 18) |

The coverage and engagement floors were lowered after this run, in a commit arguing from two
runs on byte-identical code (issue #32); the table shows the floors as they stand, and the
run cleared the stricter originals.

Citation validity is the only bar at 100, because a citation is the one output that is either true
or a fabrication indistinguishable from a real one on the page. Anchoring is scored apart from it,
because a finding quoting a real span the label did not anticipate has disagreed about which words
carry the point rather than invented anything. The rest sit below it on purpose: five of the
eighteen cases are labelled ambiguous precisely because two qualified reviewers could read them
differently, and a gate demanding agreement everywhere would demand agreement about cases the
corpus itself calls contestable. Every number is a first calibration, and the rule governing them
is procedural: a threshold moves only in a commit that argues from a report.

### The gate went red four times before it went green

Each red caught something real, and none was fixed by lowering a bar without an argument.

- **Run [32300093487][run1].** Live category mapping was rejected by the provider's schema limits,
  which no mock could have surfaced because the mock accepted the schema the provider would not.
  Issue #23.
- **Run [32301980661][run2].** The prompt and the corpus labels were reading the boundary between
  `insufficient_evidence` and `not_supported` differently. Fixing it is why the three statuses are
  now pinned to one docblock everything else points at rather than restates. Issue #25.
- **Run [32311324499][run3].** The judge harness was charging its own parse failures to the system,
  so a run in which twelve judge responses failed validation reported that the pipeline had
  adjudicated a scholarly difference twelve times. It had adjudicated nothing; the answers had
  simply not been recorded. A harness that cannot tell "the measurement failed" from "the thing
  measured is bad" reports the second when it means the first, and loudest on the dimension with
  the strictest gate. Judge errors are now counted and gated separately, over the records actually
  judged with that denominator printed beside every rate. The same run also showed a scholarly
  difference being named where it did not bite. Issue #27 and the judge fix.
- **Run [32316255504][run4].** `unresolved-only-where-engaged` turned out to be measuring
  inter-reader agreement on a genuinely contested boundary: all five residual disagreements sat in
  the faint-gesture middle, several in the corpus's declared ambiguous tier, and two strong models
  applying the same written boundary independently agreed on 13 of 18. A floor set above measured
  agreement between careful readers does not enforce quality, it enforces flakiness, so that one
  floor moved to two-thirds in a commit that argued from the report, per the rule in ADR-0009. No
  other bar moved, and the no-ruling gate stays at zero tolerated failures.
- **Run [32317099201][run5].** Green, and the source of the table above.

[run1]: https://github.com/kianis4/zakat-eligibility-triage/actions/runs/32300093487
[run2]: https://github.com/kianis4/zakat-eligibility-triage/actions/runs/32301980661
[run3]: https://github.com/kianis4/zakat-eligibility-triage/actions/runs/32311324499
[run4]: https://github.com/kianis4/zakat-eligibility-triage/actions/runs/32316255504
[run5]: https://github.com/kianis4/zakat-eligibility-triage/actions/runs/32317099201

### What the suite cannot prove

Both corpora were written by hand by the same person who wrote the pipeline, which is the source
of every limit here, and none of it is fixable by adding cases. The corpus deliberately contains
cases the system is expected to get wrong, because a suite that passes everything measures
self-consistency; `docs/adr/0009-eval-design.md` carries the argument and the addenda the red runs
produced.

- It measures agreement with one author's documented standard, not real-world accuracy. A green
  run says the pipeline and the standard agree. It does not say the standard is right, and no
  error rate against genuine adjudications can be derived from it, because nothing in the corpus
  was decided by a qualified reviewer. Section 4.3 and open question 9 of the research brief are
  the wider version: no zakat institution publishes an error rate, an audit result or an
  inter-rater reliability figure, so there is no published human baseline to serve as anyone's
  denominator, including this one.
- A case is only as hard as its author could make it. Blind spots are shared between a story and
  its label, so a failure mode neither anticipates is invisible to both. Nor does the corpus say
  anything about prevalence or throughput: the mix covers the eight categories and the four refusal
  conditions, and was not chosen to resemble what a platform receives.
- Reproducibility is bounded. Temperature zero is requested through AI SDK middleware and is not
  honoured by these models, so the same campaign can map differently on two runs, which is part of
  why the bars are loose rather than tight.

## Running it

- `npm install`, then `npm test` and `npm run typecheck`, both. The unit suite is 419 tests and
  needs no network, no database and no keys. Part of it is enforced by the compiler rather than
  the test runner: `src/lib/__tests__/mapping-types.test.ts` proves that a supported finding with
  no citation does not typecheck, and a proof of that shape only fails under `tsc`.
- `npm run build` is expected to stay green with no `DATABASE_URL` set. An unset database is a
  supported state the reviewer page reports rather than crashes on.
- The app needs `DATABASE_URL` (Postgres with pgvector), `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`
  (embeddings); optional `SLACK_WEBHOOK_URL` for escalation delivery and `APP_BASE_URL` for the
  link in the Slack message. See `.env.example`, which records what each unset value does.
  Migrations are the SQL files in `drizzle/` applied in journal order, and the precedent corpus is
  seeded with `npm run seed:precedents`.
- The eval run does touch the network, because measuring the pipeline means running it. It writes
  `evals/report.md`, gitignored and uploaded as a CI artifact on success and failure alike, prints
  the gate arithmetic to the terminal, and exits non-zero if any gate was missed.

```sh
export ANTHROPIC_API_KEY=...   # a missing key fails the run rather than skipping it
npm run evals
```

## Data

Two corpora, both synthetic and written by hand for this repository. No real campaigns, no scraped
charity data, no real organizations or organizer names, no personal information.

- `fixtures/precedents/` holds twelve previously adjudicated cases with the reviewer's recorded
  reasoning, seeded into the retrieval index and shown to a reviewer as reference. Provenance:
  [`fixtures/precedents/README.md`](fixtures/precedents/README.md).
- `fixtures/evals/` holds the eighteen labelled campaigns, each stating the per-category status,
  the refusal and the questions this repository expects. Provenance, including what a
  self-authored corpus cannot prove: [`fixtures/evals/README.md`](fixtures/evals/README.md).
