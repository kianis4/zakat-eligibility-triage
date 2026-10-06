import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Lora: () => ({ variable: "font-lora" }),
  Plus_Jakarta_Sans: () => ({ variable: "font-sans" }),
}));

const { default: RootLayout, metadata } = await import("../layout");

const DISCLAIMER = "Independent project, not affiliated with LaunchGood or any crowdfunding platform.";

describe("the shell every page renders inside", () => {
  it("says on every page that the tool is independent of any platform", () => {
    const markup = renderToStaticMarkup(
      <RootLayout>
        <main />
      </RootLayout>,
    );

    expect(markup).toContain(DISCLAIMER);
  });

  it("says the same in the description a search result or a link preview shows", () => {
    expect(metadata.description).toContain(DISCLAIMER);
  });
});
