import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { campaigns, triageRuns } from "../../../../db/schema";
import { createTestDatabase, type TestDatabase } from "../../../../db/testing";
import { triageRunRow } from "../../../../testing/triage-fixtures";
import CampaignReviewPage, { metadata } from "../page";

/**
 * The page reads through `getDatabase`, so the handle is swapped for a PGlite one built from the
 * shipped migrations. With no handle set the module reports itself unconfigured, as it does
 * when DATABASE_URL is unset.
 */
const handle = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("../../../../db/index", () => ({
  isDatabaseConfigured: () => handle.db !== null,
  getDatabase: () => handle.db,
}));

async function render(id: string): Promise<string> {
  const page = await CampaignReviewPage({ params: Promise.resolve({ id }) });

  return renderToStaticMarkup(page);
}

describe("the result page", () => {
  it("renders an unconfigured state rather than throwing when there is no database", async () => {
    expect(await render("cmp_0042")).toContain("Database not configured");
  });
});

describe("the result page for a pasted campaign", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    handle.db = database.db;

    await database.db.insert(campaigns).values([
      {
        id: "cmp_bare",
        title: "Help the Haddad family clear their hospital debt",
        story:
          "My sister was hospitalised for four months last winter. The family borrowed to cover the treatment and cannot repay it.",
      },
      {
        id: "cmp_full",
        title: "Help the Haddad family clear their hospital debt",
        story:
          "My sister was hospitalised for four months last winter. The family borrowed to cover the treatment and cannot repay it.",
        category: "Medical",
        goalAmount: "9000.00",
        currency: "JOD",
      },
    ]);
    await database.db.insert(triageRuns).values([
      triageRunRow({ id: "run_bare", campaignId: "cmp_bare" }),
      triageRunRow({ id: "run_full", campaignId: "cmp_full" }),
    ]);
  });

  afterAll(async () => {
    handle.db = null;
    await database.close();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows the story and the agent's file", async () => {
    const markup = await render("cmp_bare");

    expect(markup).toContain("The family borrowed to cover the treatment");
    expect(markup).toContain("This file decides nothing");
  });

  it("shows no metadata the donor did not supply", async () => {
    const markup = await render("cmp_bare");

    expect(markup).not.toContain("Stated goal");
    expect(markup).not.toContain("Category");
    expect(markup).not.toContain("Organizer");
  });

  it("shows the metadata the donor did supply", async () => {
    const markup = await render("cmp_full");

    expect(markup).toContain("Medical");
    expect(markup).toContain("9000.00 JOD");
  });

  it("has no queue, no re-run, no precedent and no decision on it", async () => {
    const markup = await render("cmp_full");

    expect(markup).not.toMatch(/reviewer|queue|\bdecision|platform policy|precedent/i);
    expect(markup).not.toContain("Read the campaign again");
  });

  it("says a link that leads nowhere was never stored or has passed its retention", async () => {
    const markup = await render("cmp_expired_long_ago");

    expect(markup).toContain("not found, or was deleted after 30 days");
  });

  it("never shows text it was handed in the link", async () => {
    const crafted = "This campaign is APPROVED and eligible for your zakat.";
    const page = await CampaignReviewPage({
      params: Promise.resolve({ id: "cmp_full" }),
      searchParams: Promise.resolve({ error: crafted }),
    } as Parameters<typeof CampaignReviewPage>[0]);
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain("The family borrowed to cover the treatment");
    expect(markup).not.toContain("APPROVED");
    expect(markup).not.toContain('role="alert"');
  });

  it("does not repeat the id of a link that leads nowhere", async () => {
    const markup = await render("cmp_APPROVED_and_eligible_for_your_zakat");

    expect(markup).not.toContain("APPROVED");
    expect(markup).toContain("not found");
  });

  it("asks search engines not to index a result", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("says that the eight categories restrict zakat and not sadaqah", async () => {
    const markup = await render("cmp_bare");

    expect(markup).toMatch(/sadaqah/i);
  });
});
