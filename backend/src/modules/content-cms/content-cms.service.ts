import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import type { ZodType } from "zod";
import {
  contentDecisionSchema,
  contentEntryCreateSchema,
  contentEntryListQuerySchema,
  contentEntryUpdateSchema,
  contentLegalSlugs,
  contentPayloadSchemas,
  contentReasonRequiredSchema,
  validateContentScope,
  type ContentCapabilitiesView,
  type ContentCmsLocale,
  type ContentEntryListResponse,
  type ContentEntryView,
  type ContentKind,
  type FaqPayload,
  type GlossaryPayload,
  type GuidePayload,
  type LegalOverridePayload,
  type PublicContentResponse
} from "../../../../packages/shared/contracts/content-cms.contracts";
import { findForbiddenEditorialWordingForLocale, findForbiddenWordingAnyLanguage } from "../../../../packages/shared/contracts/content-safety";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { ContentAuditActions } from "../audit-logs/content-audit-actions";
import { parseHttpInput } from "../common/http/zod-validation";
import type { ActorContext } from "../common/types";
import {
  OpenContentEntryExistsError,
  type ContentCmsRepository,
  type ContentEntryGuard,
  type ContentEntryKey,
  type ContentEntryPatch,
  type ContentEntryRecord
} from "./content-cms.repository";

export interface ContentCmsServiceDeps {
  audit: AuditLogWriter;
  repository: ContentCmsRepository;
  now?: () => Date;
}

/** One permission per kind of action; the role matrix decides who holds it. */
export type ContentPermission = "content:read" | "content:create" | "content:update" | "content:submit" | "content:approve";

/** A legal override has a legal consequence: only these roles may publish one. */
const LEGAL_APPROVER_ROLES = ["compliance_admin", "super_admin"] as const;

function holds(actor: ActorContext, permission: ContentPermission): boolean {
  return actor.roles.some((role) => roleHasPermission(role, permission));
}

function canApproveLegal(actor: ActorContext): boolean {
  return holds(actor, "content:approve") && actor.roles.some((role) => (LEGAL_APPROVER_ROLES as readonly string[]).includes(role));
}

function conflict(message: string): ConflictException {
  return new ConflictException({ code: ErrorCodes.CONFLICT, message });
}

function notFound(): NotFoundException {
  return new NotFoundException({ code: ErrorCodes.NOT_FOUND, message: "Content entry not found" });
}

function badRequest(message: string): BadRequestException {
  return new BadRequestException({ code: ErrorCodes.VALIDATION_FAILED, message });
}

function keyOf(entry: Pick<ContentEntryRecord, "kind" | "entryKey" | "locale" | "countryCode">): ContentEntryKey {
  return { kind: entry.kind, entryKey: entry.entryKey, locale: entry.locale, countryCode: entry.countryCode ?? null };
}

/** Every string of a payload, at any depth (object keys excluded). */
export function collectPayloadStrings(value: unknown, into: string[] = []): string[] {
  if (typeof value === "string") into.push(value);
  else if (Array.isArray(value)) for (const item of value) collectPayloadStrings(item, into);
  else if (value && typeof value === "object") for (const item of Object.values(value)) collectPayloadStrings(item, into);
  return into;
}

function labelFor(kind: ContentKind, entryKey: string, countryCode: string | null, payload: Record<string, unknown>): string {
  switch (kind) {
    case "faq": return (payload as unknown as FaqPayload).question;
    case "guide": return (payload as unknown as GuidePayload).title;
    case "glossary": return (payload as unknown as GlossaryPayload).term;
    case "legal_override": return `${entryKey} ${countryCode ?? ""}`.trim();
  }
}

function toView(entry: ContentEntryRecord): ContentEntryView {
  const iso = (date: Date | null) => (date ? date.toISOString() : null);
  return {
    id: entry.id,
    kind: entry.kind,
    entryKey: entry.entryKey,
    locale: entry.locale,
    countryCode: entry.countryCode ?? null,
    version: entry.version,
    status: entry.status,
    label: entry.label,
    payload: entry.payload,
    basedOnId: entry.basedOnId ?? null,
    createdById: entry.createdById ?? null,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    submittedById: entry.submittedById ?? null,
    submittedAt: iso(entry.submittedAt ?? null),
    decidedById: entry.decidedById ?? null,
    decidedAt: iso(entry.decidedAt ?? null),
    decisionNote: entry.decisionNote ?? null,
    publishedAt: iso(entry.publishedAt ?? null)
  };
}

