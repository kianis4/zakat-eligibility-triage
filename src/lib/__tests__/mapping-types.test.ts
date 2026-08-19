import { describe, expect, it } from "vitest";
import { z } from "zod";

import { CategoryMapping, CategoryVerdict, type Citation } from "../mapping";

const citation: Citation = { quote: "cannot repay it", start: 10, end: 25 };

/**
 * The `@ts-expect-error` lines are the assertion here, and `tsc --noEmit` is what runs it.
 * If the union ever stopped forbidding an uncited supported verdict, the suppressed error
 * would not appear, and tsc would fail on the unused suppression. The runtime checks below
 * each line cover the other half, since a value that arrives as JSON never met the type.
 */
describe("an uncited supported verdict is unrepresentable", () => {
  it("does not accept an empty citation list", () => {
    const verdict: CategoryVerdict = {
      status: "supported",
      // @ts-expect-error a supported verdict needs at least one citation
      citations: [],
      rationale: "The story states a debt the family cannot repay.",
    };

    expect(CategoryVerdict.safeParse(verdict).success).toBe(false);
  });

  it("does not accept a supported verdict with no citations field at all", () => {
    // @ts-expect-error a supported verdict needs at least one citation
    const verdict: CategoryVerdict = {
      status: "supported",
      rationale: "The story states a debt the family cannot repay.",
    };

    expect(CategoryVerdict.safeParse(verdict).success).toBe(false);
  });

  it("accepts a supported verdict that cites one span", () => {
    const verdict: CategoryVerdict = {
      status: "supported",
      citations: [citation],
      rationale: "The story states a debt the family cannot repay.",
    };

    expect(CategoryVerdict.safeParse(verdict).success).toBe(true);
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
    const withScore = z.object({ verdict: CategoryVerdict, confidence: z.number() });

    expect(numericLeafPaths(z.toJSONSchema(withScore, { io: "output" }), "$")).toContain(
      "$.confidence",
    );
  });
});
