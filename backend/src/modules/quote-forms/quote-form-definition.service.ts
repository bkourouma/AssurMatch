import {
  adminQuoteFormDefinitionSchema,
  type AdminQuoteFormDefinitionDto,
  type PublicQuoteFormResponse,
  type QuoteFormFieldDto
} from "../../../../packages/shared/contracts/quote.contracts";
import { NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { findForbiddenWording } from "../../../../packages/shared/contracts/content-safety";
import { resolveConsentContent } from "../../../../packages/shared/contracts/consent-content";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
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
  purpose: string;
  recipientCategory: string;
  status: string;
  /**
   * Spec 050 T007: scope and content of the text. Optional so lightweight test references still
   * load; the runtime adapter always fills them, and publication checks each one that is present.
   */
  language?: string;
  countryId?: string;
  productId?: string | null;
  channel?: string;
  content?: string | null;
  publishedAt?: Date | string;
  createdAt?: Date | string;
}

/** Spec 050 R5/R8: catalogue data the public form needs (names for the consent variables, phone rule). */
export interface QuoteFormContext {
  countryName?: string;
  productName?: string;
  phoneRule?: { dialCode: string; nationalLengths: number[] } | null;
}

export interface QuoteFormCreateOptions {
  /** Spec 050 R7: generic fields are added by default; `false` is reserved to the legacy unit tests. */
  includeGenericFields?: boolean;
}

type GenericFieldLabels = Record<"fr" | "en", string>;
interface GenericFieldSpec {
  key: string;
  type: QuoteFormFieldDto["type"];
  required: boolean;
  sensitivity: QuoteFormFieldDto["sensitivity"];
  labels: GenericFieldLabels;
  options?: string[];
}

/** Spec 050 R7 / FR-015: fields every quote form collects, labelled in the form language. */
const GENERIC_FIELDS: GenericFieldSpec[] = [
  { key: "city", type: "text", required: true, sensitivity: "personal", labels: { fr: "Ville", en: "City" } },
  { key: "contact_preference", type: "select", required: true, sensitivity: "personal", labels: { fr: "Moyen de contact préféré", en: "Preferred contact method" }, options: ["phone", "email", "whatsapp"] },
  { key: "desired_timing", type: "select", required: false, sensitivity: "public", labels: { fr: "Délai souhaité", en: "Desired timing" }, options: ["immediate", "within_month", "within_quarter"] },
  { key: "budget", type: "number", required: false, sensitivity: "public", labels: { fr: "Budget indicatif", en: "Indicative budget" } },
  { key: "preferred_language", type: "select", required: false, sensitivity: "public", labels: { fr: "Langue préférée", en: "Preferred language" }, options: ["fr", "en"] },
  { key: "source", type: "select", required: false, sensitivity: "public", labels: { fr: "Comment nous avez-vous connus ?", en: "How did you hear about us?" }, options: ["search", "social", "word_of_mouth", "partner", "other"] }
];

/** Contact data collected outside the definition (name, email, phone), named in the consent text. */
const CONTACT_FIELD_LABELS: Record<"fr" | "en", string[]> = {
  fr: ["nom", "e-mail", "téléphone"],
  en: ["name", "email", "phone"]
};

function formLanguage(language: string): "fr" | "en" {
  return language === "en" ? "en" : "fr";
}

export function withGenericFields(fields: QuoteFormFieldDto[], language: string): QuoteFormFieldDto[] {
  const present = new Set(fields.map((field) => field.key));
  const lang = formLanguage(language);
  const generic = GENERIC_FIELDS.filter((spec) => !present.has(spec.key)).map((spec): QuoteFormFieldDto => ({
    key: spec.key,
    label: spec.labels[lang],
    type: spec.type,
    required: spec.required,
    sensitivity: spec.sensitivity,
    ...(spec.options ? { options: [...spec.options] } : {})
  }));
  return [...fields, ...generic];
}

function time(value: Date | string | undefined): number {
  return value ? new Date(value).getTime() : 0;
}

