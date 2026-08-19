import { describe, expect, it } from "vitest";

import { campaignRowFrom, fieldsOf, firstIssue, NewCampaignForm } from "../forms";

const submitted = {
  title: "Help the Haddad family clear their hospital debt",
  story: "The family borrowed to cover the treatment and cannot repay it.",
  category: "Medical",
  goalAmount: "9000",
  currency: "JOD",
  organizerName: "Yusuf Haddad",
  organizerLocation: "Irbid, Jordan",
  organizerRelationshipToBeneficiary: "brother",
};

function formDataFrom(fields: Record<string, string>): FormData {
  const formData = new FormData();

  for (const [name, value] of Object.entries(fields)) {
    formData.append(name, value);
  }

  return formData;
}

describe("reading a submitted campaign off a form", () => {
  it("takes the fields a form actually submits", () => {
    expect(fieldsOf(formDataFrom(submitted))).toEqual(submitted);
  });

  it("drops a field that is not a string rather than stringifying it", () => {
    const formData = formDataFrom(submitted);
    formData.append("story", new File(["forged"], "story.txt"));

    expect(fieldsOf(formData).story).toBe(submitted.story);
  });

  it("parses the goal out of the string a number input submits", () => {
    expect(NewCampaignForm.parse(submitted).goalAmount).toBe(9000);
  });

  it("generates the campaign id rather than taking one from the form", () => {
    const first = campaignRowFrom(NewCampaignForm.parse(submitted));
    const second = campaignRowFrom(
      NewCampaignForm.parse({ ...submitted, id: "cmp_chosen_by_the_submitter" }),
    );

    expect(first.id).toMatch(/^cmp_/);
    expect(second.id).not.toBe("cmp_chosen_by_the_submitter");
    expect(second.id).not.toBe(first.id);
  });

  it("stores the goal without rounding it into a float", () => {
    const row = campaignRowFrom(NewCampaignForm.parse({ ...submitted, goalAmount: "9000.55" }));

    expect(row.goalAmount).toBe("9000.55");
  });

  it("turns an untouched relationship field back into no declaration", () => {
    const row = campaignRowFrom(
      NewCampaignForm.parse({ ...submitted, organizerRelationshipToBeneficiary: "  " }),
    );

    expect(row.organizerRelationshipToBeneficiary).toBeNull();
  });

  it("refuses a campaign with no story to read", () => {
    const parsed = NewCampaignForm.safeParse({ ...submitted, story: "   " });

    expect(parsed.success).toBe(false);
    expect(firstIssue(parsed.error!)).toMatch(/nothing to triage/);
  });

  it("refuses a goal that is not an amount", () => {
    expect(NewCampaignForm.safeParse({ ...submitted, goalAmount: "" }).success).toBe(false);
    expect(NewCampaignForm.safeParse({ ...submitted, goalAmount: "-5" }).success).toBe(false);
    expect(NewCampaignForm.safeParse({ ...submitted, goalAmount: "many" }).success).toBe(false);
  });
});
