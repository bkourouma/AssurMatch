import {
  adminQuoteFormDefinitionSchema,
  type AdminQuoteFormDefinitionDto,
  type PublicQuoteFormResponse,
  type QuoteFormFieldDto
} from "../../../../packages/shared/contracts/quote.contracts";
import { findForbiddenWording } from "../../../../packages/shared/contracts/content-safety";
import { roleHasPermission, type AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import type { ActorContext } from "../common/types";
import {
  MemoryQuoteFormDefinitionsRepository,
  type QuoteFormDefinitionsRepository
} from "./quote-form-definitions.repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";

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
  /** Present on the table, unused by the current contract; carried through so nothing is dropped. */
  validationSchema?: unknown;
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

/**
 * Spec 043 D1. The role matrix already encodes this decision and is left untouched:
 * `compliance_admin` holds `quote_form_definitions:*`, `content_admin` only `:read`, and no other
 * admin role holds anything. Authoring and publishing therefore both require the write permissions,
 * which only `super_admin` and `compliance_admin` have - publishing decides what personal data the
 * platform collects from the public, so it is a data-protection act rather than catalogue work.
 */
const CREATE_PERMISSION = "quote_form_definitions:create";
const PUBLISH_PERMISSION = "quote_form_definitions:publish";

export const QuoteFormAuditActions = {
  created: "quote_form.created",
  published: "quote_form.published",
  retired: "quote_form.retired",
  publicationRefused: "quote_form.publication_refused"
} as const;

export class QuoteFormDefinitionService {
  constructor(
    private readonly audit: AuditLogWriter,
    private readonly consentTexts: () => ConsentTextReference[] | Promise<ConsentTextReference[]> = () => [],
    private readonly repository: QuoteFormDefinitionsRepository = new MemoryQuoteFormDefinitionsRepository(),
    private readonly sensitiveDataEnabled: (productId: string) => boolean = () => false
  ) {
    assertRuntimeRepository(this.repository.mode, "QuoteFormDefinitionsRepository");
  }

  async create(input: AdminQuoteFormDefinitionDto, actor: ActorContext): Promise<QuoteFormDefinitionRecord> {
    const parsed = adminQuoteFormDefinitionSchema.parse(input);
    this.assertAuthoring(actor);
    const now = new Date();
    const form: QuoteFormDefinitionRecord = {
      id: parsed.id ?? crypto.randomUUID(),
      countryId: parsed.countryId,
      productId: parsed.productId,
      language: parsed.language,
      version: parsed.version,
      // A definition is always born a draft: publication is a separate, controlled act.
      status: "draft",
      fields: parsed.fields,
      consentTextId: parsed.consentTextId,
      ...(parsed.dataMinimizationNotes ? { dataMinimizationNotes: parsed.dataMinimizationNotes } : {}),
      createdAt: now,
      updatedAt: now,
      ...(actor.actorId ? { createdById: actor.actorId } : {})
    };
    const created = await this.repository.create(form);
    this.audit.write({
      actor,
      action: QuoteFormAuditActions.created,
      targetType: "QuoteFormDefinition",
      targetId: created.id,
      scope: { countryId: created.countryId, productId: created.productId },
      result: "success",
      context: { version: created.version, language: created.language, fields: created.fields.length }
    });
    if (parsed.status === "published") await this.publish(created.id, actor);
    return this.require(created.id);
  }

  async publish(id: string, actor: ActorContext): Promise<QuoteFormDefinitionRecord> {
    const form = await this.require(id);
    await this.assertPublishable(form, actor);
    const published = await this.repository.publishExclusively(
      form.id,
      { countryId: form.countryId, productId: form.productId, language: form.language },
      new Date()
    );
    this.audit.write({
      actor,
      action: QuoteFormAuditActions.published,
      targetType: "QuoteFormDefinition",
      targetId: published.id,
      scope: { countryId: published.countryId, productId: published.productId },
      result: "success",
      context: { version: published.version, language: published.language, consentTextId: published.consentTextId }
    });
    return published;
  }

  async retire(id: string, actor: ActorContext): Promise<QuoteFormDefinitionRecord> {
    const form = await this.require(id);
    this.assertPublishing(actor);
    const now = new Date();
    const retired = await this.repository.update(form.id, { status: "retired", retiredAt: now, updatedAt: now });
    this.audit.write({
      actor,
      action: QuoteFormAuditActions.retired,
      targetType: "QuoteFormDefinition",
      targetId: retired.id,
      scope: { countryId: retired.countryId, productId: retired.productId },
      result: "success",
      context: { version: retired.version, language: retired.language }
    });
    return retired;
  }

  async publicForm(countryId: string, productId: string, language = "fr", actor?: ActorContext): Promise<PublicQuoteFormResponse> {
    const published = await this.repository.findPublished(countryId, productId);
    const form = published.find((candidate) => candidate.language === language) ?? published[0];
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
    const consent = (await this.consentTexts()).find((text) => text.id === form.consentTextId && text.status === "published" && text.purpose === "lead_transmission");
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

  async list(): Promise<QuoteFormDefinitionRecord[]> {
    return this.repository.list();
  }

  async require(id: string): Promise<QuoteFormDefinitionRecord> {
    const form = await this.repository.find(id);
    if (!form) throw new Error(`Quote form ${id} not found`);
    return form;
  }

  /**
   * Publication invariants, checked in order. Error wording is chosen for `error-response.filter.ts`,
   * whose regexes run in a fixed order: "invalid" maps to 400 before "denied" maps to 403, and
   * "consent"/"disabled" map to 422 only if no earlier pattern matched. Changing a word here changes
   * the HTTP status, so each message is deliberate rather than descriptive.
   */
  private async assertPublishable(form: QuoteFormDefinitionRecord, actor: ActorContext): Promise<void> {
    const consent = (await this.consentTexts()).find((text) => text.id === form.consentTextId);
    if (!consent || consent.status !== "published" || consent.purpose !== "lead_transmission") {
      this.refusePublication(form, actor, "published_consent_text_missing");
      throw new Error("Quote form publication refused: the consent text is not published");
    }
    const wording = form.fields.flatMap((field) => findForbiddenWording(field.label));
    if (wording.length > 0) {
      this.refusePublication(form, actor, "forbidden_public_wording", { wording });
      throw new Error("Quote form publication refused: invalid public wording in field labels");
    }
    if (form.fields.some((field) => field.sensitivity === "sensitive") && !this.sensitiveDataEnabled(form.productId)) {
      this.refusePublication(form, actor, "sensitive_fields_not_enabled");
      throw new Error("Quote form publication refused: sensitive fields are disabled for this product");
    }
    this.assertPublishing(actor, form);
  }

  private assertAuthoring(actor: ActorContext): void {
    this.assertPermission(actor, CREATE_PERMISSION);
  }

  private assertPublishing(actor: ActorContext, form?: QuoteFormDefinitionRecord): void {
    this.assertPermission(actor, PUBLISH_PERMISSION, form);
  }

  private assertPermission(actor: ActorContext, permission: string, form?: QuoteFormDefinitionRecord): void {
    if (actor.mfaVerified !== true) {
      if (form) this.refusePublication(form, actor, "mfa_required");
      throw new Error("Quote form administration denied: mfa_required");
    }
    if (!(actor.roles ?? []).some((role) => roleHasPermission(role as AssurMatchRole, permission))) {
      if (form) this.refusePublication(form, actor, "forbidden_role");
      throw new Error("Quote form administration denied: forbidden_role");
    }
  }

  private refusePublication(form: QuoteFormDefinitionRecord, actor: ActorContext, reason: string, context: Record<string, unknown> = {}): void {
    this.audit.write({
      actor,
      action: QuoteFormAuditActions.publicationRefused,
      targetType: "QuoteFormDefinition",
      targetId: form.id,
      scope: { countryId: form.countryId, productId: form.productId },
      result: "refused",
      reason,
      context: { version: form.version, language: form.language, ...context }
    });
  }
}
