import { findForbiddenWording } from "../../../../../packages/shared/contracts/content-safety";
import { PUBLIC_DEFAULT_LOCALE, type PublicLocale } from "../../../../../packages/shared/contracts/public-site.contracts";
import type { AuthEmailPayload, EmailPurpose } from "./email-delivery.service";

export interface WaitlistConfirmationContext {
  to: string;
  countryCode: string;
  locale?: PublicLocale;
}

export interface ContactConfirmationContext {
  to: string;
  name: string;
  publicReference: string;
  locale?: PublicLocale;
}

export interface PartnerApplicationConfirmationContext {
  to: string;
  contactName: string;
  publicReference: string;
  locale?: PublicLocale;
}

/** Spec 051 R10: the decision e-mail carries the reference and a neutral sentence, nothing else. */
export interface PartnerApplicationDecisionContext {
  to: string;
  contactName: string;
  publicReference: string;
  decision: "accepted" | "rejected";
  locale?: PublicLocale;
}

interface TemplateOptions {
  publicAppUrl?: string;
}

/**
 * The privacy policy is the one link a consent-bearing confirmation owes its recipient, and its
 * path is localised: French is served without a prefix (`/confidentialite`), English under `/en`
 * (see `apps/public/i18n/routing.ts`).
 */
const PRIVACY_PATH: Record<PublicLocale, string> = {
  fr: "/confidentialite",
  en: "/en/privacy"
};

const DISCLAIMER: Record<PublicLocale, string> = {
  fr: "AssurMatch est une plateforme technique de comparaison indicative et de mise en relation avec des courtiers partenaires autorises.",
  en: "AssurMatch is a technical platform for indicative comparison and for connecting you with authorised partner brokers."
};

export class PublicFormEmailTemplateNotSafeError extends Error {
  constructor(public readonly wording: string[]) {
    super(`Public form e-mail refused: invalid public wording in the rendered message (${wording.join(", ")})`);
    this.name = "PublicFormEmailTemplateNotSafeError";
  }
}

/**
 * Spec 047: the outbound confirmation the waitlist, contact and broker-application forms owed their
 * submitters. Spec 045 accepted those three submissions but answered only on screen, so a visitor
 * who closed the tab kept no trace of what they sent.
 *
 * Two rules shape every message here. It carries no submitted free text (no message body, no
 * licence detail): an e-mail leaves the access controls the platform applies to that data and
 * outlives a consent withdrawal, so the confirmation states *that* a submission was recorded and
 * quotes its reference, nothing more - the same reasoning spec 044 applied to broker lead e-mails.
 * And it promises nothing: a waiting-list entry is not a quote, a contact message is not an
 * engagement, and an application creates no partner account (constitution I and II).
 */
export class PublicFormEmailTemplateService {
  constructor(private readonly options: TemplateOptions = {}) {}

  waitlist(context: WaitlistConfirmationContext): AuthEmailPayload {
    const locale = this.resolveLocale(context.locale);
    const privacy = this.privacyLink(locale);
    const country = context.countryCode.toUpperCase();
    const copy =
      locale === "en"
        ? {
            subject: "Your AssurMatch waiting-list registration",
            lines: [
              "Hello,",
              "",
              `Your e-mail address has been added to the AssurMatch waiting list for ${country}.`,
              "We will write to you when the platform opens in that country.",
              "",
              "This registration commits neither you nor us: it is not a quote request and no offer has been compared for you.",
              `You can ask for your address to be removed at any time by replying to this message. Our privacy policy: ${privacy}`,
              "",
              DISCLAIMER.en
            ]
          }
        : {
            subject: "Votre inscription a la liste d'attente AssurMatch",
            lines: [
              "Bonjour,",
              "",
              `Votre adresse e-mail a bien ete ajoutee a la liste d'attente AssurMatch pour ${country}.`,
              "Nous vous ecrirons a l'ouverture de la plateforme dans ce pays.",
              "",
              "Cette inscription n'engage ni vous ni nous: il ne s'agit pas d'une demande de devis et aucune offre n'a ete comparee pour vous.",
              `Vous pouvez demander le retrait de votre adresse a tout moment en repondant a ce message. Notre politique de confidentialite: ${privacy}`,
              "",
              DISCLAIMER.fr
            ]
          };

    return this.render(context.to, copy.subject, copy.lines, "public_waitlist_confirmation");
  }

