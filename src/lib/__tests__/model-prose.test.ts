import { describe, expect, it } from "vitest";

import { quotesOrCitesASource } from "../model-prose";

/**
 * The four strings a verification pass got through the schema before this guard existed.
 * They are kept verbatim, because a probe rewritten to suit the check it is probing stops
 * being evidence of anything.
 */
const REFUTED = {
  rationale:
    'The story describes a family in debt, and Quran 9:60 says "zakat is for the poor and those in debt" which covers them.',
  missingFact:
    "Whether the debt is currently due, since the Prophet said a debt not yet due does not qualify.",
  questionForOrganizer:
    'The Prophet said "the upper hand is better than the lower hand", so can you tell us what you have already tried?',
  description:
    "Half the money clears the debt and half funds the hall, per Surah 2 verse 271 on public giving.",
};

describe("prose that quotes or cites a source", () => {
  for (const [field, text] of Object.entries(REFUTED)) {
    it(`refuses the ${field} that got through before`, () => {
      expect(quotesOrCitesASource(text)).toBe(true);
    });
  }

  it("refuses a curly quotation as readily as a straight one", () => {
    expect(quotesOrCitesASource("The story cites “a saying about the poor” for its appeal."))
      .toBe(true);
  });

  it("refuses a verse cited by number without any quotation at all", () => {
    expect(quotesOrCitesASource("This falls under verse 60 of the ninth chapter.")).toBe(true);
  });
});

/**
 * The guard is only worth having if it leaves honest sentences alone. The apostrophe cases
 * are the ones that would have made it unusable: possessives and transliterations are
 * everywhere in this domain.
 */
describe("prose about the campaign", () => {
  const allowed = [
    "The story states a debt the family says it cannot repay.",
    "The organizer's sister's treatment is what the money repays.",
    "Whether the clinic's generator becomes the community's property once it is installed.",
    "Who will receive the money you raise, and how will it reach them?",
    "Part of the money clears the family's debt and the rest funds the centre's boiler.",
    "The story describes Quran classes for forty children at the centre.",
    "The campaign raises 9,000 JOD and states that 20 percent is kept for costs.",
  ];

  for (const text of allowed) {
    it(`leaves alone: ${text}`, () => {
      expect(quotesOrCitesASource(text)).toBe(false);
    });
  }
});
