import { findForbiddenWording } from "../../../../../packages/shared/contracts/content-safety";
import type { AuthEmailPayload, EmailPurpose } from "./email-delivery.service";

export type VisitorEmailLocale = "fr" | "en";

/** Spec 054 R4: the steps a visitor e-mail can announce. */
export type VisitorEmailStep =
  | "received"
  | "in_review"
  | "transmitted"
  | "accepted"
  | "reassigned"
  | "closed"
  | "not_transmitted"
  | "consent_withdrawn"
  | "tracking_link";

/** Spec 044 legacy context, kept for the rows queued before spec 054. */
export interface VisitorQuoteEmailContext {
  to: string;
  displayName?: string;
  publicReference: string;
  countryCode: string;
  productKey: string;
  routed: boolean;
  locale?: VisitorEmailLocale;
  token?: string;
  tokenExpiresAt?: Date;
}

/**
 * Spec 054 R10: everything a visitor e-mail may say. No form answer and no contact detail other
 * than the recipient's own address ever reaches a template.
 */
export interface VisitorStepEmailContext {
  step: VisitorEmailStep;
  to: string;
  displayName?: string | undefined;
  publicReference: string;
  countryCode: string;
  productKey: string;
  locale: VisitorEmailLocale;
  /** Broker of the step (trade name, else legal name); absent before any assignment. */
  partnerName?: string | undefined;
  /** Fresh visitor access token minted at render time (R2); never stored in clear. */
  token?: string | undefined;
  tokenExpiresAt?: Date | undefined;
}

export interface BrokerLeadEmailContext {
  to: string;
  partnerLegalName: string;
  publicReference: string;
  countryCode: string;
  productKey: string;
}

interface TemplateOptions {
  publicAppUrl?: string;
  brokerAppUrl?: string;
}

const PLATFORM_DISCLAIMER = "AssurMatch est une plateforme technique de comparaison indicative et de mise en relation avec des courtiers partenaires autorises.";

const DISCLAIMER: Record<VisitorEmailLocale, string> = {
  fr: PLATFORM_DISCLAIMER,
  en: "AssurMatch is a technical platform for indicative comparison and for connecting you with authorised partner brokers."
};

const NO_COMMITMENT: Record<VisitorEmailLocale, string> = {
  fr: "Aucun montant, aucune garantie et aucun engagement contractuel ne resulte de ce message. Le devis et toute decision relevent exclusivement du courtier partenaire.",
  en: "This message sets no amount, no cover and no contractual commitment. The quote and any decision rest solely with the partner broker."
};

/** Localised path of the tracking space (`apps/public/i18n/routing.ts`). */
const TRACKING_PATH: Record<VisitorEmailLocale, string> = {
  fr: "/demandes-de-devis/",
  en: "/en/quote-requests/"
};

const STEP_PURPOSE: Record<VisitorEmailStep, EmailPurpose> = {
  received: "quote_visitor_received",
  in_review: "quote_visitor_in_review",
  transmitted: "quote_visitor_transmitted",
  accepted: "quote_visitor_accepted",
  reassigned: "quote_visitor_reassigned",
  closed: "quote_visitor_closed",
  not_transmitted: "quote_visitor_non_routable",
  consent_withdrawn: "quote_visitor_consent_withdrawn",
  tracking_link: "quote_visitor_tracking_link"
};

/**
 * The shared regulated list is French only; the English copy is checked against its equivalents so
 * a translated promise cannot slip through either.
 */
const FORBIDDEN_ENGLISH_WORDING = ["buy now", "subscribe now", "valid contract", "cover accepted", "best insurance on the market", "guaranteed callback", "firm price"] as const;

export class QuoteEmailTemplateNotSafeError extends Error {
  constructor(public readonly wording: string[]) {
    super(`Quote email refused: invalid public wording in the rendered message (${wording.join(", ")})`);
    this.name = "QuoteEmailTemplateNotSafeError";
  }
}

interface StepCopy {
  subject: string;
  lines: string[];
}

export class QuoteEmailTemplateService {
  constructor(private readonly options: TemplateOptions = {}) {}