/**
 * Lot 9 (spec 072): minimal CMS of the Content Admin role. Plain-text FAQ, guides, glossary and
 * per-country legal overrides go draft -> pending_review -> published -> archived. Publishing needs
 * a second actor (four eyes) and a clean editorial check; the public site only ever reads the
 * published rows. No AI takes part in writing, reviewing or publishing.
 *
 * The audit trail never carries the editorial text: identifiers, key, locale, country, version and
 * the statuses before/after only.
 */
export class ContentCmsService {
  constructor(private readonly deps: ContentCmsServiceDeps) {}

  // -------------------------------------------------------------------------------------------
  // Access
  // -------------------------------------------------------------------------------------------

  /** The HTTP layer calls this before parsing any path parameter or body; every refusal is audited. */
  authorize(actor: ActorContext, permission: ContentPermission, targetId = "content"): void {
    if (holds(actor, permission)) return;
    this.deps.audit.write({
      actor,
      action: ContentAuditActions.refused,
      targetType: "ContentEntry",
      targetId,
      result: "refused",
      reason: "forbidden_role",
      context: { permission }
    });
    throw new ForbiddenException({ code: ErrorCodes.RBAC_DENIED, message: "Access to the content administration is denied" });
  }

  capabilities(actor: ActorContext): ContentCapabilitiesView {
    this.authorize(actor, "content:read", "capabilities");
    return {
      canRead: true,
      canEdit: holds(actor, "content:create") && holds(actor, "content:update") && holds(actor, "content:submit"),
      canApprove: holds(actor, "content:approve"),
      canApproveLegal: canApproveLegal(actor)
    };
  }

  // -------------------------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------------------------

  async list(actor: ActorContext, rawQuery: unknown): Promise<ContentEntryListResponse> {
    this.authorize(actor, "content:read", "list");
    const query = parseHttpInput(contentEntryListQuerySchema, rawQuery ?? {});
    return { items: (await this.deps.repository.list(query)).map(toView) };
  }

  async get(actor: ActorContext, id: string): Promise<ContentEntryView> {
    this.authorize(actor, "content:read", id);
    return toView(await this.require(id));
  }

  async history(actor: ActorContext, id: string): Promise<ContentEntryListResponse> {
    this.authorize(actor, "content:read", id);
    const entry = await this.require(id);
    return { items: (await this.deps.repository.history(keyOf(entry))).map(toView) };
  }

  // -------------------------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------------------------

  async create(actor: ActorContext, input: unknown): Promise<ContentEntryView> {
    this.authorize(actor, "content:create");
    const body = parseHttpInput(contentEntryCreateSchema, input ?? {});
    const countryCode = body.countryCode ?? null;
    const scopeError = validateContentScope({ kind: body.kind, entryKey: body.entryKey, countryCode });
    if (scopeError) throw badRequest(scopeError);
    const payload = this.parsePayload(body.kind, body.payload);
    const key: ContentEntryKey = { kind: body.kind, entryKey: body.entryKey, locale: body.locale, countryCode };
    if (await this.deps.repository.findOpen(key)) throw conflict("An open version already exists for this content");
    if (await this.deps.repository.findPublishedVersion(key)) throw conflict("This content is already published: revise it instead of creating it again");
    const now = this.now();
    const entry = await this.insert({
      id: crypto.randomUUID(),
      ...key,
      version: await this.deps.repository.nextVersion(key),
      status: "draft",
      label: labelFor(body.kind, body.entryKey, countryCode, payload),
      payload,
      basedOnId: null,
      createdById: actor.actorId ?? null,
      createdAt: now,
      updatedAt: now,
      submittedById: null,
      submittedAt: null,
      decidedById: null,
      decidedAt: null,
      decisionNote: null,
      publishedAt: null
    });
    this.audit(actor, ContentAuditActions.created, entry, "success", { from: null, to: entry.status });
    return toView(entry);
  }

