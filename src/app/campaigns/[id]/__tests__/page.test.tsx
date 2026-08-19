import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import CampaignReviewPage from "../page";

describe("the reviewer page", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders an unconfigured state rather than throwing when there is no database", async () => {
    vi.stubEnv("DATABASE_URL", "");

    const page = await CampaignReviewPage({
      params: Promise.resolve({ id: "cmp_0042" }),
      searchParams: Promise.resolve({}),
    });

    expect(renderToStaticMarkup(page)).toContain("Database not configured");
  });
});
