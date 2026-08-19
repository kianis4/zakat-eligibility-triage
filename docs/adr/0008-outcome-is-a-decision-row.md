# ADR-0008: A campaign's outcome is a decision row, and there is nowhere else to put one

Date: 2026-08-19
Status: accepted

## Context
ADR-0001 states that no code path publishes an eligibility outcome without a recorded human
decision. Until now that was a claim about how the code happened to be written, and the code
had not yet reached the part where it could be broken. A pipeline that persists its results
and a UI that reads them is exactly where the claim gets tested, because the shortest way to
build the reviewer queue everyone actually wants is a `status` column on `campaigns` that the
pipeline fills in.

The failure mode is not a contributor deciding to bypass the human. It is a contributor under
deadline adding one column, populating it from the run that just finished, and reading it in a
template. Nothing in that diff looks wrong in review. The queue then shows an outcome the
pipeline produced, a reviewer confirms what they are shown, and the trust boundary is a
disclaimer.

The issue asks for the guarantee at the data layer rather than the UI layer, and that framing
is what settles the design. A guarantee in a form handler is a guarantee about one client.

## Decision
The only representation of an outcome anywhere in the schema is a row in `decisions`. No other
table has a column for one, and publishing an outcome is inserting that row. There is no
shorter path, because there is no other place a verdict can be written down.

`decisions` carries the reviewer's name and their note, both `NOT NULL` and both checked
non-blank in the database, so the two decisions worth nothing are unrepresentable rather than
discouraged: an anonymous one records no one and is not an audit trail, and an unreasoned one
records a verdict while losing the only part a later reader can weigh. Blank means the set
JavaScript's `trim` strips, enumerated by codepoint, because Postgres character classes follow
the database ctype and do not cover the Unicode blanks: a reviewer named by a non-breaking
space passes `[[:space:]]` and `\s` alike, and a constraint that lets one through is a claim
the database does not honour. `triage_run_id` is `NOT NULL`, so a decision always names the
agent file it was taken against, and it names it through a composite foreign key on
`(campaign_id, triage_run_id)` against a unique index on `triage_runs (campaign_id, id)`. Two
separate foreign keys are each satisfied by a decision citing one campaign and a different
campaign's file, because both ids exist; that row records a reviewer deciding a campaign on
evidence about another one, and nothing in it says so.

`triage_runs` is the agent's file, written once. There is no update path to it in this
repository, and re-running a campaign appends a row rather than replacing one, so a decision
keeps pointing at what its reviewer actually read. Its columns are the four documents the
pipeline produced plus the policy version, the model, and what happened to the Slack post.
None of them is an outcome.

Whether the reviewer agreed with the agent is computed at render time from the decision and
the run it names. It is not stored.

A schema-guard test walks the Drizzle schema and fails if any table other than `decisions`
gains a column whose name matches `/status|outcome|verdict|eligib|approved/i`, with one
documented exemption for `precedents.category_outcomes`, which holds somebody else's finished
adjudication as reference data (ADR-0004) and is written by no code path here. That test is
the part of this ADR that survives the people who have read it.

## Alternatives considered
- **A `status` column on `campaigns`, written by the agent, confirmed by a human.** Rejected.
  An unconfirmed status is a published outcome in every practical sense: it is queryable, it
  sorts the queue, and it is what a donor-facing surface would read. It also reintroduces the
  anchoring ADR-0001 rejected, one layer down. A reviewer shown a filled-in verdict confirms
  it, and the measurable output of the system becomes the pipeline's opinion with a human's
  name attached to it.
- **Enforcing the rule in the UI, in the server action that publishes.** Rejected. The issue
  asks for the data layer, and the reason is that a guard in a handler is a property of that
  handler. The next client, whether an admin script, a backfill, a second app, or the CSV
  export somebody writes for the compliance team, re-implements the guard or does not. The
  database is the one place every client passes through.
- **Storing the agreement between human and agent on the decision row.** Rejected. It is a
  function of the decision and the run it names, so a stored copy is a second source of truth
  that a change to the agreement rule silently falsifies. Derived data that is stored is data
  that drifts, and this is derived data whose drift would be invisible: the trail would still
  read as coherent while saying something the rows no longer support.
- **A nullable `decided_outcome` column on `campaigns`, null until a human writes it.**
  Rejected as the same shortcut with better manners. It is one `UPDATE` away from being
  written by a pipeline, it keeps no history when a reviewer decides twice, and it cannot
  record which file was decided against, which is most of what makes the trail auditable.

## Consequences
Easy: the invariant is testable by attempting to violate it, and the suite does exactly that,
inserting past every application-layer check and asserting that Postgres refuses by name. A
reviewer queue is a join rather than a column read, which is more SQL and honest SQL. The
audit trail answers who, what, when, against which file, and whether they went with the agent,
without any of it having been maintained by hand.

Hard: every surface that wants to know a campaign's state runs the join, and `publishedOutcome`
exists so it is written once. Agreement is recomputed on every render rather than read, which
is cheap here and would need thought at a queue of a different size. A campaign decided twice
has two rows and the latest stands, which is the correct record and is more than a status
column would have made anyone think about.

We also accept that the schema guard is a regular expression over column names. It catches the
shortcut spelled the obvious ways and would miss one called `campaigns.result`. It is a
tripwire on the path of least resistance, not a proof, and the ADR is what covers the rest.
