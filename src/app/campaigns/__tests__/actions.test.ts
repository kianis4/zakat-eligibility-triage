import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { runTriageAction, submitDecision } from "../actions";

/**
 * A form that arrives without the campaign it is about.
 *
 * This is the shape of a template bug rather than of reviewer error: a hidden field that
 * stopped being rendered posts every other field intact. The module says a failure sends the
 * reviewer somewhere with the reason on it, and it used to throw a raw schema error here
 * instead, which is a stack trace on a reviewer's screen and a claim the code did not honour.
 *
 * Nothing is written on this path, so there is no database and no need for one: the id is
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

describe("a form that does not say which campaign it is about", () => {
  it("sends a triage request back to the queue with the reason", async () => {
    const thrown = await failureFrom(runTriageAction(new FormData()));

    expect(thrown).not.toBeInstanceOf(ZodError);
    expect(digestOf(thrown)).toContain("NEXT_REDIRECT");
    expect(decodeURIComponent(digestOf(thrown))).toContain(
      "/campaigns?error=That form did not say which campaign it was about",
    );
  });

  it("sends a decision back to the queue with the reason", async () => {
    const submitted = new FormData();
    submitted.append("action", "approve");
    submitted.append("reviewer", "Amina Suleiman");
    submitted.append("note", "The debt is currently due.");

    const thrown = await failureFrom(submitDecision(submitted));

    expect(thrown).not.toBeInstanceOf(ZodError);
    expect(digestOf(thrown)).toContain("NEXT_REDIRECT");
    expect(decodeURIComponent(digestOf(thrown))).toContain("/campaigns?error=That form did not");
  });
});
