import Link from "next/link";

import { Khatam } from "./khatam";

/**
 * The landing page, which is the README made walkable.
 *
 * Every sentence here is the README's or an ADR's, verbatim or lightly adapted to the surface.
 * Nothing on this page states a claim, a number, or a point of fiqh that is not already argued
 * somewhere in the repository, because a landing page is the worst possible place for a claim
 * with no record behind it.
 */
const REPOSITORY = "https://github.com/kianis4/zakat-eligibility-triage";

const STEPS = [
  "extracts a typed record of the facts from free-text campaign copy",
  "maps the text against each of the eight recipient categories as supported, not supported, or insufficient evidence, citing the exact span behind every mapping",
  "reports what evidence is missing and what a reviewer should ask the organizer",
  "retrieves comparable previously adjudicated cases and shows them to the reviewer as precedent, rather than feeding them back to the model to imitate",
  "refuses to determine ambiguous cases and escalates with the question a human must answer",
  "records the human decision, which is authoritative",
] as const;

const INVARIANTS = [
  {
    invariant:
      "The agent never issues a religious ruling. It emits findings about text evidence, and carries no score or confidence figure anywhere.",
    how: "A number would be a determination with a decimal point in it, and no field in any schema accepts one.",
    adr: "ADR-0001",
  },
  {
    invariant: "Citations are verbatim quotes resolved to offsets server side.",
    how: "A supported finding with no citation is unrepresentable: the union types the citation list as non-empty, so it fails to construct in TypeScript and to parse at runtime.",
    adr: "ADR-0003",
  },
  {
    invariant: "Retrieved precedent renders to the reviewer and never enters a prompt.",
    how: "Retrieval belongs to the render, and src/lib/triage.ts has no way to reach it. A prompt-recording trace test and an import-graph fence hold it.",
    adr: "ADR-0004",
  },
  {
    invariant: "The refusal is deterministic code over typed output.",
    how: "The model cannot talk the pipeline out of an escalation, and escalate: true carries a non-empty reason list, so a bare needs-review flag cannot be constructed.",
    adr: "ADR-0006",
  },
  {
    invariant: "Nothing in citation position is model-authored.",
    how: "Campaign spans are byte-checked against the story, scholarly-difference text is retrieved by id from versioned human-authored data, and model prose is guarded against quotation and citation shapes.",
    adr: "ADR-0007",
  },
  {
    invariant:
      "The only representation of an outcome in the entire schema is a human decision row.",
    how: "SQL CHECK constraints enforce it, and the suite proves the constraints by inserting past the application-level validation.",
    adr: "ADR-0008",
  },
] as const;

const STATUSES = [
  {
    name: "supported",
    tone: "pill--yes",
    body: "the story states the qualifying facts the category asks for, and the spans stating them are cited. Hardship, urgency, a sympathetic account and a sum of money are not qualifying facts.",
  },
  {
    name: "insufficient_evidence",
    tone: "pill--unknown",
    body: "the story engages the category, or gestures at it, and the qualifying facts are missing. The absent fact is named and the question that would obtain it travels with it.",
  },
  {
    name: "not_supported",
    tone: "pill--no",
    body: "the story does not engage the category at all, or engages it and points away.",
  },
] as const;

const GATES = [
  ["citation-validity", "100.0%", "100.0% (43 of 43)"],
  ["citation-anchoring", "90.0%", "100.0% (14 of 14)"],
  ["category-agreement", "80.0%", "97.2% (140 of 144)"],
  ["escalation-agreement", "75.0%", "83.3% (15 of 18)"],
  ["missing-evidence-coverage", "75.0%", "92.9% (39 of 42)"],
  ["judge/responded", "at most 2 unjudged", "0 of 18"],
  ["judge/no-ruling", "0 failures", "0 of 18"],
  ["judge/evidence-not-assertion", "85.0%", "94.4% (17 of 18)"],
  ["judge/sendable-questions", "85.0%", "100.0% (18 of 18)"],
  ["judge/unresolved-only-where-engaged", "66.7%", "66.7% (12 of 18)"],
] as const;

function Eyebrow({ children }: { children: string }) {
  return (
    <p className="section__eyebrow">
      <Khatam size={11} />
      {children}
    </p>
  );
}

