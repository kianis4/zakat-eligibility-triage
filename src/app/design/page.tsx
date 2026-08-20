import type { Metadata } from "next";

import { Khatam } from "../khatam";

/**
 * The diagram tour: four pictures of how the system is put together, and the argument behind
 * each one.
 *
 * Static all the way down. No database, no model call, nothing this page reads at request time,
 * so it prerenders and a reviewer with no credentials sees exactly what a reviewer with them
 * sees. Every sentence below is the showcase document's own, unchanged; the only editing was to
 * drop link boilerplate that a page inside the app does not need twice.
 *
 * The diagrams are dark renders on their own near-black canvas, which is why they sit in a panel
 * that carries that colour rather than the page's white. The page stays the page and the picture
 * stays the picture.
 */
const LIVE_APP = "https://zakat-eligibility-triage.vercel.app";
const REPOSITORY = "https://github.com/kianis4/zakat-eligibility-triage";

type Diagram = {
  readonly file: string;
  readonly width: number;
  readonly height: number;
};

type Section = {
  readonly number: string;
  readonly title: string;
  readonly adrs: readonly string[];
  readonly kicker: string | null;
  readonly diagram: Diagram | null;
  readonly prose: readonly string[];
};

const SECTIONS: readonly Section[] = [
  {
    number: "01",
    title: "The pipeline and its trust boundary",
    adrs: ["ADR-0001", "ADR-0003", "ADR-0004", "ADR-0006", "ADR-0007", "ADR-0008"],
    kicker: null,
    diagram: { file: "d1-pipeline-trust.png", width: 2400, height: 1546 },
    prose: [
      "This is the whole pipeline and the line it is built around. A campaign comes in, one model call extracts a typed record of the facts, and a second maps the text against the eight recipient categories as supported, not supported, or insufficient evidence, with the exact span of story behind every mapping. Citations are the part I was strictest about: the model emits verbatim quotes and the server resolves them to offsets by exact search, so slicing the story at those offsets returns the quote by construction rather than by inspection, and a quote that cannot be located is a hard failure (ADR-0003). The refusal gate underneath is plain code over typed output with no model call, no clock and no network, so the same campaign refuses for the same reasons in the same order (ADR-0006). Four conditions fire it, and each carries the specific question a reviewer can answer, because a refusal that says only that a campaign needs review has moved the triage work back onto the person the triage was for.",
      "The one decision behind this diagram is the red line. There is no code path in which an eligibility outcome is published without a recorded human decision, no schema field on the model side accepts a score or a confidence figure, and the only representation of an outcome anywhere in the schema is a row in the decisions table with a named reviewer and a written reason, held there by SQL CHECK constraints rather than by application code (ADR-0001, ADR-0008). Precedent retrieval sits behind a fence for the same reason: past adjudicated cases are useful to a person and dangerous in a prompt, so retrieval runs after generation, renders to the reviewer, and is kept out of the model's context by an import-graph test and a prompt-recording trace test rather than by a comment (ADR-0004). Everything in a citation position is either a byte-checked span of the campaign or human-authored corpus text retrieved by id, and the model's own prose is shape-guarded against quotation and chapter-and-verse references (ADR-0007).",
    ],
  },
  {
    number: "02",
    title: "The evaluation gate",
    adrs: ["ADR-0001", "ADR-0009"],
    kicker: null,
    diagram: { file: "d2-eval-gate.png", width: 2400, height: 1717 },
    prose: [
      "This is how I check the thing, and it is the part I would want a reviewer to press on. Eighteen hand-labelled synthetic campaigns run through two scorers that measure different things. The deterministic half counts what a written label can be right about: per-category status agreement, whether a citation slices its own quote back out of the story, exact-set agreement on which refusal conditions fired, and whether every category the label expects a question on got one. The judge half asks a different model, shown the campaign and the record and nothing else, for a pass or fail with a stated reason on four things no label can see. It is blind to the label because the deterministic half already scores agreement and scores it better, and blind to the precedent corpus because a judge holding past decisions would reward a record for resembling them (ADR-0009).",
      "Every judge dimension is pass or fail and never a score, because a judge rating reasoning out of five would reintroduce through the test harness exactly the uncalibrated number ADR-0001 turned down. The timeline is the honest part. The gate went red four times before it went green, and each red caught something real, including one run where the harness charged its own parse failures to the system and reported twelve scholarly rulings that had never happened. A harness that cannot tell a failed measurement from a bad result reports the second when it means the first. One floor moved after all that, in a commit that argued from the report, and that is the only way a threshold is allowed to move here: lowering a bar to turn a red run green is the failure mode the rule exists to make visible.",
    ],
  },
  {
    number: "03",
    title: "Runtime and integrations",
    adrs: ["ADR-0002", "ADR-0005", "ADR-0008"],
    kicker: null,
    diagram: { file: "d3-deploy-integrations.png", width: 2400, height: 1964 },
    prose: [
      "The runtime is deliberately small. One Vercel project running Next.js App Router with TypeScript end to end, one Neon Postgres database with pgvector, and two model vendors: Anthropic for the extraction and mapping calls, and OpenAI for the embeddings behind precedent retrieval. Slack is a single outgoing webhook that fires only on an escalation and carries the refusal reasons, the questions and a link back to the reviewer page, because an alert nobody can act on from the notification is not worth sending. Models are injected everywhere, so the 419-test unit suite runs against mocks with no network, and PGlite boots the real shipped migrations so the tests exercise the schema production runs (ADR-0002, ADR-0005).",
      "What I care about in this picture is which credential each thing holds. The unit job in CI holds none at all, and its build has to stay green with no database URL set, because an unset database is a state the reviewer page reports rather than crashes on. The eval job holds the model key and nothing else, no database URL and no webhook, and it fails when that key is missing rather than skipping, since a gate that passes without running is a green build for a run nobody performed. The eval job is also path-filtered, so a docs-only commit does not spend a corpus of model calls to measure nothing. The judge model exists only in CI and never runs in production, which is the whole reason it can afford to be a different model from the subject.",
    ],
  },
  {
    number: "04",
    title: "The operations layer this pattern comes from",
    adrs: [],
    kicker: "context, drawn generically",
    diagram: { file: "d4-operations-layer.png", width: 2400, height: 1782 },
    prose: [
      "This is where the habits came from, drawn without any of the specifics. I run a personal automation platform with more than thirty scheduled automations on it, and the parts that taught me the most are the boring safety parts. Email-triggered workers ingest mail and attachments written by someone else while holding the access that reads and sends the mailbox, so each one runs inside a bubblewrap sandbox with a tmpfs home and a curated environment, behind an egress allowlist that fails closed. That last word is the one that matters: an unknown destination is refused rather than logged, and if the sandbox cannot start then the worker does not run unconfined. Mail is read and sent through a Google Workspace service account with domain-wide delegation, and a note inside a message body is advisory context for a human rather than an instruction the pipeline follows.",
      "The rest of the panel is the same idea in different clothes. Dead-letter sweepers re-drive jobs stranded by a worker that died mid-flight, up to a bounded number of attempts and then parked, because a job that dies quietly is worse than one that fails loudly. The local retrieval stack answers with citations in about four seconds and is measured against a hand-built 40-question gold set, since a retrieval system with no gold set has no way to tell a better index from a differently wrong one. The overnight build pipeline is eval-gated for the same reason the triage agent is. None of this is novel. It is the habit of writing the fence into the code rather than into the documentation, and that habit is what the zakat triage design is made of.",
    ],
  },
];