  /** Spec 044 entry point, kept for rows queued before spec 054. */
  visitor(context: VisitorQuoteEmailContext): AuthEmailPayload {
    const payload = this.visitorStep({
      step: context.routed ? "transmitted" : "not_transmitted",
      to: context.to,
      displayName: context.displayName,
      publicReference: context.publicReference,
      countryCode: context.countryCode,
      productKey: context.productKey,
      locale: context.locale ?? "fr",
      token: context.token,
      tokenExpiresAt: context.tokenExpiresAt
    });
    return { ...payload, purpose: context.routed ? "quote_visitor_confirmation" : "quote_visitor_non_routable" };
  }

  /**
   * Spec 054 R10: one bilingual template per public step. Each carries a fresh, localised link to
   * the tracking space; the manual review wording never says the request was transmitted.
   */
  visitorStep(context: VisitorStepEmailContext): AuthEmailPayload {
    const locale = context.locale === "en" ? "en" : "fr";
    const link = this.trackingLink(context.publicReference, locale, context.token);
    const copy = locale === "en" ? this.englishCopy(context) : this.frenchCopy(context);
    const greeting = locale === "en"
      ? (context.displayName ? `Hello ${context.displayName},` : "Hello,")
      : (context.displayName ? `Bonjour ${context.displayName},` : "Bonjour,");
    const reference = locale === "en" ? `Your request reference: ${context.publicReference}` : `Reference de votre demande: ${context.publicReference}`;
    const follow = locale === "en" ? `Follow your request: ${link}` : `Suivre votre demande: ${link}`;
    const validity = context.tokenExpiresAt
      ? locale === "en"
        ? `This personal link is valid until ${formatDate(context.tokenExpiresAt)}. Do not share it. You can ask for a new one at any time from the tracking page.`
        : `Ce lien personnel est valable jusqu'au ${formatDate(context.tokenExpiresAt)}. Ne le partagez pas. Vous pouvez en demander un nouveau a tout moment depuis la page de suivi.`
      : undefined;
    const lines = [
      greeting,
      "",
      ...copy.lines,
      reference,
      "",
      follow,
      ...(validity ? [validity] : []),
      "",
      NO_COMMITMENT[locale],
      DISCLAIMER[locale]
    ];
    return this.assertSafe({
      to: context.to,
      subject: copy.subject,
      body: lines.join("\n"),
      html: this.html(lines.filter((line) => line !== "").map((line) => line === follow
        ? `<p><a href="${escapeHtml(link)}">${escapeHtml(locale === "en" ? "Follow your request" : "Suivre votre demande")}</a></p>`
        : `<p>${escapeHtml(line)}</p>`)),
      purpose: STEP_PURPOSE[context.step]
    });
  }

  /**
   * Spec 044 D1: a pointer, never the lead. No visitor contact and no answer value appears here -
   * email leaves every access control the platform applies to that data and outlives any consent
   * withdrawal, so the broker reads the lead in the back-office, behind its tenant check and audit.
   */
  brokerLead(context: BrokerLeadEmailContext): AuthEmailPayload {
    const lines = [
      `Bonjour ${context.partnerLegalName},`,
      "",
      `Un nouveau lead vous a ete assigne: ${context.publicReference} (${context.productKey}, ${context.countryCode}).`,
      "",
      `Les informations consenties sont consultables dans votre back-office: ${this.brokerLink()}`,
      "Elles ne sont pas reprises dans cet email: leur consultation est tracee et limitee a votre cabinet.",
      "",
      "Notification operationnelle. Aucun engagement contractuel ne resulte de ce message.",
      PLATFORM_DISCLAIMER
    ];
    return this.assertSafe({
      to: context.to,
      subject: `Nouveau lead assigne ${context.publicReference}`,
      body: lines.join("\n"),
      html: this.html([
        `<p>Bonjour ${escapeHtml(context.partnerLegalName)},</p>`,
        `<p>Un nouveau lead vous a ete assigne: <strong>${escapeHtml(context.publicReference)}</strong> (${escapeHtml(context.productKey)}, ${escapeHtml(context.countryCode)}).</p>`,
        `<p><a href="${escapeHtml(this.brokerLink())}">Consulter le lead dans votre back-office</a></p>`,
        "<p>Les informations consenties ne sont pas reprises dans cet email: leur consultation est tracee et limitee a votre cabinet.</p>",
        "<p>Notification operationnelle. Aucun engagement contractuel ne resulte de ce message.</p>",
        `<p>${escapeHtml(PLATFORM_DISCLAIMER)}</p>`
      ]),
      purpose: "quote_broker_lead"
    });
  }

