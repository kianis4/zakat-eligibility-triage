import { describe, expect, it } from "vitest";

import CampaignsPage from "../page";

function digestOf(error: unknown): string {
  return typeof error === "object" && error !== null && "digest" in error
    ? String((error as { digest: unknown }).digest)
    : "";
}

/**
 * There is no listing. A campaign is reached by the link the donor was given and by nothing
 * else, so the path that used to hold a queue sends the reader to the paste form.
 */
describe("/campaigns", () => {
  it("lists nothing and sends the reader to the paste form", () => {
    let thrown: unknown = null;

    try {
      CampaignsPage();
    } catch (error: unknown) {
      thrown = error;
    }

    expect(digestOf(thrown)).toMatch(/^NEXT_REDIRECT;[a-z]+;\/;/);
  });
});