  contact(context: ContactConfirmationContext): AuthEmailPayload {
    const locale = this.resolveLocale(context.locale);
    const privacy = this.privacyLink(locale);
    const copy =
      locale === "en"
        ? {
            subject: `Your message to AssurMatch ${context.publicReference}`,
            lines: [
              `Hello ${context.name},`,
              "",
              "We have received your message and our team will read it.",
              `Your reference: ${context.publicReference}`,
              "",
              "Quote it if you write to us again about the same subject. Your message itself is not repeated here.",
              `Our privacy policy: ${privacy}`,
              "",
              "This acknowledgement is not an answer to your request and carries no commitment.",
              DISCLAIMER.en
            ]
          }
        : {
            subject: `Votre message a AssurMatch ${context.publicReference}`,
            lines: [
              `Bonjour ${context.name},`,
              "",
              "Nous avons bien recu votre message et notre equipe va le lire.",
              `Votre reference: ${context.publicReference}`,
              "",
              "Citez-la si vous nous reecrivez au sujet de la meme demande. Votre message lui-meme n'est pas repris ici.",
              `Notre politique de confidentialite: ${privacy}`,
              "",
              "Cet accuse de reception ne constitue pas une reponse a votre demande et n'emporte aucun engagement.",
              DISCLAIMER.fr
            ]
          };

    return this.render(context.to, copy.subject, copy.lines, "public_contact_confirmation");
  }

  partnerApplication(context: PartnerApplicationConfirmationContext): AuthEmailPayload {
    const locale = this.resolveLocale(context.locale);
    const privacy = this.privacyLink(locale);
    const copy =
      locale === "en"
        ? {
            subject: `Your AssurMatch partner application ${context.publicReference}`,
            lines: [
              `Hello ${context.contactName},`,
              "",
              "We have received your broker partner application.",
              `Your reference: ${context.publicReference}`,
              "",
              "Our compliance team reviews it before anything else happens. No partner account exists at this stage.",
              "We will write to you to request a copy of your licence: the public form accepts no file upload.",
              `Our privacy policy: ${privacy}`,
              "",
              "This acknowledgement is neither an acceptance nor a refusal of your application.",
              DISCLAIMER.en
            ]
          }
        : {
            subject: `Votre candidature partenaire AssurMatch ${context.publicReference}`,
            lines: [
              `Bonjour ${context.contactName},`,
              "",
              "Nous avons bien recu votre candidature de courtier partenaire.",
              `Votre reference: ${context.publicReference}`,
              "",
              "Notre equipe conformite l'examine avant toute autre etape. Aucun compte partenaire n'existe a ce stade.",
              "Nous vous ecrirons pour demander une copie de votre licence: le formulaire public n'accepte aucun depot de fichier.",
              `Notre politique de confidentialite: ${privacy}`,
              "",
              "Cet accuse de reception ne vaut ni acceptation ni refus de votre candidature.",
              DISCLAIMER.fr
            ]
          };

    return this.render(context.to, copy.subject, copy.lines, "public_partner_application_confirmation");
  }

