import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  type CoverageInput,
  type ImportAuditInput,
  type ImportStore,
  type LicenseInput,
  type OfferInput,
  type PartnerInput,
  type PartnerUserInput,
  type StoreOutcome,
  runPartnerImport
} from "./import-partners-core";

interface CliArgs {
  file?: string;
  checksum?: string;
  apply: boolean;
  actorId: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { apply: false, actorId: "partner-import-operator" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--file") args.file = argv[++index];
    else if (arg === "--checksum-sha256") args.checksum = argv[++index];
    else if (arg === "--actor-id") args.actorId = argv[++index] ?? args.actorId;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.file) throw new Error("--file is required");
  if (!args.checksum) throw new Error("--checksum-sha256 is required");
  return args;
}

class PrismaPartnerImportStore implements ImportStore {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertPartner(input: PartnerInput): Promise<{ outcome: StoreOutcome; id: string }> {
    const existing = await this.prisma.partnerTenant.findFirst({ where: { registrationNumber: input.registrationNumber } });
    const data = { ...input };
    if (existing) {
      const updated = await this.prisma.partnerTenant.update({ where: { id: existing.id }, data });
      return { outcome: "updated", id: updated.id };
    }
    const created = await this.prisma.partnerTenant.create({ data });
    return { outcome: "created", id: created.id };
  }

