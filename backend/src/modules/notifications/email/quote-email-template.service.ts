import { findForbiddenWording } from "../../../../../packages/shared/contracts/content-safety";
import type { AuthEmailPayload, EmailPurpose } from "./email-delivery.service";

export interface VisitorQuoteEmailContext {
  to: string;
  displayName?: string;
  publicReference: string;
  countryCode: string;
  productKey: string;
  routed: boolean;
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

export class QuoteEmailTemplateNotSafeError extends Error {
  constructor(public readonly wording: string[]) {
    super(`Quote email refused: invalid public wording in the rendered message (${wording.join(", ")})`);
    this.name = "QuoteEmailTemplateNotSafeError";
  }
}

export class QuoteEmailTemplateService {
  constructor(private readonly options: TemplateOptions = {}) {}

  visitor(context: VisitorQuoteEmailContext): AuthEmailPayload {
    const purpose: EmailPurpose = context.routed ? "quote_visitor_confirmation" : "quote_visitor_non_routable";
    const greeting = context.displayName ? `Bonjour ${context.displayName},` : "Bonjour,";
    const outcome = context.routed
      ? "Votre demande a ete transmise a un courtier partenaire eligible pour ce pays et ce produit."
      : "Votre demande a bien ete enregistree. Aucun courtier partenaire eligible n'est disponible pour ce pays et ce produit pour le moment.";
    const lines = [
      greeting,
      "",
      `Nous avons bien recu votre demande de devis ${context.productKey} (${context.countryCode}).`,
      `Reference de votre demande: ${context.publicReference}`,
      "",
      outcome,
      // No broker identity: the platform does not disclose who was selected before first contact.
      `Suivre votre demande: ${this.trackingLink(context.publicReference)}`,
      "",
      "Aucun montant, aucune garantie et aucun engagement contractuel ne resulte de ce message.",
      PLATFORM_DISCLAIMER
    ];
    return this.assertSafe({
      to: context.to,
      subject: `Votre demande de devis ${context.publicReference}`,
      body: lines.join("\n"),
      html: this.html([
        `<p>${escapeHtml(greeting)}</p>`,
        `<p>Nous avons bien recu votre demande de devis ${escapeHtml(context.productKey)} (${escapeHtml(context.countryCode)}).</p>`,
        `<p>Reference de votre demande: <strong>${escapeHtml(context.publicReference)}</strong></p>`,
        `<p>${escapeHtml(outcome)}</p>`,
        `<p><a href="${escapeHtml(this.trackingLink(context.publicReference))}">Suivre votre demande</a></p>`,
        "<p>Aucun montant, aucune garantie et aucun engagement contractuel ne resulte de ce message.</p>",
        `<p>${escapeHtml(PLATFORM_DISCLAIMER)}</p>`
      ]),
      purpose
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

  /**
   * A regulated word in an outbound email is a compliance incident, not a formatting bug, so the
   * guardrail runs on the rendered message rather than on the template source.
   */
  private assertSafe(payload: AuthEmailPayload): AuthEmailPayload {
    const wording = [
      ...findForbiddenWording(payload.subject),
      ...findForbiddenWording(payload.body),
      ...(payload.html ? findForbiddenWording(payload.html) : [])
    ];
    if (wording.length > 0) throw new QuoteEmailTemplateNotSafeError([...new Set(wording)]);
    return payload;
  }

  private trackingLink(publicReference: string): string {
    const base = (this.options.publicAppUrl ?? process.env.PUBLIC_APP_URL ?? "http://127.0.0.1:3601").replace(/\/$/, "");
    return `${base}/quote-requests/${encodeURIComponent(publicReference)}`;
  }

  private brokerLink(): string {
    const base = (this.options.brokerAppUrl ?? process.env.BROKER_APP_URL ?? "http://127.0.0.1:3603").replace(/\/$/, "");
    return `${base}/leads`;
  }

  private html(paragraphs: string[]): string {
    return ["<!doctype html>", "<html>", "<body>", ...paragraphs, "</body>", "</html>"].join("");
  }
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