  /** Only a draft is edited, and in place; a published version is never modified (use `revise`). */
  async update(actor: ActorContext, id: string, input: unknown): Promise<ContentEntryView> {
    this.authorize(actor, "content:update", id);
    const entry = await this.require(id);
    const body = parseHttpInput(contentEntryUpdateSchema, input ?? {});
    if (entry.status !== "draft") this.refuseTransition(actor, entry, "not_a_draft", "Only a draft can be edited");
    const payload = this.parsePayload(entry.kind, body.payload);
    const updated = await this.transition(actor, entry, { status: "draft", updatedAt: entry.updatedAt }, {
      payload,
      label: labelFor(entry.kind, entry.entryKey, entry.countryCode, payload),
      updatedAt: this.stamp(entry)
    });
    this.audit(actor, ContentAuditActions.updated, updated, "success", { from: "draft", to: "draft" });
    return toView(updated);
  }

  /** `draft -> pending_review`, after the content and editorial checks. */
  async submit(actor: ActorContext, id: string): Promise<ContentEntryView> {
    this.authorize(actor, "content:submit", id);
    const entry = await this.require(id);
    if (entry.status !== "draft") this.refuseTransition(actor, entry, "invalid_transition", `A ${entry.status} entry cannot be submitted`);
    this.parsePayload(entry.kind, entry.payload);
    this.assertEditorial(actor, entry);
    const now = this.stamp(entry);
    // The guard pins the checked text: an edit landing after the read makes the submission fail.
    const updated = await this.transition(actor, entry, { status: "draft", updatedAt: entry.updatedAt }, { status: "pending_review", submittedById: actor.actorId ?? null, submittedAt: now, updatedAt: now });
    this.audit(actor, ContentAuditActions.submitted, updated, "success", { from: "draft", to: "pending_review" });
    return toView(updated);
  }

  /** `pending_review -> draft`, taken back before a decision. */
  async withdraw(actor: ActorContext, id: string): Promise<ContentEntryView> {
    this.authorize(actor, "content:submit", id);
    const entry = await this.require(id);
    if (entry.status !== "pending_review") this.refuseTransition(actor, entry, "invalid_transition", `A ${entry.status} entry cannot be withdrawn`);
    const updated = await this.transition(actor, entry, { status: "pending_review", updatedAt: entry.updatedAt }, { status: "draft", submittedById: null, submittedAt: null, updatedAt: this.stamp(entry) });
    this.audit(actor, ContentAuditActions.withdrawn, updated, "success", { from: "pending_review", to: "draft" });
    return toView(updated);
  }

  /**
   * `pending_review -> published`: another actor than the submitter, clean wording, atomic swap of
   * the published version. The status, the read `updatedAt` and "submitter is not me" are part of
   * the publishing write itself, so a withdraw/edit/resubmit racing this approval cannot publish a
   * text this actor did not review, nor one this actor submitted.
   */
  async approve(actor: ActorContext, id: string, input: unknown): Promise<ContentEntryView> {
    this.authorize(actor, "content:approve", id);
    const entry = await this.require(id);
    const body = parseHttpInput(contentDecisionSchema, input ?? {});
    if (entry.status !== "pending_review") this.refuseTransition(actor, entry, "invalid_transition", `A ${entry.status} entry cannot be approved`);
    if (!actor.actorId || actor.actorId === entry.submittedById) this.refuseApproval(actor, entry, "self_approval", "The submitter cannot approve their own entry");
    // Four eyes needs a known submitter: an anonymous submission cannot be told apart from the approver.
    if (!entry.submittedById) this.refuseApproval(actor, entry, "unknown_submitter", "A submission without a known submitter cannot be approved");
    if (entry.kind === "legal_override" && !canApproveLegal(actor)) this.refuseApproval(actor, entry, "legal_override_requires_compliance", "A legal override can only be approved by a compliance administrator");
    this.parsePayload(entry.kind, entry.payload);
    this.assertEditorial(actor, entry);
    const guard: ContentEntryGuard = { status: "pending_review", updatedAt: entry.updatedAt, submittedByNot: actor.actorId };
    const published = await this.deps.repository.publishExclusively(entry.id, guard, { publishedAt: this.stamp(entry), decidedById: actor.actorId, note: body.note ?? null });
    if (!published) this.refuseConcurrentChange(actor, entry);
    this.audit(actor, ContentAuditActions.approved, published, "success", { from: "pending_review", to: "published", hasNote: Boolean(body.note) });
    return toView(published);
  }

