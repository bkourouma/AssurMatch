import { findForbiddenWording } from "../../../../packages/shared/contracts/content-safety";
import type { AuthEmailPayload } from "../notifications/email/email-delivery.service";

export interface SurveyEmailContext {
  to: string;
  publicReference: string;
  token: string;
  locale?: string;
  baseUrl?: string;
  /** Spec 061 FR-005: signed opt-out token; the link is added when present. */
  unsubscribeToken?: string;
}

export class SatisfactionSurveyEmailTemplateService {
  render(context: SurveyEmailContext): AuthEmailPayload {
    const locale = (context.locale ?? "fr").toLowerCase().startsWith("en") ? "en" : "fr";
    // Spec 054 R9: the public site the pages `/avis/{ref}` and `/en/feedback/{ref}` live on.
    const baseUrl = (context.baseUrl ?? process.env.PUBLIC_APP_URL ?? "http://127.0.0.1:3601").replace(/\/+$/, "");
    const feedbackUrl = locale === "en"
      ? `${baseUrl}/en/feedback/${encodeURIComponent(context.publicReference)}?token=${encodeURIComponent(context.token)}`
      : `${baseUrl}/avis/${encodeURIComponent(context.publicReference)}?token=${encodeURIComponent(context.token)}`;
    // Spec 061 FR-005: `/desinscription` (FR) and `/en/unsubscribe` (EN), token in the query.
    const unsubscribeUrl = context.unsubscribeToken
      ? `${baseUrl}${locale === "en" ? "/en/unsubscribe" : "/desinscription"}?token=${encodeURIComponent(context.unsubscribeToken)}`
      : undefined;

    let subject: string;
    let body: string;

    if (locale === "en") {
      subject = "Your feedback on your broker introduction";
      body = [
        "Hello,",
        "",
        "You were recently introduced to an AssurMatch partner broker.",
        "",
        "Your feedback is valuable to help us monitor service quality. This questionnaire is completely optional and takes less than a minute.",
        "",
        `Share my feedback: ${feedbackUrl}`,
        "",
        "If you do not wish to reply, simply ignore this message.",
        ...(unsubscribeUrl ? ["", `To stop receiving satisfaction surveys: ${unsubscribeUrl}`] : []),
        "",
        "The AssurMatch Team"
      ].join("\n");
    } else {
      subject = "Votre avis sur votre mise en relation avec le courtier";
      body = [
        "Bonjour,",
        "",
        "Vous avez récemment été mis en relation avec un courtier partenaire AssurMatch.",
        "",
        "Votre avis est précieux pour nous aider à mesurer la qualité du service. Ce questionnaire est totalement facultatif et prend moins d'une minute.",
        "",
        `Donner mon avis : ${feedbackUrl}`,
        "",
        "Si vous ne souhaitez pas répondre, vous pouvez simplement ignorer ce message.",
        ...(unsubscribeUrl ? ["", `Ne plus recevoir d'enquêtes de satisfaction : ${unsubscribeUrl}`] : []),
        "",
        "L'équipe AssurMatch"
      ].join("\n");
    }

    const violations = [
      ...findForbiddenWording(subject),
      ...findForbiddenWording(body)
    ];

    if (violations.length > 0) {
      throw new Error(`Forbidden wording detected in satisfaction survey email template: ${violations.join(", ")}`);
    }

    return {
      to: context.to,
      subject,
      body,
      purpose: "satisfaction_survey_requested"
    };
  }
}
