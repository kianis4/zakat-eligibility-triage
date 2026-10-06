# ADR-0010: The donor is the human in the loop, and no table carries an outcome

Date: 2026-10-06
Status: accepted. Supersedes ADR-0008. Amends ADR-0001, ADR-0004 and ADR-0006.

## Context
This began as an interview project for a platform's reviewers: a queue of submitted campaigns,
an agent file for each, and a panel where a named reviewer recorded the outcome. ADR-0008 made
that decision row the only place an outcome could live, and the Slack post told the reviewers a
campaign was waiting. All of it assumed a platform with reviewers, a policy and a badge to put
on a campaign.

The public version has none of those. The person who reads the file is a donor who found a
campaign and wants to know whether their zakat can go to it. Nobody on this side of the screen
has the standing to answer that for them, and I do not want the site to look as if it does.
The research is clear that where recognised scholars differ, choosing a position is itself a
religious act (section 3 of `docs/RESEARCH.md`), and a donor is entitled to make that choice with
the scholar they follow rather than have it made for them by a tool, or by a platform's policy
the donor has never read.

So the question this ADR settles is who the human in the loop is now, and what keeps the system
from becoming the thing that decides once the reviewer is gone.

## Decision
The donor is the human in the loop. The tool prepares the file, and the donor, with the scholar
they trust, decides. Nothing they decide is entered, sent or stored.

That changes four earlier records.

ADR-0001 still holds that the agent never rules, and its last sentence is amended. There is no
longer a recorded human decision, because nothing is recorded at all. The guarantee becomes
stronger rather than weaker: there is no outcome to publish because there is nowhere to write
one.

ADR-0004's fence stays exactly as it is. Precedent never enters a prompt, and the import-graph
and prompt-recording tests still run. What changes is that precedent is no longer rendered. A
past ruling shown to a donor reads as the answer to their question, which is the anchoring
ADR-0004 kept away from the model, now pointed at a person with even less context to discount
it. The corpus, the retrieval code and their tests stay in the repository.

ADR-0006's refusal rules are unchanged, and each reason now says who can answer it. Mixed use,
a claim without support and a story that resolves nothing are questions for the organizer,
because only the organizer knows what the page leaves out. A scholarly difference is a question
for a scholar the donor trusts, and the wording asks which position that scholar holds and
whether it covers this campaign. No question mentions platform policy. The audience is a pure
function of the reason's kind, `audienceOf` in `src/lib/escalation.ts`, computed when the page
renders and never stored.

ADR-0008 is superseded. The `decisions` table, its constraints and the Slack delivery column are
dropped by `drizzle/0004_the_donor_decides.sql`, and the Slack integration is gone with them. A
post to a reviewers' channel has no reader when there are no reviewers, and a webhook that fires
on every public paste would be a way for strangers to write into someone's workspace.

The invariant that replaces ADR-0008 is simpler: no table carries an outcome. The schema guard
that ADR-0008 introduced keeps running, now with no table exempt from it except
`precedents.category_outcomes`, which is reference data no code path here writes. It fails the
suite if any column name matches `/status|outcome|verdict|eligib|approved/i`
(`src/db/__tests__/decision-invariant.test.ts`).

## Alternatives considered
- **Keep the reviewer workflow and put the operator in the loop.** Rejected. I would be the
  reviewer, and I have no standing to rule on anyone's zakat. A public site with one person
  deciding for every donor is the platform badge without the platform's scholars behind it.
- **Show a summary verdict and tell the donor to check with a scholar.** Rejected for the reason
  ADR-0001 gives: a stated verdict becomes the default, and the advice to check becomes a
  disclaimer under it.
- **Let the donor record what they decided, so the next donor can see it.** Rejected. It turns
  the site into a crowd verdict on a campaign, which is an outcome column with extra steps, and
  it would store something personal about a person's worship for no benefit to them.
- **Keep showing precedent, labelled as past cases.** Rejected. The label does not stop a past
  outcome from answering the present question, and a donor has no way to tell how close the past
  case really is.

## Consequences
Easy: the trust story is short enough to state on the page. The tool never rules, the donor
decides, and the database could not hold a ruling if someone tried to write one. The schema has
fewer tables and no third-party integration that can fail or leak.

Hard: there is no audit trail of outcomes, and no way to learn from what donors decided. That is
deliberate, and it means any future improvement to the file has to come from the eval corpus and
from people telling me, not from usage data. The precedent corpus now earns its keep only as a
tested fence, and that may not be enough to justify keeping it forever.

We also accept that a scholarly difference now ends with a question the tool cannot help answer.
A donor without a scholar to ask is left with a named disagreement and no position. That is the
honest state of the question, and it is better than a tool quietly picking a school for them.
