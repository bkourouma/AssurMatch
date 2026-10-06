import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { PrismaService } from "../../../src/modules/common/prisma/prisma.service";
import { PrismaRegulatoryRegimesRepository, RegulatoryRegimesService } from "../../../src/modules/regulatory-regimes/regulatory-regimes.module";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

/** A minimal stand-in for the Prisma `regulatoryRegime` delegate, keyed like the real table. */
function fakePrisma() {
  const rows = new Map<string, Record<string, unknown>>();
  const delegate = {
    async create({ data }: { data: Record<string, unknown> }) {
      const row: Record<string, unknown> = { description: null, retentionOverrideYears: null, createdById: null, ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) };
      rows.set(String(row.id), row);
      return row;
    },
    async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
      const row = { ...rows.get(where.id), ...data };
      rows.set(where.id, row);
      return row;
    },
    async findMany() {
      return [...rows.values()];
    },
    async findUnique({ where }: { where: { id?: string; key?: string } }) {
      return [...rows.values()].find((row) => (where.id ? row.id === where.id : row.key === where.key)) ?? null;
    }
  };
  return { rows, prisma: { requireRuntimeClient: () => ({ regulatoryRegime: delegate }) } as unknown as PrismaService };
}

describe("PrismaRegulatoryRegimesRepository (spec 050 R9)", () => {
  it("persists regimes through the Prisma delegate so a new service instance reads them back", async () => {
    const { prisma, rows } = fakePrisma();
    const repository = new PrismaRegulatoryRegimesRepository(prisma);
    expect(repository.mode).toBe("prisma-runtime");
    const first = new RegulatoryRegimesService(new AuditLogWriter(), repository);
    const regime = await first.create({ key: "cima", name: "CIMA", status: "active", reason: "regime CIMA de reference" }, superAdminActor);
    expect(rows.size).toBe(1);

    // "Restart": a fresh service on the same storage still sees the regime and its update.
    const restarted = new RegulatoryRegimesService(new AuditLogWriter(), new PrismaRegulatoryRegimesRepository(prisma));
    await restarted.update(regime.id, { name: "CIMA (Conference)", reason: "libelle complet" }, superAdminActor);
    const listed = await restarted.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ key: "cima", name: "CIMA (Conference)", status: "active" });
    expect(listed[0]?.description).toBeUndefined();
    expect(await restarted.findActive(regime.id)).toBeDefined();
  });

  it("refuses to retire a regime still referenced by a country", async () => {
    const service = new RegulatoryRegimesService(new AuditLogWriter(), undefined, async () => ["CI", "SN"]);
    const regime = await service.create({ key: "cima", name: "CIMA", status: "active" }, superAdminActor);
    await expect(service.retire(regime.id, "retrait du regime", superAdminActor)).rejects.toThrow(/referenced by country CI, SN/);
  });
});
