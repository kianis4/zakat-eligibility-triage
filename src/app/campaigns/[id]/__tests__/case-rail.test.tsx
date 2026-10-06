import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CaseRail } from "../case-rail";

describe("the section rail", () => {
  it("points at no decision and no audit trail, because none is recorded", () => {
    const markup = renderToStaticMarkup(<CaseRail hasRun refused />);

    expect(markup).not.toContain("#decision");
    expect(markup).not.toContain("Audit trail");
  });
});
