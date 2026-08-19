import { describe, expect, it } from "vitest";

import {
  CROSS_CUTTING_RESTRICTIONS,
  RECIPIENT_CATEGORIES,
  RECIPIENT_CATEGORY_IDS,
  SCHOLARLY_DIFFERENCES,
  SCHOLARLY_DIFFERENCE_IDS,
  scholarlyDifferenceById,
} from "../categories";

describe("recipient categories", () => {
  it("defines exactly the eight categories of Qur'an 9:60", () => {
    expect(RECIPIENT_CATEGORY_IDS).toHaveLength(8);
    expect(new Set(RECIPIENT_CATEGORY_IDS).size).toBe(8);
  });

  it("carries a gloss and evidence guidance for every category", () => {
    expect(RECIPIENT_CATEGORIES.map((category) => category.id)).toEqual([
      ...RECIPIENT_CATEGORY_IDS,
    ]);

    for (const category of RECIPIENT_CATEGORIES) {
      expect(category.gloss.length).toBeGreaterThan(0);
      expect(category.evidenceGuidance.length).toBeGreaterThan(0);
    }
  });
});

describe("cross-cutting restrictions", () => {
  it("records the three restrictions the research brief states", () => {
    expect(CROSS_CUTTING_RESTRICTIONS.map((restriction) => restriction.id)).toEqual([
      "immediate-family",
      "hashimi-descent",
      "recipient-must-be-muslim",
    ]);
  });

  it("says where each restriction binds", () => {
    const binding = Object.fromEntries(
      CROSS_CUTTING_RESTRICTIONS.map((restriction) => [restriction.id, restriction.whereItBinds]),
    );

    expect(binding["immediate-family"]).toBe("donor");
    expect(binding["hashimi-descent"]).toBe("recipient");
    expect(binding["recipient-must-be-muslim"]).toBe("recipient");
  });

  it("carries a summary and evidence guidance for each", () => {
    for (const restriction of CROSS_CUTTING_RESTRICTIONS) {
      expect(restriction.summary.length).toBeGreaterThan(0);
      expect(restriction.evidenceGuidance.length).toBeGreaterThan(0);
    }
  });
});

describe("scholarly differences", () => {
  it("attaches every difference to a real category", () => {
    for (const difference of SCHOLARLY_DIFFERENCES) {
      expect(RECIPIENT_CATEGORY_IDS).toContain(difference.category);
      expect(difference.topic.length).toBeGreaterThan(0);
      expect(difference.summary.length).toBeGreaterThan(0);
    }
  });

  /**
   * The id list is what the model-facing schema turns into an enum, so a difference the
   * corpus holds under no id is one the pipeline can never name, and an id with no entry
   * behind it is a selection that resolves to nothing. Both are silent failures, which is
   * why the two lists are asserted against each other rather than each on its own.
   */
  it("holds exactly one entry under each of the declared ids", () => {
    expect(SCHOLARLY_DIFFERENCES.map((difference) => difference.id)).toEqual([
      ...SCHOLARLY_DIFFERENCE_IDS,
    ]);
  });

  it("resolves an id to the entry recorded under it", () => {
    for (const id of SCHOLARLY_DIFFERENCE_IDS) {
      expect(scholarlyDifferenceById(id).id).toBe(id);
    }

    expect(scholarlyDifferenceById("fi-sabilillah-tamlik").topic).toBe(
      "tamlik on project campaigns",
    );
  });

  it("covers the territories the research brief marks as contested", () => {
    const covered = SCHOLARLY_DIFFERENCES.map(
      (difference) => `${difference.category}:${difference.topic}`,
    );

    expect(covered).toContain("fi-sabilillah:scope of fi sabilillah");
    expect(covered).toContain("fi-sabilillah:tamlik on project campaigns");
    expect(covered).toContain("al-muallafati-qulubuhum:whether the category still operates");
    expect(covered).toContain(
      "al-muallafati-qulubuhum:whether zakat may go to a non-Muslim recipient",
    );
    expect(covered).toContain("al-gharimin:conditions on debt");
  });
});