  /** Spec 054 R10: FR `/demandes-de-devis/{ref}`, EN `/en/quote-requests/{ref}`, token in the query. */
  trackingLink(publicReference: string, locale: VisitorEmailLocale = "fr", token?: string): string {
    const base = (this.options.publicAppUrl ?? process.env.PUBLIC_APP_URL ?? "http://127.0.0.1:3601").replace(/\/$/, "");
    const query = token ? `?token=${encodeURIComponent(token)}` : "";
    return `${base}${TRACKING_PATH[locale]}${encodeURIComponent(publicReference)}${query}`;
  }

  private frenchCopy(context: VisitorStepEmailContext): StepCopy {
    const scope = `${context.productKey} (${context.countryCode})`;
    const broker = context.partnerName;
    switch (context.step) {
      case "received":
        return {
          subject: `Votre demande de devis ${context.publicReference} est bien recue`,
          lines: [
            `Nous avons bien recu votre demande de devis ${scope}.`,
            "Nous recherchons un courtier partenaire eligible pour ce pays et ce produit. Vous serez prevenu par e-mail a chaque etape.",
            ""
          ]
        };
      case "in_review":
        return {
          subject: `Votre demande de devis ${context.publicReference} est en cours de verification`,
          lines: [
            `Nous avons bien recu votre demande de devis ${scope}.`,
            "Elle est en cours de verification par notre equipe, avant toute transmission a un courtier partenaire.",
            "Vous recevrez un nouveau message lorsque le courtier partenaire sera designe.",
            ""
          ]
        };
      case "transmitted":
        return {
          subject: `Votre demande de devis ${context.publicReference} a ete transmise`,
          lines: [
            broker
              ? `Votre demande de devis ${scope} a ete transmise a ${broker}, courtier partenaire eligible pour ce pays et ce produit.`
              : `Votre demande de devis ${scope} a ete transmise a un courtier partenaire eligible pour ce pays et ce produit.`,
            "Le courtier partenaire etudie votre demande et peut vous contacter pour la preciser.",
            ""
          ]
        };
      case "accepted":
        return {
          subject: `Votre demande de devis ${context.publicReference} est prise en charge`,
          lines: [
            `${broker ?? "Le courtier partenaire"} a pris en charge votre demande de devis ${scope}.`,
            "Le courtier partenaire peut vous contacter pour preciser votre besoin.",
            ""
          ]
        };
      case "reassigned":
        return {
          subject: `Votre demande de devis ${context.publicReference} a ete reaffectee`,
          lines: [
            broker
              ? `Votre demande de devis ${scope} a ete reaffectee a ${broker}, courtier partenaire eligible pour ce pays et ce produit.`
              : `Votre demande de devis ${scope} a ete reaffectee a un autre courtier partenaire eligible pour ce pays et ce produit.`,
            "Le courtier precedent n'a plus acces a votre demande.",
            ""
          ]
        };
      case "closed":
        return {
          subject: `Votre demande de devis ${context.publicReference} est cloturee`,
          lines: [
            broker
              ? `Le suivi de votre demande de devis ${scope} par ${broker} est cloture.`
              : `Le suivi de votre demande de devis ${scope} est cloture.`,
            "Si vous avez encore besoin d'un devis, vous pouvez deposer une nouvelle demande sur AssurMatch.",
            ""
          ]
        };
      case "not_transmitted":
        return {
          subject: `Votre demande de devis ${context.publicReference}`,
          lines: [
            `Nous avons bien recu votre demande de devis ${scope}.`,
            "Votre demande a bien ete enregistree. Aucun courtier partenaire eligible n'est disponible pour ce pays et ce produit pour le moment: elle n'a ete communiquee a aucun courtier.",
            "Vous pouvez comparer d'autres offres indicatives ou deposer une nouvelle demande plus tard.",
            ""
          ]
        };
      case "consent_withdrawn":
        return {
          subject: `Retrait de votre consentement confirme (${context.publicReference})`,
          lines: [
            `Nous confirmons le retrait de votre consentement pour votre demande de devis ${scope}.`,
            "La demande est cloturee et chaque courtier partenaire concerne a ete informe qu'il ne doit plus la traiter.",
            ""
          ]
        };
      case "tracking_link":
        return {
          subject: `Votre lien de suivi (${context.publicReference})`,
          lines: [
            "Vous avez demande un nouveau lien pour suivre votre demande de devis.",
            "Si vous n'etes pas a l'origine de cette demande, ignorez simplement ce message.",
            ""
          ]
        };
    }
  }

