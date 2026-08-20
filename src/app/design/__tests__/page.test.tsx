import { existsSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import DesignPage from "../page";

/**
 * The page is prose and four pictures, so there is exactly one thing here a type cannot hold:
 * whether the bytes each <img> points at are in the repository. A wrong path renders and builds
 * and deploys, and the failure only shows up as four broken images in front of whoever the page
 * was written for. That is what this file is for.
 */
const markup = renderToStaticMarkup(<DesignPage />);

const PUBLIC = join(process.cwd(), "public");

describe("the system design page", () => {
  it("serves every diagram it references from public/", () => {
    const sources = [...markup.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((match) => match[1]);

    expect(sources).toHaveLength(4);

    for (const source of sources) {
      expect(source.startsWith("/")).toBe(true);
      expect(existsSync(join(PUBLIC, source))).toBe(true);
    }
  });

  it("gives every diagram its intrinsic size, so the prose does not jump as they load", () => {
    const images = [...markup.matchAll(/<img[^>]*>/g)].map((match) => match[0]);

    for (const image of images) {
      expect(image).toMatch(/\swidth="\d+"/);
      expect(image).toMatch(/\sheight="\d+"/);
      expect(image).toMatch(/\salt="[^"]+"/);
    }
  });

  it("carries the four diagram sections and the closing limits", () => {
    expect(markup).toContain("The pipeline and its trust boundary");
    expect(markup).toContain("The evaluation gate");
    expect(markup).toContain("Runtime and integrations");
    expect(markup).toContain("The operations layer this pattern comes from");
    expect(markup).toContain("What the evals cannot prove");
  });

  it("keeps the reviewer within reach of the running app and the source", () => {
    expect(markup).toContain("https://zakat-eligibility-triage.vercel.app");
    expect(markup).toContain("https://github.com/kianis4/zakat-eligibility-triage");
  });
});
