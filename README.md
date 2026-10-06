# Can my zakat go to this campaign?

Zakat-Eligibility Triage is a free check for donors. You paste a crowdfunding campaign you are
thinking of giving zakat to, and an agent reads it, sets out what the text does and does not say
about each of the eight categories of zakat recipient, and gives you the questions to ask before
you give. It **never tells you whether to give**. Every claim it makes is traceable to a span of
the campaign you pasted, and nothing it produces is a score.

It runs at **https://zakat-eligibility-triage.vercel.app**. `docs/RESEARCH.md` is the sourced
domain brief the design argues from, and `docs/adr/` holds the decision records the invariants
below cite.

## What it does for you

You paste the campaign's title and story, and if the page shows them, its category, its goal and
its currency. Nothing else is needed and nothing asks who you are. In one step it:

1. extracts a typed record of the facts from the campaign copy
2. maps the text against each of the eight recipient categories as supported, not supported, or
   insufficient evidence, citing the exact span behind every mapping
3. reports what evidence is missing and what to ask the organizer
4. refuses to settle ambiguous cases, and says which question has to be answered and who can
   answer it
5. stores nothing about what you decide, because what you decide is yours

The result has its own link, so you can come back to it or send it to someone you want to ask.

## Why it never rules

Whether a gift discharges your zakat is a religious determination, and a tool has no standing to
make it. Where recognised scholars genuinely differ, choosing one position over another is itself
a religious act (section 3 of the research brief), and that choice belongs to you and the scholar
you follow, not to software or to a platform's policy you have never read. A stated verdict would
also become the answer people stop checking, however carefully it was worded (ADR-0001).

So the tool prepares the file and you decide. That boundary is in the schema rather than in a
disclaimer: no table in the database has anywhere to put an outcome, so there is nothing for the
system to publish even by mistake (ADR-0010).

## Who answers which question

Four conditions stop the check and turn it into a question, and each question goes to the person
who can actually answer it (ADR-0006, ADR-0010).

- **Mixed use.** Money split between a use a category covers and one it does not. Ask the
  organizer how the money is divided.
- **Claim without support.** The campaign says it is zakat eligible and the text does not carry
  the facts that would need. Ask the organizer for them.
- **Nothing resolvable.** Every category is open and no beneficiary is identified anywhere in the
  text. Ask the organizer who the money is for.
- **Scholarly difference.** The deciding question is one recognised scholars genuinely differ on,
  such as the scope of fi sabilillah, tamlik, or organisational overhead. The difference is named
  and you are asked to take it to a scholar you trust: which position do they hold, and does it
  cover this campaign? The tool does not pick a school.

The result also lists the restrictions that bind you as the giver rather than the campaign, such
as not giving zakat to your own immediate family.

## Sadaqah is different

The eight categories restrict zakat only. Sadaqah, voluntary charity, is not limited to them, so a
campaign this check finds little support for may still be a good place for your sadaqah. The
sources are in section 2 of the research brief, under the cross-cutting recipient restrictions.

## The problem

Zakat is obligatory almsgiving, and it may only go to the eight categories of recipient named in
Surah At-Tawbah (9:60). The word rendered "only" is why the list is read as exhaustive rather than
illustrative, so eligibility is a question about which named category a campaign falls under and
not about how deserving it looks.

Most of that giving happens in a short window. A Ramadan giving report cited in section 1.5 of
the research brief states that "78% of Zakat donations came inside of Ramadan", so most donors are
choosing where their zakat goes in the same thirty days, with the least time in the year to look
closely.

Getting it wrong costs something in both directions, and the failure asymmetry in section 6 of
the research brief is what shapes the design. Zakat given to a campaign outside the eight
categories may leave a donor's obligation undischarged, and that harm is silent: the donor will
almost never learn of it. A campaign passed over by mistake loses zakat at the moment it needs it
most, and the harm falls on people who are by construction likely to be poor. Only one of the two
generates its own corrective signal, and only one is recoverable.

Campaign copy is marketing, not a case file. It rarely states the beneficiary's assets, who owns
an asset afterward, or whether a debt is lawfully incurred and currently due, and forcing a yes or
no on text lacking the deciding fact converts a known unknown into a confident error. So the
honest answer under uncertainty is a question, not a verdict, and the tool's job is to make that
question specific enough to send.

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
particular. The distinction decides what gets asked, because organizer questions attach to
`insufficient_evidence` alone. All of it lives in the `CategoryFinding` docblock in
`src/lib/mapping.ts` and nowhere else, because every restatement of a definition can rot.

## Trust design

