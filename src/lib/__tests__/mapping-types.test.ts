import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  RECIPIENT_CATEGORY_IDS,
  SCHOLARLY_DIFFERENCE_IDS,
  scholarlyDifferenceById,
} from "../categories";
import {
  CategoryMapping,
  CategoryFinding,
  type Citation,
  MixedUseSignal,
  ModelMapping,
} from "../mapping";

const citation: Citation = { quote: "cannot repay it", start: 10, end: 25 };

/**
 * The `@ts-expect-error` lines are the assertion here, and `tsc --noEmit` is what runs it.
 * If the union ever stopped forbidding an uncited supported finding, the suppressed error
 * would not appear, and tsc would fail on the unused suppression. The runtime checks below
 * each line cover the other half, since a value that arrives as JSON never met the type.
 */
describe("an uncited supported finding is unrepresentable", () => {
  it("does not accept an empty citation list", () => {
    const finding: CategoryFinding = {
      status: "supported",
      // @ts-expect-error a supported finding needs at least one citation
      citations: [],
      rationale: "The story states a debt the family cannot repay.",
    };

    expect(CategoryFinding.safeParse(finding).success).toBe(false);
  });

  it("does not accept a supported finding with no citations field at all", () => {
    // @ts-expect-error a supported finding needs at least one citation
    const finding: CategoryFinding = {
      status: "supported",
      rationale: "The story states a debt the family cannot repay.",
    };

    expect(CategoryFinding.safeParse(finding).success).toBe(false);
  });

  it("accepts a supported finding that cites one span", () => {
    const finding: CategoryFinding = {
      status: "supported",
      citations: [citation],
      rationale: "The story states a debt the family cannot repay.",
    };

    expect(CategoryFinding.safeParse(finding).success).toBe(true);
  });
});

/**
 * ADR-0007's invariant, checked where it is actually enforced. The model may select a
 * difference and say why this campaign sits inside it; it may not describe the difference,
 * which is what a free-text field beside the selection would let it do.
 */
describe("the model-facing schema offers no room to author a scholarly position", () => {
  const schema = z.toJSONSchema(ModelMapping, { io: "input" }) as Record<string, unknown>;

  const item = (
    (schema.properties as Record<string, Record<string, unknown>>).findings.items as Record<
      string,
      unknown
    >
  ).properties as Record<string, Record<string, unknown>>;

  /**
   * One item schema now serves all three statuses, so the selection this walks is the only
   * one the model is offered, on a finding of any status. The status enum below is what says
   * the three are covered by it.
   */
  const selection = (item.scholarlyDifference.anyOf as Record<string, unknown>[]).find(
    (branch) => branch.type === "object",
  ) as Record<string, unknown>;

  it("offers a finding of any status the same one selection field", () => {
    expect(item.status.enum).toEqual(["supported", "not_supported", "insufficient_evidence"]);
  });

  it("offers a finding an id and a bounded why, and nothing else", () => {
    const properties = selection.properties as Record<string, Record<string, unknown>>;

    expect(Object.keys(properties).sort()).toEqual(["id", "whyThisApplies"]);
    expect(properties.id.enum).toEqual([...SCHOLARLY_DIFFERENCE_IDS]);
    expect(typeof properties.whyThisApplies.maxLength).toBe("number");
  });

  /**
   * The field names are the other half of the invariant. A field the model can fill called
   * summary, note, position or ruling is an invitation to write one, whatever the prompt
   * says, and the model-facing schema is the last place that invitation can be withdrawn.
   */
  it("names no field that asks the model for a scholarly position or a source text", () => {
    function propertyNames(node: unknown): string[] {
      if (Array.isArray(node)) {
        return node.flatMap(propertyNames);
      }

      if (node === null || typeof node !== "object") {
        return [];
      }

      return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
        key === "properties" && value !== null && typeof value === "object"
          ? Object.entries(value as Record<string, unknown>).flatMap(([name, child]) => [
              name,
              ...propertyNames(child),
            ])
          : propertyNames(value),
      );
    }

    for (const name of propertyNames(schema)) {
      expect(name).not.toMatch(/summary|note|position|ruling|verse|hadith|fatwa|policy|source/i);
    }
  });
});

