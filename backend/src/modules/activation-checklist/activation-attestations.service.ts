import {
  ACTIVATION_ATTESTABLE_CONTROLS,
  ACTIVATION_ATTESTATION_NOTE_MAX_LENGTH,
  activationAttestationCreateSchema,
  activationAttestationListQuerySchema,
  activationAttestationRevokeSchema,
  type ActivationAttestationCreateDto,
  type ActivationAttestationListResponse,
  type ActivationAttestationRecord,
  type ActivationAttestationRevokeDto,
  type ActivationAttestationScope,
  type ActivationAttestationScopeType
} from "../../../../packages/shared/contracts/activation-checklist.contracts";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { ActivationAttestation, ActivationAttestationsRepository } from "./activation-attestations.repository";
import { ActivationChecklistAuditActions } from "./activation-checklist-audit-actions";
import { ActivationChecklistAccessRefusedError } from "./activation-checklist.service";

/** Attestations are a compliance act: the same roles that open a country, with MFA. */
const ATTESTATION_ROLES = new Set(["compliance_admin", "super_admin"]);

/** Business refusal (unknown control, unknown scope, note too short...), audited like the access refusals. */
export class ActivationAttestationRefusedError extends Error {
  constructor(public readonly reason: string) {
    super(`Activation attestation refused: ${reason}`);
    this.name = "ActivationAttestationRefusedError";
  }
}

export interface ActivationAttestationsDeps {
  repository: ActivationAttestationsRepository;
  audit: AuditLogWriter;
  countries: { require(id: string): Promise<unknown> };
  products: { require(id: string): Promise<unknown> };
}

type AttestableControl = { label: string; minNoteLength: number };
type RefusalTarget = Partial<ActivationAttestationScope> & { controlKey?: string };

const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE_PATTERN = /\+\d[\d ]{7,}\d|\b\d{9,}\b/;

function attestableControl(scopeType: ActivationAttestationScopeType, controlKey: string): AttestableControl | undefined {
  const controls: Record<string, AttestableControl> = ACTIVATION_ATTESTABLE_CONTROLS[scopeType];
  return Object.prototype.hasOwnProperty.call(controls, controlKey) ? controls[controlKey] : undefined;
}

function toRecord(row: ActivationAttestation): ActivationAttestationRecord {
  return {
    scopeType: row.scopeType,
    scopeId: row.scopeId,
    controlKey: row.controlKey,
    note: row.note,
    attestedById: row.attestedById,
    attestedAt: row.attestedAt.toISOString(),
    revokedById: row.revokedById,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null
  };
}

export class ActivationAttestationsService {
  constructor(private readonly deps: ActivationAttestationsDeps) {}

  async list(actor: ActorContext, scope: ActivationAttestationScope): Promise<ActivationAttestationListResponse> {
    this.assertRole(actor);
    const parsed = activationAttestationListQuerySchema.safeParse(scope);
    if (!parsed.success) this.refuseInput(actor, scope, "invalid_input");
    await this.assertScopeExists(actor, parsed.data);
    const rows = await this.deps.repository.list(parsed.data.scopeType, parsed.data.scopeId);
    this.deps.audit.write({
      actor,
      action: ActivationChecklistAuditActions.attestationRead,
      targetType: "ActivationAttestation",
      targetId: `${parsed.data.scopeType}:${parsed.data.scopeId}`,
      scope: { ...parsed.data },
      result: "success",
      context: { count: rows.length }
    });
    return { ...parsed.data, attestations: rows.map(toRecord) };
  }

