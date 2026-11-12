import { describe, expect, it } from "vitest";
import { headline } from "../../app/lib/quote-headline";

describe("headline of the visitor tracking page", () => {
  it("follows the pipeline status while the consent stands", () => {
    expect(headline({ status: "transmitted", consent: { withdrawn: false } })).toBe("transmitted");
    expect(headline({ status: "received", consent: { withdrawn: false } })).toBe("received");
  });

  it("says the consent is withdrawn whatever the pipeline status kept by the API", () => {
    expect(headline({ status: "transmitted", consent: { withdrawn: true } })).toBe("consent_withdrawn");
    expect(headline({ status: "closed", consent: { withdrawn: true } })).toBe("consent_withdrawn");
  });
});
