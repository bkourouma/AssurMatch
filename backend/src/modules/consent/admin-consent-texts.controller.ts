import {
  adminConsentTextCreateSchema,
  adminConsentTextListQuerySchema,
  type AdminConsentTextListQuery,
  type AdminConsentTextView,
  type ConsentTextTemplate
} from "../../../../packages/shared/contracts/compliance.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { CatalogAccess } from "../catalog/catalog-access";
import { catalogNotFound } from "../catalog/catalog-errors";
import type { ActorContext } from "../common/types";
import { ConsentTextAuditActions, findSupersedingText, type ConsentService, type ConsentText } from "./consent.module";

/** Display names used to resolve the preview; both are optional so the controller works without a catalogue. */
export interface ConsentTextPreviewLookups {
  countryName?: (countryId: string) => Promise<string | undefined>;
  productName?: (productId: string) => Promise<string | undefined>;
  /** Whether the country exists; a text for an unknown country is refused. */
  countryExists?: (countryId: string) => Promise<boolean>;
}

const SAMPLE_CONTACT_FIELDS: Record<string, string[]> = {
  fr: ["nom", "e-mail", "téléphone"],
  en: ["name", "email", "phone"]
};
const SAMPLE_PRODUCT_NAME: Record<string, string> = { fr: "tous les produits", en: "all products" };

/**
 * Spec 050 US3: consent text administration. The matrix grants `consent:*` to `compliance_admin`
 * and `super_admin` only; every refusal is audited. The hash is computed by `ConsentService`.
 */
export class AdminConsentTextsController {
  private readonly access: CatalogAccess;

  constructor(private readonly consent: ConsentService, audit: AuditLogWriter = new AuditLogWriter(), private readonly lookups: ConsentTextPreviewLookups = {}) {
    this.access = new CatalogAccess(audit);
  }

  async list(actor: ActorContext, query: AdminConsentTextListQuery = {}): Promise<AdminConsentTextView[]> {
    this.requireRead(actor, "list");
    const filters = adminConsentTextListQuerySchema.parse(query);
    const texts = await this.consent.listTexts();
    return texts
      .filter((text) => !filters.countryId || text.countryId === filters.countryId)
      .filter((text) => !filters.productId || text.productId === filters.productId)
      .filter((text) => !filters.purpose || text.purpose === filters.purpose)
      .filter((text) => !filters.language || text.language === filters.language)
      .filter((text) => !filters.status || text.status === filters.status)
      .map((text) => toAdminConsentTextView(text, texts));
  }

  templates(actor: ActorContext): ConsentTextTemplate[] {
    this.requireRead(actor, "templates");
    return this.consent.templates();
  }

  async detail(actor: ActorContext, id: string, preview = false): Promise<AdminConsentTextView> {
    this.requireRead(actor, id);
    const texts = await this.consent.listTexts();
    const text = texts.find((candidate) => candidate.id === id);
    if (!text) throw catalogNotFound(`Consent text ${id} not found`);
    const view = toAdminConsentTextView(text, texts);
    if (!preview) return view;
    const resolved = this.consent.resolveContent(text, await this.sampleVariables(text));
    return resolved === null ? view : { ...view, preview: resolved };
  }

  async create(actor: ActorContext, input: unknown): Promise<AdminConsentTextView> {
    const { reason, ...parsed } = adminConsentTextCreateSchema.parse(input);
    this.access.require(actor, this.access.can(actor, "consent:create"), {
      action: ConsentTextAuditActions.createRefused,
      targetType: "ConsentText",
      targetId: `${parsed.purpose}:${parsed.countryId}:${parsed.language}:${parsed.version}`,
      scope: { countryId: parsed.countryId, ...(parsed.productId ? { productId: parsed.productId } : {}) },
      refusal: "rbac_denied",
      requestReason: reason
    });
    if (this.lookups.countryExists && !(await this.lookups.countryExists(parsed.countryId))) {
      throw catalogNotFound(`Country ${parsed.countryId} not found`);
    }
    // A text is always born a draft: publication is the separate, controlled act.
    const created = await this.consent.createText({ ...parsed, status: "draft", contentHash: "computed-by-server" }, actor, reason);
    return toAdminConsentTextView(created, await this.consent.listTexts());
  }

  async publish(actor: ActorContext, id: string, reason: string): Promise<AdminConsentTextView> {
    await this.requireApprove(actor, id, reason);
    const published = await this.consent.publishText(id, actor, { requireContent: true, reason });
    return toAdminConsentTextView(published, await this.consent.listTexts());
  }

  async retire(actor: ActorContext, id: string, reason: string): Promise<AdminConsentTextView> {
    await this.requireApprove(actor, id, reason);
    const retired = await this.consent.retireText(id, actor, reason);
    return toAdminConsentTextView(retired, await this.consent.listTexts());
  }

  private requireRead(actor: ActorContext, targetId: string): void {
    this.access.require(actor, this.access.can(actor, "consent:read"), {
      action: "consent_text.read_refused", targetType: "ConsentText", targetId, refusal: "rbac_denied"
    });
  }

  private async requireApprove(actor: ActorContext, id: string, reason: string): Promise<ConsentText> {
    const text = await this.consent.findText(id);
    this.access.require(actor, this.access.can(actor, "consent:approve"), {
      action: ConsentTextAuditActions.publicationRefused,
      targetType: "ConsentText",
      targetId: id,
      scope: text ? { countryId: text.countryId, ...(text.productId ? { productId: text.productId } : {}) } : {},
      refusal: "rbac_denied",
      requestReason: reason
    });
    if (!text) throw catalogNotFound(`Consent text ${id} not found`);
    return text;
  }

  private async sampleVariables(text: ConsentText) {
    const language = text.language;
    const countryName = await this.lookups.countryName?.(text.countryId);
    const productName = text.productId ? await this.lookups.productName?.(text.productId) : undefined;
    return {
      countryName: countryName ?? text.countryId,
      productName: productName ?? SAMPLE_PRODUCT_NAME[language] ?? SAMPLE_PRODUCT_NAME.fr ?? "",
      contactFields: SAMPLE_CONTACT_FIELDS[language] ?? SAMPLE_CONTACT_FIELDS.fr ?? []
    };
  }
}

function iso(value: Date | string | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function toAdminConsentTextView(text: ConsentText, all: ConsentText[]): AdminConsentTextView {
  return {
    id: text.id,
    purpose: text.purpose,
    countryId: text.countryId,
    productId: text.productId ?? null,
    channel: text.channel,
    recipientCategory: text.recipientCategory,
    language: text.language,
    version: text.version,
    status: text.status ?? "draft",
    contentHash: text.contentHash,
    content: text.content ?? null,
    publishedAt: iso(text.publishedAt),
    retiredAt: iso(text.retiredAt),
    supersededBy: findSupersedingText(text, all)?.id ?? null,
    createdAt: iso(text.createdAt) ?? new Date(0).toISOString(),
    updatedAt: iso(text.updatedAt) ?? new Date(0).toISOString()
  };
}
