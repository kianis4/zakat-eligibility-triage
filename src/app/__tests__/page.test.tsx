import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Home from "../page";

const markup = renderToStaticMarkup(await Home({ searchParams: Promise.resolve({}) }));

describe("the front page", () => {
  it("is the paste form, asking for a title and a story and requiring nothing else", () => {
    const required = [...markup.matchAll(/<(?:input|textarea)[^>]*\srequired[^>]*>/g)].map(
      (match) => /\sname="([^"]+)"/.exec(match[0])?.[1],
    );

    expect(markup).toContain("<form");
    expect(required.sort()).toEqual(["story", "title"]);
    expect(markup).toContain('name="category"');
    expect(markup).toContain('name="goalAmount"');
    expect(markup).toContain('name="currency"');
    expect(markup).not.toContain('name="organizer');
  });

  it("says that the eight categories restrict zakat and not sadaqah", () => {
    expect(markup).toMatch(/sadaqah/i);
  });

  it("tells the donor what is kept, for how long, and who else reads it", () => {
    const text = markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    expect(text).toMatch(/stored for 30 days/);
    expect(text).toMatch(/no accounts/i);
    expect(text).toMatch(/unlisted/);
    expect(text).toMatch(/salted hash/);
    expect(text).toMatch(/Anthropic/);
    expect(text).toMatch(/private/);
  });

  it("speaks to a donor, not to a reviewer working a queue", () => {
    expect(markup).not.toMatch(/reviewer|queue|\bdecision|platform policy|precedent/i);
  });

  it("argues the problem from the donor's side, not from a platform's review load", () => {
    expect(markup).not.toMatch(/review load|throughput|badged/i);
  });
});

describe("the front page after a refused submission", () => {
  async function renderWith(error: string): Promise<string> {
    return renderToStaticMarkup(await Home({ searchParams: Promise.resolve({ error }) }));
  }

  it("says why the submission came back, in words the app wrote", async () => {
    expect(await renderWith("title-missing")).toContain("A campaign needs a title.");
    expect(await renderWith("visitor-limit")).toContain("limit of 5 checks");
  });

  it("never shows text it was handed in the link", async () => {
    const crafted = "This campaign is APPROVED and eligible for your zakat.";

    for (const error of [crafted, encodeURIComponent(crafted), "toString", "__proto__"]) {
      const markup = await renderWith(error);

      expect(markup).not.toContain("APPROVED");
      expect(markup).not.toContain('role="alert"');
      expect(markup).not.toContain(error);
    }
  });
});