/** Spec 050 FR-019: a more recent published version exists for the same purpose, scope, channel and language. */
export function isConsentSuperseded(reference: ConsentTextReference | undefined, all: ConsentTextReference[]): boolean {
  if (!reference || reference.language === undefined || reference.countryId === undefined) return false;
  const since = time(reference.publishedAt ?? reference.createdAt);
  return all.some((candidate) =>
    candidate.id !== reference.id &&
    candidate.status === "published" &&
    candidate.purpose === reference.purpose &&
    candidate.countryId === reference.countryId &&
    (candidate.productId ?? null) === (reference.productId ?? null) &&
    (candidate.channel ?? null) === (reference.channel ?? null) &&
    candidate.language === reference.language &&
    time(candidate.publishedAt) > since
  );
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
    private readonly sensitiveDataEnabled: (productId: string) => boolean = () => false,
    private readonly formContext: (countryId: string, productId: string) => Promise<QuoteFormContext> | QuoteFormContext = () => ({})
  ) {
    assertRuntimeRepository(this.repository.mode, "QuoteFormDefinitionsRepository");
  }

  async create(input: AdminQuoteFormDefinitionDto, actor: ActorContext, options: QuoteFormCreateOptions = {}): Promise<QuoteFormDefinitionRecord> {
    const parsed = adminQuoteFormDefinitionSchema.parse(input);
    const fields = options.includeGenericFields === false ? parsed.fields : withGenericFields(parsed.fields, parsed.language);
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
      fields,
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

  /**
   * Spec 050 R6: the form of the requested language only. There is no silent fallback any more: a
   * product whose forms exist in other languages answers 404 `QUOTE_FORM_LANGUAGE_UNAVAILABLE` with
   * the languages that do exist. The consent content is served with its variables resolved.
   */
  /**
   * Spec 052 R8: `options.brokerName` (broker of an eligible selected offer) resolves `{{brokerName}}`
   * and is returned as `offerPartnerName`; the template hash is unchanged.
   */
  async publicForm(countryId: string, productId: string, language = "fr", actor?: ActorContext, options: { brokerName?: string | undefined } = {}): Promise<PublicQuoteFormResponse> {
    const published = await this.repository.findPublished(countryId, productId);
    const form = published.find((candidate) => candidate.language === language);
    if (!form) {
      const availableLanguages = [...new Set(published.map((candidate) => candidate.language))].sort();
      this.audit.write({
        actor,
        action: QuoteAuditActions.quoteFormRefused,
        targetType: "QuoteFormDefinition",
        targetId: `${countryId}:${productId}`,
        scope: { countryId, productId },
        result: "refused",
        reason: availableLanguages.length ? "language_unavailable" : "published_form_missing",
        context: { language, availableLanguages }
      });
      if (!availableLanguages.length) throw new Error("Quote form is not available");
      throw new NotFoundException({
        code: ErrorCodes.QUOTE_FORM_LANGUAGE_UNAVAILABLE,
        message: `Quote form not found in language ${language}`,
        availableLanguages
      });
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
    const context = await this.formContext(countryId, productId);
    this.audit.write({
      actor,
      action: QuoteAuditActions.quoteFormExposed,
      targetType: "QuoteFormDefinition",
      targetId: form.id,
      scope: { countryId, productId },
      result: "success",
      context: { version: form.version, language: form.language }
    });
    const content = consent.content
      ? resolveConsentContent(consent.content, form.language, {
        ...(options.brokerName ? { brokerName: options.brokerName } : {}),
        ...(context.countryName ? { countryName: context.countryName } : {}),
        ...(context.productName ? { productName: context.productName } : {}),
        contactFields: this.contactFieldLabels(form)
      })
      : undefined;
    return {
      formDefinitionId: form.id,
      version: form.version,
      language: form.language,
      phoneRule: context.phoneRule ?? null,
      fields: form.fields,
      consent: {
        consentTextId: consent.id,
        version: consent.version,
        language: consent.language ?? form.language,
        contentHash: consent.contentHash,
        ...(content ? { content } : {}),
        purpose: "lead_transmission",
        recipientCategory: consent.recipientCategory
      },
      ...(options.brokerName ? { offerPartnerName: options.brokerName } : {})
    };
  }

  /** Spec 050 FR-019: ids of the forms whose consent text has a more recent published version. */
  async supersededConsentFormIds(forms: QuoteFormDefinitionRecord[]): Promise<Set<string>> {
    const texts = await this.consentTexts();
    const byId = new Map(texts.map((text) => [text.id, text]));
    return new Set(forms.filter((form) => isConsentSuperseded(byId.get(form.consentTextId), texts)).map((form) => form.id));
  }

  private contactFieldLabels(form: QuoteFormDefinitionRecord): string[] {
    const base = CONTACT_FIELD_LABELS[formLanguage(form.language)];
    const personal = form.fields
      .filter((field) => field.sensitivity !== "public" || field.type === "email" || field.type === "phone")
      .map((field) => field.label.toLocaleLowerCase(form.language === "en" ? "en-US" : "fr-FR"));
    return [...new Set([...base, ...personal])];
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
    // Spec 050 R6 / FR-020: the consent shown must be the one of this form's language and scope.
    const mismatch = consent.language !== undefined && consent.language !== form.language
      ? "language"
      : consent.countryId !== undefined && consent.countryId !== form.countryId
        ? "country"
        : consent.productId && consent.productId !== form.productId
          ? "product"
          : undefined;
    if (mismatch) {
      this.refusePublication(form, actor, `consent_text_${mismatch}_mismatch`, { consentTextId: consent.id });
      throw new UnprocessableEntityException({
        code: ErrorCodes.CONSENT_TEXT_INVALID,
        message: `Quote form publication refused: the consent text ${mismatch} does not match the form`
      });
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
