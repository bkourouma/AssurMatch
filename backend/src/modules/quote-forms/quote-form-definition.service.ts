import {
  adminQuoteFormDefinitionSchema,
  type AdminQuoteFormDefinitionDto,
  type PublicQuoteFormResponse,
  type QuoteFormFieldDto
} from "../../../../packages/shared/contracts/quote.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import type { ActorContext } from "../common/types";

export type QuoteFormStatus = "draft" | "published" | "suspended" | "retired";

export interface QuoteFormDefinitionRecord {
  id: string;
  countryId: string;
  productId: string;
  language: string;
  version: string;
  status: QuoteFormStatus;
  fields: QuoteFormFieldDto[];
  consentTextId: string;
  dataMinimizationNotes?: string;
  publishedAt?: Date;
  retiredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdById?: string;
}

export interface ConsentTextReference {
  id: string;
  version: string;
  contentHash: string;
  purpose: "lead_transmission";
  recipientCategory: string;
  status: string;
}

export class QuoteFormDefinitionService {
  private readonly forms: QuoteFormDefinitionRecord[] = [];

  constructor(private readonly audit: AuditLogWriter, private readonly consentTexts: () => ConsentTextReference[] = () => []) {}

  create(input: AdminQuoteFormDefinitionDto, actor: ActorContext): QuoteFormDefinitionRecord {
    const parsed = adminQuoteFormDefinitionSchema.parse(input);
    const now = new Date();
    const form: QuoteFormDefinitionRecord = {
      id: parsed.id ?? crypto.randomUUID(),
      countryId: parsed.countryId,
      productId: parsed.productId,
      language: parsed.language,
      version: parsed.version,
      status: parsed.status,
      fields: parsed.fields,
      consentTextId: parsed.consentTextId,
      ...(parsed.dataMinimizationNotes ? { dataMinimizationNotes: parsed.dataMinimizationNotes } : {}),
      createdAt: now,
      updatedAt: now,
      ...(actor.actorId ? { createdById: actor.actorId } : {})
    };
    if (form.status === "published") form.publishedAt = now;
    this.forms.push(form);
    return form;
  }

  publish(id: string, actor: ActorContext): QuoteFormDefinitionRecord {
    const form = this.require(id);
    form.status = "published";
    form.publishedAt = new Date();
    form.updatedAt = new Date();
    this.audit.write({
      actor,
      action: "quote_form.published",
      targetType: "QuoteFormDefinition",
      targetId: form.id,
      scope: { countryId: form.countryId, productId: form.productId },
      result: "success",
      context: { version: form.version }
    });
    return form;
  }

  publicForm(countryId: string, productId: string, language = "fr", actor?: ActorContext): PublicQuoteFormResponse {
    const form = this.forms
      .filter((candidate) => candidate.countryId === countryId && candidate.productId === productId && candidate.status === "published")
      .find((candidate) => candidate.language === language) ?? this.forms.find((candidate) => candidate.countryId === countryId && candidate.productId === productId && candidate.status === "published");
    if (!form) {
      this.audit.write({
        actor,
        action: QuoteAuditActions.quoteFormRefused,
        targetType: "QuoteFormDefinition",
        targetId: `${countryId}:${productId}`,
        scope: { countryId, productId },
        result: "refused",
        reason: "published_form_missing",
        context: {}
      });
      throw new Error("Quote form is not available");
    }
    const consent = this.consentTexts().find((text) => text.id === form.consentTextId && text.status === "published" && text.purpose === "lead_transmission");
    if (!consent) {
      this.audit.write({
        actor,
        action: QuoteAuditActions.quoteFormRefused,
        targetType: "ConsentText",
        targetId: form.consentTextId,
        scope: { countryId, productId },
        result: "refused",
        reason: "published_consent_text_missing",
        context: {}
      });
      throw new Error("Consent text is not available");
    }
    this.audit.write({
      actor,
      action: QuoteAuditActions.quoteFormExposed,
      targetType: "QuoteFormDefinition",
      targetId: form.id,
      scope: { countryId, productId },
      result: "success",
      context: { version: form.version }
    });
    return {
      formDefinitionId: form.id,
      version: form.version,
      fields: form.fields,
      consent: {
        consentTextId: consent.id,
        version: consent.version,
        contentHash: consent.contentHash,
        purpose: "lead_transmission",
        recipientCategory: consent.recipientCategory
      }
    };
  }

  list(): QuoteFormDefinitionRecord[] {
    return [...this.forms];
  }

  require(id: string): QuoteFormDefinitionRecord {
    const form = this.forms.find((candidate) => candidate.id === id);
    if (!form) throw new Error(`Quote form ${id} not found`);
    return form;
  }
}
