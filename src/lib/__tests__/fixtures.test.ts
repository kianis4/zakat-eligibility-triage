import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CampaignInput } from "../campaign";
import { RECIPIENT_CATEGORY_IDS } from "../categories";
import { ESCALATION_REASON_KINDS } from "../escalation";
import { EvalFixture, MINIMUM_CORPUS_SIZE, loadEvalFixtures } from "../eval-fixture";

const FIXTURES_DIR = fileURLToPath(new URL("../../../fixtures/evals/", import.meta.url));

const fixtures = await loadEvalFixtures();

/**
 * The label as a hand editor can mistype it, which is looser than the label the schema
 * admits. The negative cases need to express the mistakes, so they need a type that can
 * hold one.
 */
type LooseLabel = {
  expectedFindings: Record<string, { status: string; mustCiteSubstring?: string }>;
  expectedEscalation: { expected: boolean; kinds: string[] };
  expectedMissingEvidence: string[];
};

/**
 * Builds a fixture that differs from a real one in exactly one respect.
 *
 * The negative cases below are the only way to show that the schema is carrying the
 * corpus rather than decorating it: a validation test over files that already pass proves
 * the files pass, not that anything would be caught. Each mutation is a mistake a person
 * editing these files by hand would plausibly make.
 */
function tamper(mutate: (label: LooseLabel) => void): unknown {
  const clone = JSON.parse(JSON.stringify(fixtures[0])) as { label: LooseLabel };
  mutate(clone.label);
  return clone;
}

describe("the labelled eval corpus", () => {
  it("parses every file in the directory", async () => {
    const names = (await readdir(FIXTURES_DIR)).filter((name) => name.endsWith(".json"));

    expect(fixtures).toHaveLength(names.length);
    expect(new Set(fixtures.map((fixture) => fixture.id)).size).toBe(fixtures.length);
  });

  it("carries a campaign in the shape the platform submits one", async () => {
    const names = (await readdir(FIXTURES_DIR)).filter((name) => name.endsWith(".json")).sort();

    for (const name of names) {
      const raw: unknown = JSON.parse(await readFile(join(FIXTURES_DIR, name), "utf8"));

      expect(() => CampaignInput.parse(raw), name).not.toThrow();
    }
  });

  it("labels all eight categories on every case", () => {
    for (const fixture of fixtures) {
      const labelled = Object.keys(fixture.label.expectedFindings).sort();

      expect(labelled, fixture.id).toEqual([...RECIPIENT_CATEGORY_IDS].sort());
    }
  });

  it("points every supported label at words the organizer wrote", () => {
    for (const fixture of fixtures) {
      for (const [category, finding] of Object.entries(fixture.label.expectedFindings)) {
        if (finding.status !== "supported") {
          continue;
        }

        expect(fixture.story.indexOf(finding.mustCiteSubstring), `${fixture.id} ${category}`)
          .toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("names only escalation conditions the refusal gate can reach", () => {
    for (const fixture of fixtures) {
      for (const kind of fixture.label.expectedEscalation.kinds) {
        expect(ESCALATION_REASON_KINDS, fixture.id).toContain(kind);
      }
    }
  });

  it("stays the size a hand-written corpus can be kept honest at", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(MINIMUM_CORPUS_SIZE);
    expect(fixtures.length).toBeLessThanOrEqual(18);
  });

  it("carries cases at all three difficulties, three of them ambiguous at least", () => {
    const byDifficulty = fixtures.map((fixture) => fixture.label.difficulty);

    expect(byDifficulty.filter((difficulty) => difficulty === "clean").length).toBeGreaterThan(0);
    expect(byDifficulty.filter((difficulty) => difficulty === "flagged").length).toBeGreaterThan(0);
    expect(
      byDifficulty.filter((difficulty) => difficulty === "ambiguous").length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("exercises every condition the refusal gate can fire on", () => {
    const named = new Set(fixtures.flatMap((fixture) => fixture.label.expectedEscalation.kinds));

    expect(named).toEqual(new Set(ESCALATION_REASON_KINDS));
  });

  it("expects no refusal on a case it calls clean", () => {
    for (const fixture of fixtures) {
      if (fixture.label.difficulty !== "clean") {
        continue;
      }

      expect(fixture.label.expectedEscalation.expected, fixture.id).toBe(false);
    }
  });

  it("records why each case is labelled the way it is", () => {
    for (const fixture of fixtures) {
      expect(fixture.label.notes.length, fixture.id).toBeGreaterThan(300);
    }
  });

  it("asks the organizer only about categories it also expects unresolved", () => {
    for (const fixture of fixtures) {
      for (const category of fixture.label.expectedMissingEvidence) {
        expect(fixture.label.expectedFindings[category].status, `${fixture.id} ${category}`).toBe(
          "insufficient_evidence",
        );
      }
    }
  });
});

describe("the fixture schema", () => {
  it("refuses a supported label citing text the story does not contain", () => {
    const tampered = tamper((label) => {
      label.expectedFindings["al-fuqara"] = {
        status: "supported",
        mustCiteSubstring: "a sentence no organizer in this corpus ever wrote",
      };
    });

    expect(EvalFixture.safeParse(tampered).success).toBe(false);
  });

  it("refuses a supported label with nothing for a citation to point at", () => {
    const tampered = tamper((label) => {
      label.expectedFindings["al-fuqara"] = { status: "supported" };
    });

    expect(EvalFixture.safeParse(tampered).success).toBe(false);
  });

  it("refuses a label that drops a category", () => {
    const tampered = tamper((label) => {
      delete label.expectedFindings["ibn-al-sabil"];
    });

    expect(EvalFixture.safeParse(tampered).success).toBe(false);
  });

  it("refuses a question on a category the same label expects resolved", () => {
    const tampered = tamper((label) => {
      label.expectedMissingEvidence = ["fi-sabilillah"];
    });

    expect(EvalFixture.safeParse(tampered).success).toBe(false);
  });

  it("refuses a condition the gate has no rule for", () => {
    const tampered = tamper((label) => {
      label.expectedEscalation = { expected: true, kinds: ["looks_suspicious"] };
    });

    expect(EvalFixture.safeParse(tampered).success).toBe(false);
  });

  it("refuses a refusal with no condition named", () => {
    const tampered = tamper((label) => {
      label.expectedEscalation = { expected: true, kinds: [] };
    });

    expect(EvalFixture.safeParse(tampered).success).toBe(false);
  });

  it("refuses a condition named on a case expected to pass through", () => {
    const tampered = tamper((label) => {
      label.expectedEscalation = { expected: false, kinds: ["mixed_use"] };
    });

    expect(EvalFixture.safeParse(tampered).success).toBe(false);
  });

  it("refuses an unsupported-claim label on a case with a supported category", () => {
    const tampered = tamper((label) => {
      label.expectedFindings["al-fuqara"] = {
        status: "supported",
        mustCiteSubstring: "There is no savings account",
      };
      label.expectedEscalation = { expected: true, kinds: ["claim_without_support"] };
    });

    expect(EvalFixture.safeParse(tampered).success).toBe(false);
  });

  it("refuses a nothing-resolvable label on a case it expects resolved", () => {
    const tampered = tamper((label) => {
      label.expectedEscalation = { expected: true, kinds: ["nothing_resolvable"] };
    });

    expect(EvalFixture.safeParse(tampered).success).toBe(false);
  });
});
