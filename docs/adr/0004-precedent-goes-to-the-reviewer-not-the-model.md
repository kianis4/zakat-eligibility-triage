# ADR-0004: Retrieved precedent is rendered to the reviewer and never fed to the model

Date: 2026-08-19
Status: accepted

## Context
The system now holds a corpus of adjudicated campaigns: the campaign as submitted, how it
came out per recipient category, the decision, and the reviewer's recorded reasoning. A
reviewer looking at a new campaign benefits from seeing the closest four, because the
question they are actually asking is often "have we seen this shape before, and what did
the person who looked at it last notice that I have not".

That corpus is also the most tempting context a language model in this pipeline could be
given. It is on-domain, it is human-written, it is exactly the material that would make
the extraction and mapping steps look more consistent overnight. The default move in
2026 is to retrieve it into the prompt, and the default move is wrong here for reasons
that are structural rather than stylistic.

ADR-0001 holds that the model never issues a religious ruling and that a recorded human
decision is the only output that ships. Section 7 of `docs/RESEARCH.md` states the same
constraint from the research side: prior adjudicated cases shown to a reviewer are a
research aid, and fed back to the model they launder past human decisions into present
machine ones.

## Decision
Retrieval runs after generation and reports to the human. `retrievePrecedents` returns
`PrecedentForReviewer`, the reviewer UI renders it, and no value of that type, and no
field of one, is serialized into any model prompt: not as context, not as a few-shot
example, not as a summary of what past reviewers tended to do.

Two tests enforce it rather than two paragraphs asking nicely.
`src/lib/__tests__/precedent-isolation.test.ts` runs the real pipeline against a model
that records everything it is handed, seeds the corpus, retrieves it, and asserts that no
reviewer note, title, story span, decision or outcome map appears anywhere in the
transcript. The same file walks the import graph of `src/lib/extraction.ts` and
`src/lib/mapping.ts` and fails if either can reach `src/lib/precedent.ts` or `src/db`,
directly or transitively, which catches the version of this mistake that arrives three
modules away as an innocent-looking helper import.

## Alternatives considered
- **Retrieval-augmented generation: put the nearest adjudications in the prompt for
  consistency.** Rejected on what it optimises. Consistency with past output is not
  correctness, and on a corpus of past human decisions it is specifically imitation of
  past human decisions. A model shown four approvals for campaigns that look like this
  one is being told the answer, and ADR-0001 forbids it holding decision authority
  whether that authority arrives as an instruction or as an example. The failure is also
  self-concealing: the mapping would still cite verbatim spans, so the output would look
  exactly as evidenced as before while the selection of what to cite had been anchored.
- **Few-shot from precedent, framed as format examples rather than answers.** Rejected:
  the same anchoring with extra steps and a weaker audit story. A few-shot example
  carries its outcome whether or not the prompt says to ignore it, and the examples
  nearest in embedding space to the current campaign are precisely the ones whose
  outcomes are most likely to be copied. If format examples are needed they can be
  hand-written and fixed, which is a different artifact with a different failure mode.
- **Feed only the reviewer notes, not the decisions.** Rejected: the notes are the part
  that anchors hardest, because they are written as reasoning and a model imitates
  reasoning more readily than a label. They also carry the platform's policy positions on
  contested ground, and a model reproducing those in a mapping rationale would be making
  the choice section 3 of the research says is a religious act.
- **Feed precedent back for calibration, with a human still deciding.** Rejected as a
  feedback loop with no damping. The corpus is written by reviewers who read files this
  system prepares; if it also shapes those files, early mistakes become the pattern the
  system reproduces and then re-learns from. The human's independent calibration is the
  thing precedent exists to support, and it stops being independent at the point the
  machine has already seen it.
- **No precedent at all: skip the vector store and keep the pipeline model-only.**
  Rejected: reviewers genuinely benefit from comparable cases, and section 4 of the
  research shows every institution surveyed running exactly this kind of internal
  reference practice, from senior officers on complex cases to sampled audits. The
  retrieval has a real job. It just reports to the person with the authority.

## Consequences
Easy: the trust boundary stays load-bearing under a feature that would otherwise erode
it, the corpus can grow without any effect on model behaviour, and precedent quality is a
reviewer-experience question rather than a model-safety question.

Hard: the model gets no benefit from the best on-domain data in the system, so extraction
and mapping stay as good or as bad as their prompts and schemas make them, and a
consistency metric across similar campaigns will read worse than the RAG version of this
product would. We accept that, and we accept the standing cost of the guard: anyone
wiring precedent into a prompt has to defeat two tests and rewrite this ADR, which is the
intended amount of friction.