  /**
   * Spec 051 FR-017: the decision on a broker application, in the language of the application. It
   * quotes the `PA-` reference only: never the internal note, the refusal reason or any data the
   * applicant did not provide. An acceptance opens a technical partnership; it is not an
   * accreditation and says so. A refusal is neutral and is not an opinion on the accreditation.
   */
  partnerApplicationDecision(context: PartnerApplicationDecisionContext): AuthEmailPayload {
    const locale = this.resolveLocale(context.locale);
    const privacy = this.privacyLink(locale);
    const accepted = context.decision === "accepted";
    const copy =
      locale === "en"
        ? {
            subject: `Your AssurMatch partner application ${context.publicReference}`,
            lines: [
              `Hello ${context.contactName},`,
              "",
              accepted
                ? "Our compliance team has reviewed your broker partner application and accepted it."
                : "Our compliance team has reviewed your broker partner application and cannot take it further at this stage.",
              `Your reference: ${context.publicReference}`,
              "",
              ...(accepted
                ? [
                    "This acceptance opens a technical partnership with AssurMatch. It is not an accreditation and does not replace the one issued by your supervisory authority.",
                    "We will contact you to complete your file before any activation: no lead is sent to you at this stage."
                  ]
                : ["This decision is not an opinion on your accreditation or on your activity."]),
              `Our privacy policy: ${privacy}`,
              "",
              DISCLAIMER.en
            ]
          }
        : {
            subject: `Votre candidature partenaire AssurMatch ${context.publicReference}`,
            lines: [
              `Bonjour ${context.contactName},`,
              "",
              accepted
                ? "Notre equipe conformite a examine votre candidature de courtier partenaire et l'a acceptee."
                : "Notre equipe conformite a examine votre candidature de courtier partenaire et ne peut pas y donner suite a ce stade.",
              `Votre reference: ${context.publicReference}`,
              "",
              ...(accepted
                ? [
                    "Cette acceptation ouvre un partenariat technique avec AssurMatch. Elle ne constitue pas un agrement et ne remplace pas celui delivre par votre autorite de controle.",
                    "Nous vous contacterons pour completer votre dossier avant toute activation: aucune demande ne vous est transmise a ce stade."
                  ]
                : ["Cette decision ne constitue pas un avis sur votre agrement ni sur votre activite."]),
              `Notre politique de confidentialite: ${privacy}`,
              "",
              DISCLAIMER.fr
            ]
          };

    return this.render(context.to, copy.subject, copy.lines, "partner_application_decision");
  }

  /** An unsupported or absent locale falls back to French rather than failing the submission. */
  private resolveLocale(locale: PublicLocale | undefined): PublicLocale {
    return locale === "en" || locale === "fr" ? locale : PUBLIC_DEFAULT_LOCALE;
  }

  private render(to: string, subject: string, lines: string[], purpose: EmailPurpose): AuthEmailPayload {
    return this.assertSafe({
      to,
      subject,
      body: lines.join("\n"),
      html: [
        "<!doctype html>",
        "<html>",
        "<body>",
        // A blank separator line carries no content, so it becomes no paragraph.
        ...lines.filter((line) => line !== "").map((line) => `<p>${escapeHtml(line)}</p>`),
        "</body>",
        "</html>"
      ].join(""),
      purpose
    });
  }

  /**
   * Same guardrail as spec 044, on the rendered message rather than the template source: a regulated
   * word reaching an inbox is a compliance incident, not a formatting bug. The shared list is
   * French-only, so it fully covers the French copy and only catches French wording that leaked
   * into the English one.
   */
  private assertSafe(payload: AuthEmailPayload): AuthEmailPayload {
    const wording = [
      ...findForbiddenWording(payload.subject),
      ...findForbiddenWording(payload.body),
      ...(payload.html ? findForbiddenWording(payload.html) : [])
    ];
    if (wording.length > 0) throw new PublicFormEmailTemplateNotSafeError([...new Set(wording)]);
    return payload;
  }

  private privacyLink(locale: PublicLocale): string {
    const base = (this.options.publicAppUrl ?? process.env.PUBLIC_APP_URL ?? "http://127.0.0.1:3601").replace(/\/$/, "");
    return `${base}${PRIVACY_PATH[locale]}`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
