import { describe, expect, it } from "vitest";
import { SatisfactionSurveyEmailTemplateService } from "../../../src/modules/satisfaction-surveys/satisfaction-surveys.module";

describe("SatisfactionSurveyEmailTemplateService", () => {
  it("renders French template with required disclaimer and feedback link", () => {
    const service = new SatisfactionSurveyEmailTemplateService();
    const payload = service.render({
      to: "visitor@example.com",
      publicReference: "SF-ABCDEF12",
      token: "secret-token-123",
      locale: "fr"
    });

    expect(payload.to).toBe("visitor@example.com");
    expect(payload.subject).toBe("Votre avis sur votre mise en relation avec le courtier");
    expect(payload.body).toContain("https://assurmatch.com/avis/SF-ABCDEF12?token=secret-token-123");
    expect(payload.body).toContain("facultatif");
    expect(payload.purpose).toBe("satisfaction_survey_requested");
  });

  it("renders English template with required disclaimer and feedback link", () => {
    const service = new SatisfactionSurveyEmailTemplateService();
    const payload = service.render({
      to: "visitor@example.com",
      publicReference: "SF-ABCDEF12",
      token: "secret-token-123",
      locale: "en"
    });

    expect(payload.to).toBe("visitor@example.com");
    expect(payload.subject).toBe("Your feedback on your broker introduction");
    expect(payload.body).toContain("https://assurmatch.com/en/feedback/SF-ABCDEF12?token=secret-token-123");
    expect(payload.body).toContain("optional");
    expect(payload.purpose).toBe("satisfaction_survey_requested");
  });
});
