import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import * as actions from "../actions";
import { checkCampaign } from "../actions";

/**
 * A submission the schema refuses goes back to the paste form with the reason on it.
 *
 * Nothing is written on this path, so there is no database and no need for one: the form is
 * checked before anything is opened.
 */
async function failureFrom(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    () => null,
    (error: unknown) => error,
  );
}

function digestOf(error: unknown): string {
  return typeof error === "object" && error !== null && "digest" in error
    ? String((error as { digest: unknown }).digest)
    : "";
}

describe("checking a campaign that was pasted wrong", () => {
  it("sends the donor back to the paste form with the reason", async () => {
    const submitted = new FormData();
    submitted.append("title", "Help the Haddad family");
    submitted.append("story", "   ");

    const thrown = await failureFrom(checkCampaign(submitted));

    expect(thrown).not.toBeInstanceOf(ZodError);
    expect(digestOf(thrown)).toContain("NEXT_REDIRECT");
    expect(decodeURIComponent(digestOf(thrown))).toContain(
      ";/?error=There is nothing to check without the story.;",
    );
  });
});

describe("the server actions", () => {
  it("offer one step, the check, and no way to record a decision", () => {
    expect(Object.keys(actions).sort()).toEqual(["checkCampaign"]);
  });
});
