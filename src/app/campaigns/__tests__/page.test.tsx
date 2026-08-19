import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import CampaignQueuePage from "../page";

describe("the campaign queue page", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders an unconfigured state rather than throwing when there is no database", async () => {
    vi.stubEnv("DATABASE_URL", "");

    const page = await CampaignQueuePage({ searchParams: Promise.resolve({}) });

    expect(renderToStaticMarkup(page)).toContain("Database not configured");
  });

  it("tells a reviewer why their submission bounced", async () => {
    vi.stubEnv("DATABASE_URL", "");

    const page = await CampaignQueuePage({
      searchParams: Promise.resolve({ error: "There is nothing to triage without the story." }),
    });

    expect(renderToStaticMarkup(page)).toContain("There is nothing to triage without the story.");
  });
});
