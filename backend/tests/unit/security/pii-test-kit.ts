import { randomBytes } from "node:crypto";
import type { PrismaService } from "../../../src/modules/common/prisma/prisma.service";
import { PiiKeyRing } from "../../../src/modules/common/security/pii-key-ring";
import { PiiVault } from "../../../src/modules/common/security/pii-vault";

/**
 * Lot 8 test kit: throwaway random keys (generated per test run, never written anywhere) and an
 * in-memory Prisma double that applies the `where` subset the PII adapters and the backfill use
 * (equality, null, Date, gt, not, in, OR), `select`, `orderBy` and `take`.
 */

export function randomKey(bytes = 32): Buffer {
  return randomBytes(bytes);
}

export interface TestRing {
  keys: Array<{ id: string; key: Buffer }>;
  active: string;
  blind: Buffer;
}

export function testRing(ids: string[] = ["k1"], active = ids[0] ?? "k1", blind = randomKey()): TestRing {
  return { keys: ids.map((id) => ({ id, key: randomKey() })), active, blind };
}

export function vaultOf(ring: TestRing): PiiVault {
  return new PiiVault(new PiiKeyRing(ring.keys, ring.active, ring.blind));
}

/** The env form of a ring, as an operator would provision it. */
export function envOf(ring: TestRing): Record<string, string> {
  return {
    PII_ENCRYPTION_KEYS: ring.keys.map((key) => `${key.id}:${key.key.toString("base64")}`).join(","),
    PII_ENCRYPTION_ACTIVE_KEY_ID: ring.active,
    PII_BLIND_INDEX_KEY: ring.blind.toString("base64")
  };
}

/** Every secret string of a ring (raw key encodings), to assert they never leak. */
export function secretsOf(ring: TestRing): string[] {
  return [...ring.keys.map((key) => key.key), ring.blind].flatMap((key) => [key.toString("base64"), key.toString("base64url"), key.toString("hex")]);
}

type Row = Record<string, unknown>;

function same(left: unknown, right: unknown): boolean {
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  return left === right;
}

function matchesCondition(value: unknown, condition: unknown): boolean {
  if (condition === null) return value === null || value === undefined;
  if (condition instanceof Date || typeof condition !== "object") return same(value ?? null, condition);
  const operators = condition as Record<string, unknown>;
  if ("gt" in operators) return typeof value === "string" && value > (operators.gt as string);
  if ("in" in operators) return (operators.in as unknown[]).some((candidate) => same(value, candidate));
  if ("not" in operators) {
    // SQL semantics: NULL <> 'x' is not true.
    if (operators.not === null) return value !== null && value !== undefined;
    return value !== null && value !== undefined && !same(value, operators.not);
  }
  throw new Error(`fake prisma: unsupported condition ${JSON.stringify(Object.keys(operators))}`);
}

export function matchesWhere(row: Row, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") return (condition as Array<Record<string, unknown>>).some((branch) => matchesWhere(row, branch));
    if (key === "AND") return (condition as Array<Record<string, unknown>>).every((branch) => matchesWhere(row, branch));
    return matchesCondition(row[key], condition);
  });
}

function project(row: Row, select: Record<string, unknown> | undefined): Row {
  if (!select) return { ...row };
  return Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, row[key] ?? null]));
}

interface FindInput { where?: Record<string, unknown>; select?: Record<string, unknown>; orderBy?: Record<string, "asc" | "desc">; take?: number }

export class FakeTable {
  readonly writes: Array<{ op: string; input: unknown }> = [];

  constructor(readonly rows: Row[] = []) {}

  async findMany(input: FindInput = {}): Promise<Row[]> {
    let rows = this.rows.filter((row) => matchesWhere(row, input.where));
    const order = input.orderBy ? Object.entries(input.orderBy)[0] : undefined;
    if (order) {
      const [key, direction] = order;
      rows = [...rows].sort((a, b) => {
        const left = a[key] instanceof Date ? (a[key] as Date).getTime() : (a[key] as string);
        const right = b[key] instanceof Date ? (b[key] as Date).getTime() : (b[key] as string);
        return (left < right ? -1 : left > right ? 1 : 0) * (direction === "desc" ? -1 : 1);
      });
    }
    if (input.take !== undefined) rows = rows.slice(0, input.take);
    return rows.map((row) => project(row, input.select));
  }

  async findFirst(input: FindInput = {}): Promise<Row | null> {
    return (await this.findMany({ ...input, take: 1 }))[0] ?? null;
  }

  async findUnique(input: FindInput): Promise<Row | null> {
    return this.findFirst(input);
  }

  async count(input: FindInput = {}): Promise<number> {
    return this.rows.filter((row) => matchesWhere(row, input.where)).length;
  }

  async create(input: { data: Row }): Promise<Row> {
    this.writes.push({ op: "create", input });
    const row = { ...input.data };
    this.rows.push(row);
    return { ...row };
  }

  async update(input: { where: Row; data: Row }): Promise<Row> {
    this.writes.push({ op: "update", input });
    const row = this.rows.find((candidate) => matchesWhere(candidate, input.where));
    if (!row) throw new Error("fake prisma: record not found");
    Object.assign(row, input.data);
    return { ...row };
  }

  async updateMany(input: { where: Record<string, unknown>; data: Row }): Promise<{ count: number }> {
    this.writes.push({ op: "updateMany", input });
    const rows = this.rows.filter((row) => matchesWhere(row, input.where));
    for (const row of rows) Object.assign(row, input.data);
    return { count: rows.length };
  }
}

/** A Prisma double whose unknown delegates are empty tables. */
export function fakePrisma(tables: Record<string, FakeTable>): { prisma: PrismaService; tables: Record<string, FakeTable> } {
  const client = new Proxy(tables, {
    get(target, name: string) {
      if (typeof name !== "string") return undefined;
      target[name] ??= new FakeTable();
      return target[name];
    }
  });
  return { prisma: { requireRuntimeClient: () => client } as unknown as PrismaService, tables };
}
