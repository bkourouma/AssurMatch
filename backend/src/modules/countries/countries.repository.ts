import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { Country } from "./countries.module";

export const COUNTRIES_REPOSITORY = Symbol("COUNTRIES_REPOSITORY");

export interface CountriesRepository extends RuntimeRepository {
  create(country: Country): Promise<Country>;
  update(id: string, update: Partial<Country>): Promise<Country>;
  list(): Promise<Country[]>;
  listPublic(): Promise<Country[]>;
  findByIsoCode(countryCode: string): Promise<Country | undefined>;
  require(id: string): Promise<Country>;
}

export class MemoryCountriesRepository implements CountriesRepository {
  readonly mode = "memory-test" as const;
  private readonly countries: Country[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "CountriesRepository");
  }

  async create(country: Country): Promise<Country> {
    this.countries.push(country);
    return country;
  }

  async update(id: string, update: Partial<Country>): Promise<Country> {
    const country = await this.require(id);
    Object.assign(country, update);
    return country;
  }

  async list(): Promise<Country[]> {
    return [...this.countries];
  }

  async listPublic(): Promise<Country[]> {
    return this.countries.filter((country) =>
      country.status === "public" && (country.flags.country_public_enabled || country.flags.country_waitlist_enabled)
    );
  }

  async findByIsoCode(countryCode: string): Promise<Country | undefined> {
    return this.countries.find((candidate) => candidate.isoCode.toUpperCase() === countryCode.toUpperCase());
  }

  async require(id: string): Promise<Country> {
    const country = this.countries.find((candidate) => candidate.id === id);
    if (!country) throw new Error(`Country ${id} not found`);
    return country;
  }
}

type CountryDelegate = {
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
  findFirst(input: unknown): Promise<unknown | null>;
  findUnique(input: unknown): Promise<unknown | null>;
};

export class PrismaCountriesRepository implements CountriesRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(country: Country): Promise<Country> {
    const client = this.client();
    const row = await client.create({ data: this.toPrisma(country) });
    return this.toDomain(row);
  }

  async update(id: string, update: Partial<Country>): Promise<Country> {
    const client = this.client();
    const row = await client.update({ where: { id }, data: this.toPrismaUpdate(update) });
    return this.toDomain(row);
  }

  async list(): Promise<Country[]> {
    const rows = await this.client().findMany({ orderBy: { name: "asc" } });
    return rows.map((row) => this.toDomain(row));
  }

  async listPublic(): Promise<Country[]> {
    const rows = await this.client().findMany({ where: { status: "public" }, orderBy: { name: "asc" } });
    return rows.map((row) => this.toDomain(row)).filter((country) => country.flags.country_public_enabled || country.flags.country_waitlist_enabled);
  }

  async findByIsoCode(countryCode: string): Promise<Country | undefined> {
    const row = await this.client().findFirst({ where: { isoCode: countryCode.toUpperCase() } });
    return row ? this.toDomain(row) : undefined;
  }

  async require(id: string): Promise<Country> {
    const row = await this.client().findUnique({ where: { id } });
    if (!row) throw new Error(`Country ${id} not found`);
    return this.toDomain(row);
  }

  private client(): CountryDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { country: CountryDelegate }).country;
  }

  private toPrisma(country: Country): Record<string, unknown> {
    return {
      id: country.id,
      isoCode: country.isoCode,
      name: country.name,
      currency: country.currency,
      languages: country.languages,
      timezone: country.timezone,
      regulatoryFamily: country.regulatoryFamily,
      regulatoryRegimeId: country.regulatoryRegimeId,
      status: country.status,
      flags: country.flags,
      createdAt: country.createdAt,
      updatedAt: country.updatedAt,
      createdById: country.createdById
    };
  }

  private toPrismaUpdate(update: Partial<Country>): Record<string, unknown> {
    const data = this.toPrisma({ ...update } as Country);
    delete data.id;
    delete data.createdAt;
    return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
  }

  private toDomain(row: unknown): Country {
    const item = row as Country;
    return { ...item, flags: item.flags };
  }
}
