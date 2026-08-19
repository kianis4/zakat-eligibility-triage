import { describe, expect, it } from "vitest";

import { MappingError, resolveCitation } from "../mapping";

const story =
  "We are stranded in Cairo with no way home. We are stranded and the embassy has no funds left for us.";

describe("resolveCitation", () => {
  it("resolves a verbatim quote to the offsets it occupies in the story", () => {
    const citation = resolveCitation(story, "the embassy has no funds left for us");

    expect(story.slice(citation.start, citation.end)).toBe(citation.quote);
    expect(citation.start).toBe(story.indexOf("the embassy has no funds left for us"));
    expect(citation.end).toBe(citation.start + citation.quote.length);
  });

  it("resolves a quote that appears twice to its first occurrence", () => {
    const citation = resolveCitation(story, "We are stranded");

    expect(citation.start).toBe(0);
    expect(story.slice(citation.start, citation.end)).toBe("We are stranded");
    expect(story.indexOf("We are stranded", citation.end)).toBeGreaterThan(citation.end);
  });

  it("resolves a quote at the very end of the story", () => {
    const citation = resolveCitation(story, "no funds left for us.");

    expect(citation.end).toBe(story.length);
    expect(story.slice(citation.start, citation.end)).toBe(citation.quote);
  });

  it("throws rather than approximating a quote that is not in the story", () => {
    const thrown = (() => {
      try {
        resolveCitation(story, "we are stranded in cairo");
        return null;
      } catch (error: unknown) {
        return error;
      }
    })();

    expect(thrown).toBeInstanceOf(MappingError);
    expect((thrown as MappingError).reason).toBe("citation_unresolvable");
    expect((thrown as MappingError).message).toContain("we are stranded in cairo");
  });
});