const CLOSING = {
  number: "05",
  title: "What the evals cannot prove",
  kicker: "the limits, stated rather than hidden",
  prose: [
    "Both corpora were written by hand by the same person who wrote the pipeline, and that is the source of every limit here. A green run says the pipeline and one documented standard agree. It does not say the standard is right, and no error rate against genuine adjudications can be derived from it, because nothing in the corpus was decided by a qualified reviewer.",
    "There is no published human baseline to sit beside it either. No zakat institution publishes an error rate, an audit result or an inter-rater reliability figure, so there is no denominator available to anyone, including me. A case is also only as hard as its author could make it: blind spots are shared between a story and its label, so a failure mode neither anticipates is invisible to both. The corpus says nothing about prevalence or throughput either, since the mix was chosen to cover the eight categories and the four refusal conditions rather than to resemble what a platform actually receives.",
    "Reproducibility is bounded. Temperature zero is requested through middleware and is not honoured by these models, so the same campaign can map differently on two runs, which is part of why the bars are loose rather than tight. The corpus deliberately contains cases the system is expected to get wrong, because a suite that passes everything is measuring self-consistency. What this needs next is a set of real adjudications from qualified reviewers. Until that exists, the number on the board is agreement with one written standard, and I would rather say so than let it be read as accuracy.",
  ],
} as const;

export const metadata: Metadata = {
  title: "Zakat-Eligibility Triage: System Design",
  description: "Four diagrams and the decisions behind them.",
};

function Eyebrow({ children }: { children: string }) {
  return (
    <p className="section__eyebrow">
      <Khatam size={11} />
      {children}
    </p>
  );
}

export default function DesignPage() {
  return (
    <main>
      <header>
        <h1 className="marked-title">
          <Khatam outline size={26} />
          Zakat-Eligibility Triage: System Design
        </h1>
        <p className="measure design-lede">
          A triage agent for crowdfunding campaigns. It reads a submitted campaign, assembles the
          evidence a zakat determination would turn on, names what the text leaves missing or
          contested, and hands the file to a qualified human reviewer. It never issues a religious
          ruling. Four diagrams and the decisions behind them.
        </p>
      </header>

      {SECTIONS.map((section) => (
        <section className="section" key={section.number}>
          <Eyebrow>{section.number}</Eyebrow>
          <h2>{section.title}</h2>
          <p className="kicker">
            {section.kicker === null
              ? section.adrs.map((adr) => (
                  <span className="adr" key={adr}>
                    {adr}
                  </span>
                ))
              : section.kicker}
          </p>
          {section.diagram === null ? null : (
            <figure className="diagram">
              {/*
               * A plain img, not next/image: the renders are already quantized to the size they
               * ship at, so an optimizer has nothing left to take off them, and this way the
               * route stays a file on a CDN with no request-time step behind it. The intrinsic
               * dimensions are on the tag so the prose below does not jump as each one lands.
               */}
              <img
                alt={section.title}
                height={section.diagram.height}
                loading={section.number === "01" ? "eager" : "lazy"}
                src={`/diagrams/${section.diagram.file}`}
                width={section.diagram.width}
              />
            </figure>
          )}
          {section.prose.map((paragraph) => (
            <p className="measure" key={paragraph.slice(0, 48)}>
              {paragraph}
            </p>
          ))}
        </section>
      ))}

      <section className="section">
        <Eyebrow>{CLOSING.number}</Eyebrow>
        <h2>{CLOSING.title}</h2>
        <p className="kicker">{CLOSING.kicker}</p>
        <div className="card measure">
          {CLOSING.prose.map((paragraph) => (
            <p key={paragraph.slice(0, 48)}>{paragraph}</p>
          ))}
        </div>
      </section>

      <footer className="page-footer">
        <span>Suleyman Kiani</span>
        <a href="https://suleyman.io">suleyman.io</a>
        <a href={LIVE_APP}>live app</a>
        <a href={REPOSITORY}>repository</a>
      </footer>
    </main>
  );
}
