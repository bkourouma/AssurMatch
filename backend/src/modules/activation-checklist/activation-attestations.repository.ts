import type { ActivationAttestationScopeType } from "../../../../packages/shared/contracts/activation-checklist.contracts";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";

export const ACTIVATION_ATTESTATIONS_REPOSITORY = Symbol("ACTIVATION_ATTESTATIONS_REPOSITORY");

/** Spec 070 PRD 35/36: one manual attestation of a checklist control, for one country or one product. */
export interface ActivationAttestation {
  id: string;
  scopeType: ActivationAttestationScopeType;
  scopeId: string;
  controlKey: string;
  note: string;
  attestedById: string;
  attestedAt: Date;
  revokedById: string | null;
  revokedAt: Date | null;
}

export interface ActivationAttestationsRepository extends RuntimeRepository {
  /** Every row of the scope, revoked ones included (the active one has `revokedAt === null`). */
  list(scopeType: ActivationAttestationScopeType, scopeId: string): Promise<ActivationAttestation[]>;
  find(scopeType: ActivationAttestationScopeType, scopeId: string, controlKey: string): Promise<ActivationAttestation | undefined>;
  /** Creates or replaces the single row of (scopeType, scopeId, controlKey); a replaced row is no longer revoked. */
  upsert(attestation: Omit<ActivationAttestation, "id" | "revokedById" | "revokedAt">): Promise<ActivationAttestation>;
  revoke(scopeType: ActivationAttestationScopeType, scopeId: string, controlKey: string, revokedById: string, revokedAt: Date): Promise<ActivationAttestation | undefined>;
}

export class MemoryActivationAttestationsRepository implements ActivationAttestationsRepository {
  readonly mode = "memory-test" as const;
  private readonly rows = new Map<string, ActivationAttestation>();

  constructor() {
    assertRuntimeRepository(this.mode, "ActivationAttestationsRepository");
  }

  async list(scopeType: ActivationAttestationScopeType, scopeId: string): Promise<ActivationAttestation[]> {
    return [...this.rows.values()].filter((row) => row.scopeType === scopeType && row.scopeId === scopeId).map((row) => ({ ...row }));
  }

  async find(scopeType: ActivationAttestationScopeType, scopeId: string, controlKey: string): Promise<ActivationAttestation | undefined> {
    const row = this.rows.get(this.key(scopeType, scopeId, controlKey));
    return row ? { ...row } : undefined;
  }

  async upsert(attestation: Omit<ActivationAttestation, "id" | "revokedById" | "revokedAt">): Promise<ActivationAttestation> {
    const key = this.key(attestation.scopeType, attestation.scopeId, attestation.controlKey);
    const saved: ActivationAttestation = {
      ...attestation,
      id: this.rows.get(key)?.id ?? crypto.randomUUID(),
      revokedById: null,
      revokedAt: null
    };
    this.rows.set(key, saved);
    return { ...saved };
  }

  async revoke(scopeType: ActivationAttestationScopeType, scopeId: string, controlKey: string, revokedById: string, revokedAt: Date): Promise<ActivationAttestation | undefined> {
    const row = this.rows.get(this.key(scopeType, scopeId, controlKey));
    if (!row) return undefined;
    row.revokedById = revokedById;
    row.revokedAt = revokedAt;
    return { ...row };
  }

  private key(scopeType: string, scopeId: string, controlKey: string): string {
    return `${scopeType}:${scopeId}:${controlKey}`;
  }
}

type AttestationRow = Omit<ActivationAttestation, "scopeType"> & { scopeType: string };

type ActivationAttestationDelegate = {
  findMany(input?: unknown): Promise<AttestationRow[]>;
  findUnique(input: unknown): Promise<AttestationRow | null>;
  upsert(input: unknown): Promise<AttestationRow>;
  update(input: unknown): Promise<AttestationRow>;
};

export class PrismaActivationAttestationsRepository implements ActivationAttestationsRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async list(scopeType: ActivationAttestationScopeType, scopeId: string): Promise<ActivationAttestation[]> {
    const rows = await this.delegate().findMany({ where: { scopeType, scopeId }, orderBy: { controlKey: "asc" } });
    return rows.map((row) => this.fromRow(row));
  }

  async find(scopeType: ActivationAttestationScopeType, scopeId: string, controlKey: string): Promise<ActivationAttestation | undefined> {
    const row = await this.delegate().findUnique({ where: { scopeType_scopeId_controlKey: { scopeType, scopeId, controlKey } } });
    return row ? this.fromRow(row) : undefined;
  }

  async upsert(attestation: Omit<ActivationAttestation, "id" | "revokedById" | "revokedAt">): Promise<ActivationAttestation> {
    const { scopeType, scopeId, controlKey, note, attestedById, attestedAt } = attestation;
    const row = await this.delegate().upsert({
      where: { scopeType_scopeId_controlKey: { scopeType, scopeId, controlKey } },
      create: { scopeType, scopeId, controlKey, note, attestedById, attestedAt },
      update: { note, attestedById, attestedAt, revokedById: null, revokedAt: null }
    });
    return this.fromRow(row);
  }

  async revoke(scopeType: ActivationAttestationScopeType, scopeId: string, controlKey: string, revokedById: string, revokedAt: Date): Promise<ActivationAttestation | undefined> {
    const existing = await this.find(scopeType, scopeId, controlKey);
    if (!existing) return undefined;
    const row = await this.delegate().update({
      where: { scopeType_scopeId_controlKey: { scopeType, scopeId, controlKey } },
      data: { revokedById, revokedAt }
    });
    return this.fromRow(row);
  }

  private fromRow(row: AttestationRow): ActivationAttestation {
    return {
      id: row.id,
      scopeType: row.scopeType as ActivationAttestationScopeType,
      scopeId: row.scopeId,
      controlKey: row.controlKey,
      note: row.note,
      attestedById: row.attestedById,
      attestedAt: row.attestedAt,
      revokedById: row.revokedById ?? null,
      revokedAt: row.revokedAt ?? null
    };
  }

  private delegate(): ActivationAttestationDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { activationAttestation: ActivationAttestationDelegate }).activationAttestation;
  }
}