/**
 * The provider's structured-output compiler refuses a schema with more than sixteen
 * union-typed parameters, and it counts every occurrence rather than every distinct shape.
 * Eight named category properties, each a three-member union carrying a nullable selection,
 * came to thirty-two and took every live mapping call down with
 * `MappingError('model_call_failed')`. Nothing in the unit suite saw it, because a mock
 * never compiles the schema.
 *
 * The count is what has to stay small, so the count is what this asserts. The margin is
 * wide on purpose: a field added to the item costs one, a property added beside `findings`
 * costs one, and the failure mode is a request the provider will not accept at all.
 */
describe("the model-facing schema stays inside the provider's union limit", () => {
  const UNION_LIMIT = 16;

  function unionParameterCount(node: unknown): number {
    if (Array.isArray(node)) {
      return node.reduce((total: number, child) => total + unionParameterCount(child), 0);
    }

    if (node === null || typeof node !== "object") {
      return 0;
    }

    return Object.entries(node as Record<string, unknown>).reduce((total, [key, value]) => {
      if (key !== "properties" || value === null || typeof value !== "object") {
        return total + unionParameterCount(value);
      }

      return Object.values(value as Record<string, unknown>).reduce((subtotal: number, child) => {
        const property = child as Record<string, unknown>;
        const isUnion =
          Array.isArray(property.type) ||
          property.anyOf !== undefined ||
          property.oneOf !== undefined;

        return subtotal + (isUnion ? 1 : 0) + unionParameterCount(property);
      }, total);
    }, 0);
  }

  it("declares fewer union-typed parameters than the compiler allows", () => {
    const schema = z.toJSONSchema(ModelMapping, { io: "input" });

    expect(unionParameterCount(schema)).toBeLessThanOrEqual(UNION_LIMIT);
  });

  it("would catch a union-heavy schema if one were reintroduced", () => {
    const perCategory = z.object(
      Object.fromEntries(
        RECIPIENT_CATEGORY_IDS.map((id) => [id, z.object({ note: z.string() }).nullable()]),
      ),
    );

    expect(unionParameterCount(z.toJSONSchema(perCategory, { io: "input" }))).toBe(
      RECIPIENT_CATEGORY_IDS.length,
    );
  });
});

describe("a scholarly difference that is not the recorded one is unrepresentable", () => {
  const recorded = scholarlyDifferenceById("fi-sabilillah-scope");
  const whyThisApplies = "The campaign funds a communal building rather than a named person.";

  it("accepts the entry as the corpus records it", () => {
    const finding: CategoryFinding = {
      status: "not_supported",
      rationale: "The story describes a building project and no individual beneficiary.",
      scholarlyDifference: { entry: recorded, whyThisApplies },
    };

    expect(CategoryFinding.safeParse(finding).success).toBe(true);
  });

  it("rejects an entry whose summary has been rewritten under a real id", () => {
    const finding: CategoryFinding = {
      status: "not_supported",
      rationale: "The story describes a building project and no individual beneficiary.",
      scholarlyDifference: {
        entry: { ...recorded, summary: "Most scholars permit building projects." },
        whyThisApplies,
      },
    };

    expect(CategoryFinding.safeParse(finding).success).toBe(false);
  });

  it("rejects an id the corpus does not hold", () => {
    const finding = {
      status: "not_supported",
      rationale: "The story describes a building project and no individual beneficiary.",
      scholarlyDifference: {
        entry: { ...recorded, id: "fi-sabilillah-mosques" },
        whyThisApplies,
      },
    };

    expect(CategoryFinding.safeParse(finding).success).toBe(false);
  });

  it("rejects a why that runs to more than the one sentence it is allowed", () => {
    const finding: CategoryFinding = {
      status: "not_supported",
      rationale: "The story describes a building project and no individual beneficiary.",
      scholarlyDifference: {
        entry: recorded,
        whyThisApplies:
          "The campaign funds a communal building. Scholars differ over whether that is permitted.",
      },
    };

    expect(CategoryFinding.safeParse(finding).success).toBe(false);
  });

  it("rejects a why carrying a quotation", () => {
    const finding: CategoryFinding = {
      status: "not_supported",
      rationale: "The story describes a building project and no individual beneficiary.",
      scholarlyDifference: {
        entry: recorded,
        whyThisApplies: 'The campaign says "zakat may build a mosque" of its own project.',
      },
    };

    expect(CategoryFinding.safeParse(finding).success).toBe(false);
  });
});

