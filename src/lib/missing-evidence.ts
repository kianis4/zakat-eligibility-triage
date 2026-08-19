import { RECIPIENT_CATEGORY_IDS, type RecipientCategory } from "./categories";
import type { CategoryMapping } from "./mapping";

/**
 * One category the campaign text left unresolved, the fact that would resolve it, and the
 * question that would obtain that fact.
 *
 * The question is the model's, written at mapping time while the story was in front of it.
 * Nothing here rewrites it, because a question assembled from a category id and a template
 * is exactly the reviewer-facing jargon the mapping step was made to avoid producing.
 */
export type MissingEvidenceItem = {
  readonly category: RecipientCategory;
  readonly missingFact: string;
  readonly questionForOrganizer: string;
};

/**
 * What a reviewer must ask the organizer before this campaign can be decided.
 *
 * The two fields answer two different questions and neither replaces the other. `items` is
 * the record: every category left unresolved, in the order of Qur'an 9:60, each with its own
 * missing fact, so nothing a reviewer needs to see is dropped for being inconvenient.
 * `questions` is the message: the same questions with the repetitions removed, in the order
 * they first arise, ready to send. Two categories often turn on one unstated fact, and
 * asking an organizer the same thing twice in one message reads as carelessness.
 */
export type MissingEvidenceReport = {
  readonly items: readonly MissingEvidenceItem[];
  readonly questions: readonly string[];
};

/**
 * Collapses the differences that would make two identical questions look distinct.
 *
 * Case and whitespace only. Anything cleverer, stemming or near-match scoring, would start
 * merging questions that ask for different facts, and a merged question is a fact the
 * reviewer never asks for and never learns they are missing.
 */
function normalizeQuestion(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Builds the missing-evidence report from a mapping.
 *
 * Deterministic and pure: same mapping in, same report out, no model call and no clock. The
 * mapping has already been parsed, so every insufficient_evidence verdict is carrying both
 * its missing fact and a question the schema has already checked is sendable. This step
 * gathers them and nothing more, which is the point. The reviewer's work is deciding, and
 * what this hands them is the list of what to ask first.
 */
export function buildMissingEvidenceReport(mapping: CategoryMapping): MissingEvidenceReport {
  const items = RECIPIENT_CATEGORY_IDS.flatMap((category) => {
    const verdict = mapping.categories[category];

    if (verdict.status !== "insufficient_evidence") {
      return [];
    }

    return [
      {
        category,
        missingFact: verdict.missingFact,
        questionForOrganizer: verdict.questionForOrganizer,
      },
    ];
  });

  const asked = new Set<string>();
  const questions = items.flatMap((item) => {
    const key = normalizeQuestion(item.questionForOrganizer);

    if (asked.has(key)) {
      return [];
    }

    asked.add(key);
    return [item.questionForOrganizer];
  });

  return { items, questions };
}