  private englishCopy(context: VisitorStepEmailContext): StepCopy {
    const scope = `${context.productKey} (${context.countryCode})`;
    const broker = context.partnerName;
    switch (context.step) {
      case "received":
        return {
          subject: `Your quote request ${context.publicReference} has been received`,
          lines: [
            `We have received your ${scope} quote request.`,
            "We are looking for an eligible partner broker for this country and product. You will be told by e-mail at each step.",
            ""
          ]
        };
      case "in_review":
        return {
          subject: `Your quote request ${context.publicReference} is being checked`,
          lines: [
            `We have received your ${scope} quote request.`,
            "Our team is checking it before it goes to any partner broker.",
            "You will receive another message once the partner broker has been designated.",
            ""
          ]
        };
      case "transmitted":
        return {
          subject: `Your quote request ${context.publicReference} has been forwarded`,
          lines: [
            broker
              ? `Your ${scope} quote request has been forwarded to ${broker}, an eligible partner broker for this country and product.`
              : `Your ${scope} quote request has been forwarded to an eligible partner broker for this country and product.`,
            "The partner broker reviews your request and may contact you to clarify it.",
            ""
          ]
        };
      case "accepted":
        return {
          subject: `Your quote request ${context.publicReference} has been taken on`,
          lines: [
            `${broker ?? "The partner broker"} has taken on your ${scope} quote request.`,
            "The partner broker may contact you to clarify your needs.",
            ""
          ]
        };
      case "reassigned":
        return {
          subject: `Your quote request ${context.publicReference} has been reassigned`,
          lines: [
            broker
              ? `Your ${scope} quote request has been reassigned to ${broker}, an eligible partner broker for this country and product.`
              : `Your ${scope} quote request has been reassigned to another eligible partner broker for this country and product.`,
            "The previous broker no longer has access to your request.",
            ""
          ]
        };
      case "closed":
        return {
          subject: `Your quote request ${context.publicReference} is closed`,
          lines: [
            broker
              ? `${broker} has closed the follow-up of your ${scope} quote request.`
              : `The follow-up of your ${scope} quote request is closed.`,
            "If you still need a quote, you can submit a new request on AssurMatch.",
            ""
          ]
        };
      case "not_transmitted":
        return {
          subject: `Your quote request ${context.publicReference}`,
          lines: [
            `We have received your ${scope} quote request.`,
            "Your request has been recorded. No eligible partner broker is available for this country and product at the moment: it has not been shared with any broker.",
            "You can compare other indicative offers or submit a new request later.",
            ""
          ]
        };
      case "consent_withdrawn":
        return {
          subject: `Withdrawal of your consent confirmed (${context.publicReference})`,
          lines: [
            `We confirm the withdrawal of your consent for your ${scope} quote request.`,
            "The request is closed and every partner broker concerned has been told to stop handling it.",
            ""
          ]
        };
      case "tracking_link":
        return {
          subject: `Your tracking link (${context.publicReference})`,
          lines: [
            "You asked for a new link to follow your quote request.",
            "If you did not make this request, simply ignore this message.",
            ""
          ]
        };
    }
  }

  /**
   * A regulated word in an outbound email is a compliance incident, not a formatting bug, so the
   * guardrail runs on the rendered message rather than on the template source.
   */
  private assertSafe(payload: AuthEmailPayload): AuthEmailPayload {
    const rendered = [payload.subject, payload.body, payload.html ?? ""];
    const english = rendered.join("\n").toLowerCase();
    const wording = [
      ...rendered.flatMap((text) => findForbiddenWording(text)),
      ...FORBIDDEN_ENGLISH_WORDING.filter((phrase) => english.includes(phrase))
    ];
    if (wording.length > 0) throw new QuoteEmailTemplateNotSafeError([...new Set(wording)]);
    return payload;
  }

  private brokerLink(): string {
    const base = (this.options.brokerAppUrl ?? process.env.BROKER_APP_URL ?? "http://127.0.0.1:3603").replace(/\/$/, "");
    return `${base}/leads`;
  }

  private html(paragraphs: string[]): string {
    return ["<!doctype html>", "<html>", "<body>", ...paragraphs, "</body>", "</html>"].join("");
  }
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function escapeHtml(value: string | undefined): string {
  if (!value) return "";
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