  async attest(actor: ActorContext, input: ActivationAttestationCreateDto): Promise<ActivationAttestationRecord> {
    this.assertRole(actor);
    const target: RefusalTarget = { scopeType: input.scopeType, scopeId: input.scopeId, controlKey: input.controlKey };
    const control = attestableControl(input.scopeType, input.controlKey);
    if (!control) this.refuseInput(actor, target, "control_not_attestable");
    const parsed = activationAttestationCreateSchema.safeParse(input);
    if (!parsed.success) {
      const tooLong = typeof input.note === "string" && input.note.trim().length > ACTIVATION_ATTESTATION_NOTE_MAX_LENGTH;
      this.refuseInput(actor, target, tooLong ? "note_too_long" : "invalid_input");
    }
    const note = parsed.data.note;
    if (note.length < control.minNoteLength) {
      this.refuseInput(actor, target, "note_too_short", { noteLength: note.length, minNoteLength: control.minNoteLength });
    }
    if (EMAIL_PATTERN.test(note) || PHONE_PATTERN.test(note)) {
      this.refuseInput(actor, target, "note_contains_personal_data", { noteLength: note.length });
    }
    await this.assertScopeExists(actor, parsed.data);
    const previous = await this.deps.repository.find(parsed.data.scopeType, parsed.data.scopeId, parsed.data.controlKey);
    const saved = await this.deps.repository.upsert({
      scopeType: parsed.data.scopeType,
      scopeId: parsed.data.scopeId,
      controlKey: parsed.data.controlKey,
      note,
      attestedById: actor.actorId ?? "unknown",
      attestedAt: new Date()
    });
    this.deps.audit.write({
      actor,
      action: ActivationChecklistAuditActions.attested,
      targetType: "ActivationAttestation",
      targetId: `${saved.scopeType}:${saved.scopeId}:${saved.controlKey}`,
      scope: { scopeType: saved.scopeType, scopeId: saved.scopeId, controlKey: saved.controlKey },
      result: "success",
      // The note itself stays out of the audit log (free text): its length only.
      context: { noteLength: note.length, replaced: previous !== undefined, replacedWasRevoked: previous?.revokedAt != null }
    });
    return toRecord(saved);
  }

  async revoke(actor: ActorContext, input: ActivationAttestationRevokeDto): Promise<ActivationAttestationRecord> {
    this.assertRole(actor);
    const target: RefusalTarget = { scopeType: input.scopeType, scopeId: input.scopeId, controlKey: input.controlKey };
    if (!attestableControl(input.scopeType, input.controlKey)) this.refuseInput(actor, target, "control_not_attestable");
    const parsed = activationAttestationRevokeSchema.safeParse(input);
    if (!parsed.success) this.refuseInput(actor, target, "invalid_input");
    await this.assertScopeExists(actor, parsed.data);
    const existing = await this.deps.repository.find(parsed.data.scopeType, parsed.data.scopeId, parsed.data.controlKey);
    if (!existing || existing.revokedAt) this.refuseInput(actor, target, "attestation_not_active");
    const revoked = await this.deps.repository.revoke(parsed.data.scopeType, parsed.data.scopeId, parsed.data.controlKey, actor.actorId ?? "unknown", new Date());
    if (!revoked) this.refuseInput(actor, target, "attestation_not_active");
    this.deps.audit.write({
      actor,
      action: ActivationChecklistAuditActions.revoked,
      targetType: "ActivationAttestation",
      targetId: `${revoked.scopeType}:${revoked.scopeId}:${revoked.controlKey}`,
      scope: { scopeType: revoked.scopeType, scopeId: revoked.scopeId, controlKey: revoked.controlKey },
      result: "success",
      reason: parsed.data.reason,
      context: { attestedById: existing.attestedById }
    });
    return toRecord(revoked);
  }

  private assertRole(actor: ActorContext): void {
    if (actor.mfaVerified !== true) this.refuseAccess(actor, "mfa_required");
    if (!actor.roles.some((role) => ATTESTATION_ROLES.has(role))) this.refuseAccess(actor, "forbidden_role");
  }

  private async assertScopeExists(actor: ActorContext, scope: ActivationAttestationScope): Promise<void> {
    try {
      if (scope.scopeType === "country") await this.deps.countries.require(scope.scopeId);
      else await this.deps.products.require(scope.scopeId);
    } catch {
      this.refuseInput(actor, scope, "scope_not_found");
    }
  }

  private refuseAccess(actor: ActorContext, reason: string): never {
    this.deps.audit.write({
      actor,
      action: ActivationChecklistAuditActions.attestationRefused,
      targetType: "ActivationAttestation",
      targetId: "admin",
      scope: { roles: actor.roles, mfaVerified: actor.mfaVerified ?? false },
      result: "refused",
      reason,
      context: {}
    });
    throw new ActivationChecklistAccessRefusedError(reason);
  }

  private refuseInput(actor: ActorContext, target: RefusalTarget, reason: string, context: Record<string, unknown> = {}): never {
    this.deps.audit.write({
      actor,
      action: ActivationChecklistAuditActions.attestationRefused,
      targetType: "ActivationAttestation",
      targetId: `${target.scopeType ?? "unknown"}:${target.scopeId ?? "unknown"}${target.controlKey ? `:${target.controlKey}` : ""}`,
      scope: { scopeType: target.scopeType, scopeId: target.scopeId, controlKey: target.controlKey },
      result: "refused",
      reason,
      context
    });
    throw new ActivationAttestationRefusedError(reason);
  }
}
