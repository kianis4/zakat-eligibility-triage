import { describe, expect, it } from "vitest";

import { CampaignInput } from "../campaign";

const validCampaign = {
  id: "cmp_0001",
  title: "Rebuild the Nasser family home after the flood",
  story:
    "Our home in the valley was destroyed by flooding in March. We are staying with my brother while we raise the cost of rebuilding.",
  category: "Emergency Relief",
  goalAmount: 18000,
  currency: "USD",
  organizer: {
    name: "Layla Nasser",
    location: "Amman, Jordan",
    relationshipToBeneficiary: "daughter of the beneficiaries",
  },
};

describe("CampaignInput", () => {
  it("parses a well-formed submitted campaign", () => {
    const parsed = CampaignInput.parse(validCampaign);

    expect(parsed.id).toBe("cmp_0001");
    expect(parsed.goalAmount).toBe(18000);
    expect(parsed.organizer.name).toBe("Layla Nasser");
    expect(parsed.organizer.relationshipToBeneficiary).toBe("daughter of the beneficiaries");
  });

  it("treats relationshipToBeneficiary as optional", () => {
    const { relationshipToBeneficiary: _omitted, ...organizer } = validCampaign.organizer;
    const parsed = CampaignInput.parse({ ...validCampaign, organizer });

    expect(parsed.organizer.relationshipToBeneficiary).toBeUndefined();
  });

  it("keeps category a free-form platform string rather than our own taxonomy", () => {
    const parsed = CampaignInput.parse({ ...validCampaign, category: "Orphan Support" });

    expect(parsed.category).toBe("Orphan Support");
  });

  it("rejects a negative goal amount", () => {
    const result = CampaignInput.safeParse({ ...validCampaign, goalAmount: -500 });

    expect(result.success).toBe(false);
  });

  it("rejects a zero goal amount", () => {
    const result = CampaignInput.safeParse({ ...validCampaign, goalAmount: 0 });

    expect(result.success).toBe(false);
  });

  it("rejects a campaign with no organizer", () => {
    const { organizer: _omitted, ...withoutOrganizer } = validCampaign;
    const result = CampaignInput.safeParse(withoutOrganizer);

    expect(result.success).toBe(false);
  });

  it("rejects an organizer missing a location", () => {
    const result = CampaignInput.safeParse({
      ...validCampaign,
      organizer: { name: "Layla Nasser" },
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty story, because there would be nothing to cite", () => {
    const result = CampaignInput.safeParse({ ...validCampaign, story: "" });

    expect(result.success).toBe(false);
  });
});