| Invariant | How it is enforced | Record |
| --- | --- | --- |
| The agent never issues a religious ruling. It emits findings about text evidence, and carries no score or confidence figure anywhere. | A number would be a determination with a decimal point in it, and no field in any schema accepts one. | ADR-0001 |
| Citations are verbatim quotes resolved to offsets server side. | A supported finding with no citation is unrepresentable: the union types the citation list as non-empty, so it fails to construct in TypeScript and to parse at runtime. `src/lib/__tests__/mapping-types.test.ts` proves the compile-time half. | ADR-0003 |
| Past adjudicated cases never enter a prompt, and are not shown to donors either. | A prompt-recording trace test and an import-graph fence hold the first half (`src/lib/__tests__/precedent-isolation.test.ts`). The result page renders no precedent, because a past ruling shown to a donor reads as the answer. | ADR-0004, ADR-0010 |
| The refusal is deterministic code over typed output, and every question names who can answer it. | The model cannot talk the pipeline out of an escalation, and `escalate: true` carries a non-empty reason list, so a bare needs-review flag cannot be constructed. The audience is a pure function of the reason's kind, computed at render. | ADR-0006, ADR-0010 |
| Nothing in citation position is model-authored. | Campaign spans are byte-checked against the story, scholarly-difference text is retrieved by id from versioned human-authored data, and model prose is guarded against quotation and citation shapes. | ADR-0007 |
| No table in the schema carries an outcome. | A schema guard fails the suite when any column is named like a status, a verdict or an eligibility flag, and the guard is itself tested against a schema that has one. | ADR-0010 |

## Privacy and limits

What you paste is stored for 30 days so the link to your result keeps working, and is then
deleted. There are no accounts. The link is unguessable and unlisted: nothing on the site links to
it and result pages ask search engines not to index them. Your IP address is never stored; the
rate limit keeps only an HMAC of it, keyed with a secret, for two days at most. The campaign text
is sent to Anthropic's API to be read, so please do not paste anything private.

Every check costs real model credit, so the hosted site allows 5 checks per visitor and 100 in
total per UTC day. The limits are charged before any model call, they hold under concurrent
requests, and a deployment without its hashing secret runs no checks at all rather than running
without limits. ADR-0011 records the design and its known weaknesses: the visitor's address comes
from a header a self-hosted proxy may let a client set, and one determined person can use up the
whole day's cap. For a free demo I would rather the site stop for the day than run up an
open-ended bill.

## Architecture

Next.js App Router and TypeScript end to end, on Vercel. Neon Postgres for campaigns, results and
the daily limits, Drizzle for the schema, and the AI SDK's `generateObject` with zod schemas for
every model call. Models are injected, so the unit suite runs against mocks with no network, and
PGlite boots the real shipped migrations so tests exercise the same schema production runs
(ADR-0002, ADR-0005). The steps above are a linear assembly with rule-based gates, deliberately not
an agent loop: nothing in it chooses its own next action, so what you read is the output of a path
that can be read off the source.

Four diagrams and the decisions behind them are served by the app itself, at
**https://zakat-eligibility-triage.vercel.app/design**. Diagrams 01 and 03 still draw the earlier
reviewer-tool architecture; the text under each one describes the tool as it is now.

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
| `judge/responded` | at most 2 unjudged | 0 unjudged of 18 |
| `judge/no-ruling` | 0 failures | 0 failures in 18 |
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

## Self-hosting

- `npm install`, then `npm test` and `npm run typecheck`, both. The unit suite
  needs no network, no database and no keys. Part of it is enforced by the compiler rather than
  the test runner: `src/lib/__tests__/mapping-types.test.ts` proves that a supported finding with
  no citation does not typecheck, and a proof of that shape only fails under `tsc`.
- `npm run build` is expected to stay green with no `DATABASE_URL` set. An unset database is a
  supported state the site reports rather than crashes on.
- Migrations are the SQL files in `drizzle/` applied in journal order. The precedent corpus is
  seeded with `npm run seed:precedents`, which is optional: the public tool never reads it.
- `.env.example` records what each variable does and what happens when it is unset:

| Variable | Needed for | Default |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | every check, and the eval run | none |
| `DATABASE_URL` | Postgres with pgvector; unset refuses checks with that reason | none |
| `IP_HASH_SECRET` | the rate limit; unset refuses every check. Generate with `openssl rand -hex 32` | none |
| `ANALYSES_PER_IP_PER_DAY` | checks per visitor per UTC day | 5 |
| `ANALYSES_PER_DAY` | checks for the whole site per UTC day | 100 |
| `RETENTION_DAYS` | days a pasted campaign and its result are kept | 30 |
| `OPENAI_API_KEY` | seeding the precedent corpus only | none |

The eval run does touch the network, because measuring the pipeline means running it. It writes
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
  reasoning, from when this was a reviewer tool. They are no longer shown to anyone; they stay so
  the fence that keeps them out of every prompt stays tested. Provenance:
  [`fixtures/precedents/README.md`](fixtures/precedents/README.md).
- `fixtures/evals/` holds the eighteen labelled campaigns, each stating the per-category status,
  the refusal and the questions this repository expects. Provenance, including what a
  self-authored corpus cannot prove: [`fixtures/evals/README.md`](fixtures/evals/README.md).

## Origins

This began as an interview project for LaunchGood's Applied AI Engineer role, built as a triage
tool for a platform's own reviewers, and it is shared publicly with their permission. I rebuilt it
afterwards as a tool for donors, because the person who most needs these questions is the one
deciding where their own zakat goes. It is an independent project, not affiliated with LaunchGood
or any crowdfunding platform, and nothing here speaks for them. Where `docs/RESEARCH.md` cites a
platform's published policy or giving report, it does so as a public source.