  /** `pending_review -> draft` with a mandatory reason. */
  async reject(actor: ActorContext, id: string, input: unknown): Promise<ContentEntryView> {
    this.authorize(actor, "content:approve", id);
    const entry = await this.require(id);
    const body = parseHttpInput(contentReasonRequiredSchema, input ?? {});
    if (entry.status !== "pending_review") this.refuseTransition(actor, entry, "invalid_transition", `A ${entry.status} entry cannot be rejected`);
    const now = this.stamp(entry);
    const updated = await this.transition(actor, entry, { status: "pending_review", updatedAt: entry.updatedAt }, { status: "draft", decidedById: actor.actorId ?? null, decidedAt: now, decisionNote: body.note, updatedAt: now });
    this.audit(actor, ContentAuditActions.rejected, updated, "success", { from: "pending_review", to: "draft" });
    return toView(updated);
  }

  /** `published|draft -> archived` with a mandatory reason. */
  async archive(actor: ActorContext, id: string, input: unknown): Promise<ContentEntryView> {
    this.authorize(actor, "content:approve", id);
    const entry = await this.require(id);
    const body = parseHttpInput(contentReasonRequiredSchema, input ?? {});
    if (entry.status !== "published" && entry.status !== "draft") this.refuseTransition(actor, entry, "invalid_transition", `A ${entry.status} entry cannot be archived`);
    const now = this.stamp(entry);
    const updated = await this.transition(actor, entry, { status: entry.status, updatedAt: entry.updatedAt }, { status: "archived", decidedById: actor.actorId ?? null, decidedAt: now, decisionNote: body.note, updatedAt: now });
    this.audit(actor, ContentAuditActions.archived, updated, "success", { from: entry.status, to: "archived" });
    return toView(updated);
  }

  /** Clones a published version into the next draft; the published one stays online until the draft is approved. */
  async revise(actor: ActorContext, id: string): Promise<ContentEntryView> {
    this.authorize(actor, "content:create", id);
    const source = await this.require(id);
    if (source.status !== "published") this.refuseTransition(actor, source, "not_published", "Only a published entry can be revised");
    const key = keyOf(source);
    if (await this.deps.repository.findOpen(key)) this.refuseTransition(actor, source, "open_version_exists", "An open version already exists for this content");
    const now = this.now();
    const entry = await this.insert({
      id: crypto.randomUUID(),
      ...key,
      version: await this.deps.repository.nextVersion(key),
      status: "draft",
      label: source.label,
      payload: structuredClone(source.payload),
      basedOnId: source.id,
      createdById: actor.actorId ?? null,
      createdAt: now,
      updatedAt: now,
      submittedById: null,
      submittedAt: null,
      decidedById: null,
      decidedAt: null,
      decisionNote: null,
      publishedAt: null
    });
    this.audit(actor, ContentAuditActions.revised, entry, "success", { from: "published", to: "draft", basedOnVersion: source.version });
    return toView(entry);
  }

  // -------------------------------------------------------------------------------------------
  // Public projection
  // -------------------------------------------------------------------------------------------

  /** Published content of one locale; `legal` only for the requested country. No identifier of a person, no note. */
  async publicContent(locale: ContentCmsLocale, country?: string): Promise<PublicContentResponse> {
    const response: PublicContentResponse = { locale, faq: [], guides: [], glossary: [], legal: {} };
    const rows = (await this.deps.repository.listPublished(locale)).filter((row) => row.status === "published" && row.locale === locale);
    for (const row of rows) {
      const parsed = contentPayloadSchemas[row.kind].safeParse(row.payload);
      // A stored payload that no longer satisfies the plain-text schema is never served.
      if (!parsed.success) continue;
      const date = (row.publishedAt ?? row.updatedAt).toISOString().slice(0, 10);
      switch (row.kind) {
        case "faq": {
          const data = parsed.data as FaqPayload;
          response.faq.push({ question: data.question, answer: data.answer, ...(data.theme ? { theme: data.theme } : {}), ...(data.productKey ? { productKey: data.productKey } : {}) });
          break;
        }
        case "guide": {
          const data = parsed.data as GuidePayload;
          response.guides.push({
            slug: row.entryKey,
            title: data.title,
            description: data.description,
            updatedAt: date,
            ...(data.productKey ? { productKey: data.productKey } : {}),
            sections: data.sections,
            keyPoints: data.keyPoints,
            mistakes: data.mistakes,
            ...(data.compareCta ? { compareCta: data.compareCta } : {})
          });
          break;
        }
        case "glossary": {
          const data = parsed.data as GlossaryPayload;
          response.glossary.push({ term: data.term, definition: data.definition, ...(data.seeAlso ? { seeAlso: data.seeAlso } : {}) });
          break;
        }
        case "legal_override": {
          if (!country || row.countryCode !== country) break;
          const slug = (contentLegalSlugs as readonly string[]).find((candidate) => candidate === row.entryKey);
          if (!slug) break;
          const data = parsed.data as LegalOverridePayload;
          response.legal[slug as (typeof contentLegalSlugs)[number]] = {
            ...(data.title ? { title: data.title } : {}),
            ...(data.description ? { description: data.description } : {}),
            ...(data.summary ? { summary: data.summary } : {}),
            updatedAt: date,
            sections: data.sections,
            ...(data.placeholders ? { placeholders: data.placeholders } : {})
          };
          break;
        }
      }
    }
    return response;
  }

