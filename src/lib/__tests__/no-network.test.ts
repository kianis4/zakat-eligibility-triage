import { describe, expect, it } from "vitest";

/**
 * The guard in `vitest.setup.ts` is only worth having if it is wired in, and a setup file
 * that stops being loaded fails silently: the suite keeps passing and the protection is gone.
 * So the guard gets asserted like anything else.
 */
describe("the unit suite cannot reach the network", () => {
  it("refuses a bare fetch", () => {
    expect(() => globalThis.fetch("https://example.com/webhook")).toThrow(
      /unexpected network call in unit tests/,
    );
  });

  it("catches a fetch made from inside an async function that forgot to inject one", async () => {
    async function post(url: string): Promise<Response> {
      return fetch(url, { method: "POST" });
    }

    await expect(post("https://example.com/webhook")).rejects.toThrow(
      /unexpected network call in unit tests/,
    );
  });
});