  async upsertPartnerUser(input: PartnerUserInput): Promise<{ outcome: StoreOutcome; id: string }> {
    const partner = await this.requirePartner(input.partnerRegistrationNumber);
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    const userData = {
      email: input.email,
      displayName: input.displayName,
      status: "invited" as const,
      mfaStatus: "required" as const,
      partnerTenantId: partner.id,
      countryScopes: [],
      productScopes: []
    };
    const user = existing
      ? await this.prisma.user.update({ where: { id: existing.id }, data: userData })
      : await this.prisma.user.create({ data: userData });
    const role = await this.prisma.role.upsert({
      where: { key: input.role },
      create: { key: input.role, name: input.role, description: "Imported fake partner role", isSystemRole: true },
      update: {}
    });
    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id, reason: "fake partner import" },
      update: { reason: "fake partner import" }
    });
    return { outcome: existing ? "updated" : "created", id: user.id };
  }

  async upsertLicense(input: LicenseInput): Promise<{ outcome: StoreOutcome; id: string }> {
    const partner = await this.requirePartner(input.partnerRegistrationNumber);
    const country = await this.ensureCountry(input.countryIsoCode);
    const productIds = [];
    for (const productKey of input.productKeys) productIds.push((await this.ensureProduct(productKey)).id);
    const existing = await this.prisma.partnerLicense.findFirst({
      where: { partnerTenantId: partner.id, countryId: country.id, licenseNumber: input.licenseNumber }
    });
    const data = {
      partnerTenantId: partner.id,
      countryId: country.id,
      productIds,
      licenseNumber: input.licenseNumber,
      issuingAuthority: input.issuingAuthority,
      status: input.status,
      effectiveDate: new Date(`${input.effectiveDate}T00:00:00.000Z`),
      expirationDate: new Date(`${input.expirationDate}T00:00:00.000Z`)
    };
    if (existing) {
      const updated = await this.prisma.partnerLicense.update({ where: { id: existing.id }, data });
      return { outcome: "updated", id: updated.id };
    }
    const created = await this.prisma.partnerLicense.create({ data });
    return { outcome: "created", id: created.id };
  }

  async upsertCoverage(input: CoverageInput): Promise<{ outcome: StoreOutcome; id: string }> {
    const partner = await this.requirePartner(input.partnerRegistrationNumber);
    const country = await this.ensureCountry(input.countryIsoCode);
    const countryAuth = await this.prisma.partnerCountryAuthorization.upsert({
      where: { partnerTenantId_countryId: { partnerTenantId: partner.id, countryId: country.id } },
      create: { partnerTenantId: partner.id, countryId: country.id, status: input.status },
      update: { status: input.status }
    });
    for (const productKey of input.productKeys) {
      const product = await this.ensureProduct(productKey);
      await this.prisma.partnerProductAuthorization.upsert({
        where: { partnerTenantId_productId: { partnerTenantId: partner.id, productId: product.id } },
        create: { partnerTenantId: partner.id, productId: product.id, status: input.status },
        update: { status: input.status }
      });
    }
    return { outcome: "updated", id: countryAuth.id };
  }

  async upsertOffer(input: OfferInput): Promise<{ outcome: StoreOutcome; id: string }> {
    const country = await this.ensureCountry(input.countryIsoCode);
    const product = await this.ensureProduct(input.productKey);
    const partner = input.partnerRegistrationNumber ? await this.requirePartner(input.partnerRegistrationNumber) : undefined;
    const data = {
      countryId: country.id,
      productId: product.id,
      partnerTenantId: partner?.id,
      publicKey: input.publicKey,
      name: input.name,
      shortDescription: input.shortDescription,
      guaranteeSummary: input.guaranteeSummary,
      indicativePriceMin: input.indicativePriceMin,
      indicativePriceMax: input.indicativePriceMax,
      currency: input.currency,
      pricingUnit: input.pricingUnit,
      status: input.status,
      validationStatus: input.validationStatus,
      validFrom: new Date(`${input.validFrom}T00:00:00.000Z`),
      validUntil: new Date(`${input.validUntil}T00:00:00.000Z`),
      isSponsored: input.isSponsored,
      sponsorLabel: input.sponsorLabel,
      displayPriority: input.displayPriority,
      publicDisclaimers: input.publicDisclaimers
    };
    const existing = await this.prisma.offer.findUnique({
      where: { countryId_productId_publicKey: { countryId: country.id, productId: product.id, publicKey: input.publicKey } }
    });
    if (existing) {
      const updated = await this.prisma.offer.update({ where: { id: existing.id }, data });
      return { outcome: "updated", id: updated.id };
    }
    const created = await this.prisma.offer.create({ data });
    return { outcome: "created", id: created.id };
  }

  async createAudit(input: ImportAuditInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        id: randomUUID(),
        actorId: input.actorId,
        action: input.action,
        targetType: "PartnerImport",
        targetId: input.batchId,
        scope: { batchId: input.batchId },
        result: input.result,
        reason: "secure partner import",
        context: { checksum: input.checksum, report: input.report },
        retentionUntil: new Date("2036-01-01T00:00:00.000Z")
      }
    });
  }

  private async requirePartner(registrationNumber: string) {
    const partner = await this.prisma.partnerTenant.findFirst({ where: { registrationNumber } });
    if (!partner) throw new Error(`Partner ${registrationNumber} not found`);
    return partner;
  }

  private async ensureCountry(isoCode: string) {
    return this.prisma.country.upsert({
      where: { isoCode },
      create: {
        isoCode,
        name: `Fake ${isoCode}`,
        currency: "XOF",
        languages: ["fr"],
        timezone: "Africa/Abidjan",
        regulatoryFamily: "cima",
        status: "internal",
        flags: { country_public_enabled: false, country_quote_enabled: false, country_comparison_enabled: false }
      },
      update: {}
    });
  }

  private async ensureProduct(key: string) {
    return this.prisma.product.upsert({
      where: { key },
      create: {
        key,
        name: `Fake ${key}`,
        description: "Fake product for operational import validation",
        sensitivity: "standard",
        requiresDocuments: false,
        requiresManualReview: true,
        status: "internal",
        flags: { product_public_enabled: false, product_quote_enabled: false, product_comparison_enabled: false }
      },
      update: {}
    });
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rawInput = await readFile(args.file as string, "utf8");
  const databaseUrl = process.env.DATABASE_URL;
  if (args.apply && !databaseUrl) throw new Error("DATABASE_URL is required for --apply");
  const prisma = args.apply && databaseUrl ? new PrismaClient({ adapter: new PrismaPg(databaseUrl) }) : undefined;
  try {
    const report = await runPartnerImport({
      rawInput,
      expectedChecksum: args.checksum as string,
      apply: args.apply,
      actorId: args.actorId,
      store: prisma ? new PrismaPartnerImportStore(prisma) : undefined
    });
    // CLI contract: print the machine-readable import report to stdout.
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
    if (report.errors.length > 0) process.exitCode = 1;
  } finally {
    await prisma?.$disconnect();
  }
}

await main();