  // -------------------------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------------------------

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  /**
   * Timestamp of a write on `entry`: never equal to (nor before) the `updatedAt` it replaces, so two
   * writes within the same millisecond, or a clock step back, still change the row version that the
   * guards compare.
   */
  private stamp(entry: ContentEntryRecord): Date {
    return new Date(Math.max(this.now().getTime(), entry.updatedAt.getTime() + 1));
  }

  /** Conditional write; a guard mismatch (concurrent change) is an audited 409. */
  private async transition(actor: ActorContext, entry: ContentEntryRecord, guard: ContentEntryGuard, patch: ContentEntryPatch): Promise<ContentEntryRecord> {
    const updated = await this.deps.repository.transition(entry.id, guard, patch);
    if (!updated) this.refuseConcurrentChange(actor, entry);
    return updated;
  }

  private refuseConcurrentChange(actor: ActorContext, entry: ContentEntryRecord): never {
    this.refuseTransition(actor, entry, "concurrent_change", "This content changed since it was read: reload it and try again");
  }

  private async require(id: string): Promise<ContentEntryRecord> {
    const entry = await this.deps.repository.find(id);
    if (!entry) throw notFound();
    return entry;
  }

  private async insert(entry: ContentEntryRecord): Promise<ContentEntryRecord> {
    try {
      return await this.deps.repository.create(entry);
    } catch (error) {
      if (error instanceof OpenContentEntryExistsError) throw conflict("An open version already exists for this content");
      throw error;
    }
  }

  private parsePayload(kind: ContentKind, payload: unknown): Record<string, unknown> {
    return parseHttpInput(contentPayloadSchemas[kind] as ZodType<unknown>, payload) as Record<string, unknown>;
  }

  /** Constitution VIII + editorial charter, on every string of the payload. A refusal is audited without the text. */
  private assertEditorial(actor: ActorContext, entry: ContentEntryRecord): void {
    const text = collectPayloadStrings(entry.payload).join("\n");
    const wording = [...new Set([...findForbiddenWordingAnyLanguage(text), ...findForbiddenEditorialWordingForLocale(text, entry.locale)])];
    if (wording.length === 0) return;
    this.audit(actor, ContentAuditActions.forbiddenWording, entry, "refused", { status: entry.status, wordingCount: wording.length });
    throw new UnprocessableEntityException({
      code: ErrorCodes.FORBIDDEN_WORDING,
      message: `Refused: forbidden wording (${wording.join(", ")})`,
      details: { wording }
    });
  }

  private refuseTransition(actor: ActorContext, entry: ContentEntryRecord, reason: string, message: string): never {
    this.audit(actor, ContentAuditActions.refused, entry, "refused", { reason, status: entry.status });
    throw conflict(message);
  }

  private refuseApproval(actor: ActorContext, entry: ContentEntryRecord, reason: string, message: string): never {
    this.audit(actor, ContentAuditActions.refused, entry, "refused", { reason, status: entry.status });
    throw new ForbiddenException({ code: ErrorCodes.RBAC_DENIED, message });
  }

  private audit(actor: ActorContext, action: string, entry: ContentEntryRecord, result: "success" | "refused" | "failed", context: Record<string, unknown>): void {
    this.deps.audit.write({
      actor,
      action,
      targetType: "ContentEntry",
      targetId: entry.id,
      scope: { kind: entry.kind, entryKey: entry.entryKey, locale: entry.locale, countryCode: entry.countryCode ?? null, version: entry.version },
      result,
      ...(result === "refused" && typeof context.reason === "string" ? { reason: context.reason } : {}),
      context
    });
  }
}