export default function Home() {
  return (
    <main>
      <section className="hero">
        <Khatam className="hero__mark" outline size={56} />
        <h1>Zakat-Eligibility Triage</h1>
        <p className="hero__lede">
          A triage agent for crowdfunding campaigns. It reads a submitted campaign, assembles the
          evidence a zakat determination would turn on, names what the text leaves missing or
          contested, and hands the file to a qualified human reviewer.
        </p>
        <div className="hero__actions">
          <Link className="btn" href="/campaigns">
            Open the queue
          </Link>
          <Link className="btn btn--ghost" href="/design">
            The system design
          </Link>
        </div>
      </section>

      <section className="section measure">
        <Eyebrow>The problem</Eyebrow>
        <p>
          Zakat is obligatory almsgiving, and it may only go to the eight categories of recipient
          named in Surah At-Tawbah (9:60). The word rendered &quot;only&quot; is why the list is
          read as exhaustive rather than illustrative, so eligibility is a question about which
          named category a campaign falls under and not about how deserving it looks.
        </p>
        <p>
          That review load is not spread evenly through the year. A Ramadan giving report cited in
          section 1.5 of the research brief states that &quot;78% of Zakat donations came inside of
          Ramadan&quot;, so the demand arrives compressed into thirty days, at the one point in the
          year when reviewer attention is scarcest. A triage system&apos;s value sits almost
          entirely inside that window, and so does its risk.
        </p>
        <p>
          A wrong determination is a religious harm in both directions, and the failure asymmetry in
          section 6 of the research brief is what shapes the design. A campaign wrongly badged
          eligible may leave a donor&apos;s obligation undischarged, and that harm is silent. A
          campaign wrongly denied loses access to the zakat donor pool at the moment that pool is
          largest, which during Ramadan is effectively a denial for the year, and the harm falls on
          people who are by construction likely to be poor. Only one of the two generates its own
          corrective signal, and only one is recoverable.
        </p>
        <p>
          So the honest default under uncertainty is a question, not a verdict. It costs throughput
          exactly where throughput is scarcest, which is the real price of this design and is stated
          rather than hidden.
        </p>
      </section>

      <section className="section">
        <Eyebrow>What it does</Eyebrow>
        <p className="measure">
          Prepares a cited evidence file about a submitted campaign so that a qualified human
          reviewer can adjudicate it. For a submitted campaign it:
        </p>
        <ol className="steps">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="section">
        <Eyebrow>Trust design</Eyebrow>
        <p className="measure">
          The agent prepares the file and a qualified human adjudicates. That boundary is
          architectural rather than a disclaimer: there is no code path in which a determination is
          published without a recorded human decision.
        </p>
        <div className="grid-2">
          {INVARIANTS.map((entry) => (
            <article className="tile" key={entry.adr}>
              <p>
                <strong>{entry.invariant}</strong>
              </p>
              <p className="tile__how">{entry.how}</p>
              <p>
                <span className="adr">{entry.adr}</span>
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <Eyebrow>The three statuses</Eyebrow>
        <p className="measure">
          A finding is a statement about the campaign text, never a determination of eligibility.
        </p>
        <div className="grid-3">
          {STATUSES.map((status) => (
            <article className="tile" key={status.name}>
              <p>
                <span className={`pill ${status.tone}`}>{status.name}</span>
              </p>
              <p className="tile__how">{status.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <Eyebrow>Evaluation</Eyebrow>
        <p className="measure">
          The gate runs in CI on pull requests into <code>main</code> and on pushes to{" "}
          <code>main</code>, and a missed threshold exits non-zero and fails the build. A missing{" "}
          <code>ANTHROPIC_API_KEY</code> fails the job rather than skipping it, because a gate that
          passes without running is green for a run nobody performed. The latest green run:
        </p>
        <div className="card table-scroll">
          <table className="gates">
            <thead>
              <tr>
                <th>Gate</th>
                <th>Requires</th>
                <th>Observed</th>
              </tr>
            </thead>
            <tbody>
              {GATES.map(([gate, requires, observed]) => (
                <tr key={gate}>
                  <td>
                    <code>{gate}</code>
                  </td>
                  <td>{requires}</td>
                  <td>{observed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="measure">
          The coverage and engagement floors were lowered after this run, in a commit arguing from
          two runs on byte-identical code (issue #32); the table shows the floors as they stand, and
          the run cleared the stricter originals.
        </p>
        <p className="measure">
          The gate went red four times before it went green. Each red caught something real, and
          none was fixed by lowering a bar without an argument. Every run is in{" "}
          <a href={REPOSITORY}>the repository</a>&apos;s{" "}
          <a href={`${REPOSITORY}/actions`}>Actions</a>.
        </p>
      </section>
    </main>
  );
}