describe("an uncited mixed-use signal is unrepresentable", () => {
  it("does not accept a signal with an empty citation list", () => {
    const signal: MixedUseSignal = {
      description: "Surplus funds are directed to equipment rather than to the debt.",
      // @ts-expect-error a mixed-use signal needs at least one citation
      citations: [],
    };

    expect(MixedUseSignal.safeParse(signal).success).toBe(false);
  });

  /**
   * The description is the only part of a signal that reaches the escalation question, and
   * the question is the whole value of the refusal. A description of "." parses as a string,
   * builds a grammatical question, and names nothing a reviewer could act on, which is the
   * generic needs-review flag arriving by the back door.
   */
  it("does not accept a description made of punctuation", () => {
    const signal: MixedUseSignal = { description: ".", citations: [citation] };

    expect(MixedUseSignal.safeParse(signal).success).toBe(false);
  });

  it("does not accept a description naming only one thing the money goes to", () => {
    const signal: MixedUseSignal = { description: "Equipment", citations: [citation] };

    expect(MixedUseSignal.safeParse(signal).success).toBe(false);
  });

  it("accepts a signal that cites one span", () => {
    const signal: MixedUseSignal = {
      description: "Surplus funds are directed to equipment rather than to the debt.",
      citations: [citation],
    };

    expect(MixedUseSignal.safeParse(signal).success).toBe(true);
  });
});

/**
 * Walks a JSON Schema and returns the dotted path of every node declared as a number.
 * Keyword values such as `minimum` are numbers in the document but not schema nodes, so
 * only nodes carrying a numeric `type` count.
 */
function numericLeafPaths(node: unknown, path: string): string[] {
  if (Array.isArray(node)) {
    return node.flatMap((child) => numericLeafPaths(child, path));
  }

  if (node === null || typeof node !== "object") {
    return [];
  }

  const schema = node as Record<string, unknown>;
  const paths: string[] = [];

  if (schema.type === "number" || schema.type === "integer") {
    paths.push(path);
  }

  for (const [key, value] of Object.entries(schema)) {
    if (key === "type" || key === "required" || key === "enum" || key === "const") {
      continue;
    }

    if (key === "properties" && value !== null && typeof value === "object") {
      for (const [name, child] of Object.entries(value as Record<string, unknown>)) {
        paths.push(...numericLeafPaths(child, `${path}.${name}`));
      }
      continue;
    }

    paths.push(...numericLeafPaths(value, path));
  }

  return paths;
}

describe("the mapping carries no scores", () => {
  const paths = numericLeafPaths(z.toJSONSchema(CategoryMapping, { io: "output" }), "$");

  it("has numbers only where a citation records its offsets", () => {
    expect(paths).toContain("$.categories.citations.start");
    expect(paths).toContain("$.categories.citations.end");

    for (const path of paths) {
      expect(path).toMatch(/\.citations\.(start|end)$/);
    }
  });

  it("would catch a score if one were added", () => {
    const withScore = z.object({ finding: CategoryFinding, confidence: z.number() });

    expect(numericLeafPaths(z.toJSONSchema(withScore, { io: "output" }), "$")).toContain(
      "$.confidence",
    );
  });
});
