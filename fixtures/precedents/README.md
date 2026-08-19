# Adjudicated precedent corpus: provenance

Twelve previously adjudicated campaigns, every one of them synthetic and written by hand
for this repository. There is no real campaign, no real organization, no real person and
no scraped text in this directory. Real geographic names may appear as plausible
settings, and a place name invented for a file may well collide with a real one
somewhere; no case, organization, person, sum or date is real, and where a file names a
trust or a village committee, that body does not exist.

They are fixtures for a retrieval index, not a labelled ground truth. Nothing in this
corpus is evidence of how any real platform decides anything, and no accuracy claim can
be made against it.

## What a file contains

One JSON object per adjudication, matching the `precedents` table in `src/db/schema.ts`:

| Field              | Meaning                                                              |
| ------------------ | -------------------------------------------------------------------- |
| `id`               | Stable key. The seed script upserts on it, so re-seeding is safe.     |
| `title`, `story`   | The campaign as submitted. Embedded together for retrieval.           |
| `categoryOutcomes` | How the adjudication came out per recipient category, using the same three statuses as `CategoryVerdict`. Partial: only the categories the reviewer engaged with. |
| `decision`         | `approved`, `declined` or `info_requested`.                           |
| `reviewerNote`     | The reviewer's own recorded reasoning, written to be read by the next reviewer. |
| `decidedAt`        | When the decision was recorded.                                       |

## How the set is composed

Deliberately, so retrieval has something to be right and wrong about:

- **Clearly eligible, with documentation noted** (0001, 0002, 0003). Rent arrears with
  statements and a tenancy on file, a hospital debt that is currently due and quantified,
  a family cut off from assets they own but cannot reach.
- **Clearly ineligible** (0004, 0007). A public amenity with no beneficiary in need and no
  transfer to anyone, and a trading business the copy says is profitable. Nothing in
  either engages a category, so nothing in either was contested.
- **Declined, but not clear-cut** (0005, 0006). A building project, declined because the
  platform's own policy does not extend fi sabilillah to construction, on ground where the
  note itself records that recognised bodies have reached opposite conclusions: the
  decision is a policy being applied and the note says so. And a balance that is mostly
  rolled-over charges, declined as submitted while the debt line stays unresolved, because
  a principal exists and the lender's paperwork does not quantify it.
- **Underspecified, so information was requested** (0008, 0009, 0010). Hardship asserted
  and nothing stated, an undisclosed administrative deduction, a debt whose currency and
  the household's means are both unresolved. `info_requested` is a real outcome and not a
  pending state: the reviewer read the file and recorded that it cannot be adjudicated
  until a specific fact arrives.
- **Routed on a scholarly difference** (0011, 0012). A water point, where who owns the
  asset afterwards decides which heading it is adjudicated under, and a support fund
  resting on a category whose operation contemporary bodies dispute. Both notes record
  that an advisor was consulted, what scoped question was put, and what the reviewer did
  and did not conclude from the answer.

## Rules the notes are written to

The notes are the reason this corpus exists, and they are read by people who know the
subject. They are written to the constraints the rest of the repository works under:

1. **A note records a platform decision, never a religious ruling.** Where a case sits on
   contested ground the note says the platform's policy was applied, says that recognised
   scholars differ, and stops. It never says which position is correct or more common.
2. **Where a scholar was consulted, the note says so, says what question was put, and
   keeps the answer scoped to the platform's own policy.** The reviewer is recording a
   consultation, not publishing a fatwa.
3. **A declined case says what the organizer was told**, including that the campaign keeps
   running for non-zakat giving. Section 6.2 of `docs/RESEARCH.md` is why: a wrong denial
   falls on people who are by construction likely to be poor, and it is recoverable only
   if it is surfaced.
4. **Nothing in a note is consistent with `docs/RESEARCH.md` by accident.** Thresholds,
   the range of published overhead positions, the tamlik question on project campaigns and
   the live disagreement over reconciled hearts all trace to section 2, 3 or 4.

## Where this synthetic platform's policy diverges from the researched one

The notes speak for a platform that does not exist, and its policy is not a copy of the
one section 1.2 of `docs/RESEARCH.md` documents. One divergence is load-bearing enough to
name: the researched platform does not verify traveller campaigns at all, on the stated
practical ground that a genuinely stranded person is unlikely to be able to run one.
Case 0003 is verified here, which is a deliberate choice made for this corpus so that the
category appears in it, and the note says so. Section 3.5 of the research is the reason
it can be a choice: that refusal is a platform position taken on practical grounds rather
than doctrinal ones, and it should not be read as a third opinion alongside the positions
that are scholarly.

## The rule that governs this directory

These notes are rendered to a human reviewer and are never serialized into a model
prompt. See `docs/adr/0004-precedent-goes-to-the-reviewer-not-the-model.md`, and
`src/lib/__tests__/precedent-isolation.test.ts`, which fails if a prompt ever contains
one.
