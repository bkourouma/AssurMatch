import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type { AssurMatchRole } from "../../packages/shared/rbac/assurmatch-role-matrix";
import { PasswordHashingService } from "../../backend/src/modules/auth/password-hashing.service";

type PartnerPlan = "starter" | "pro" | "enterprise";
type LeadStatus = "assigned" | "broker_notified" | "seen" | "accepted" | "rejected" | "closed" | "disputed";
type CrmStatus =
  | "nouveau"
  | "accepte"
  | "contact_tente"
  | "contacte"
  | "qualifie"
  | "documents_demandes"
  | "devis_en_preparation"
  | "devis_envoye"
  | "negociation"
  | "gagne"
  | "perdu"
  | "injoignable";
type CrmUrgency = "low" | "normal" | "high" | "urgent";

interface CliOptions {
  apply: boolean;
  crmEnabled: boolean;
  allowDemoSeed: boolean;
}

interface CountryRecord {
  id: string;
  isoCode: string;
}

interface ProductRecord {
  id: string;
  key: string;
}

interface PartnerRecord {
  id: string;
  legalName: string;
  plan: PartnerPlan;
}

interface DemoUserRecord {
  id: string;
  email: string;
  role: AssurMatchRole;
  partnerTenantId: string;
}

interface AdminDemoUserRecord {
  id: string;
  email: string;
  role: AssurMatchRole;
}

interface QuoteSeedInput {
  key: string;
  partnerTenantId: string;
  country: CountryRecord;
  product: ProductRecord;
  prospectName: string;
  email: string;
  phone: string;
  status: LeadStatus;
  assignedDaysAgo: number;
  answers: Record<string, unknown>;
  actionReason?: string;
  actionComment?: string;
}

interface CrmSeedInput extends QuoteSeedInput {
  crmStatus: CrmStatus;
  urgency: CrmUrgency;
  advisorId?: string;
  tags: string[];
}

const DEMO_ACTOR_ID = "local-demo-broker-seed";
const DEMO_VERSION = "local-demo-v1";
const RETENTION_UNTIL = new Date("2036-01-01T00:00:00.000Z");
const DATE_2026 = new Date("2026-05-03T09:00:00.000Z");

const GLOBAL_FLAGS = [
  "public_comparator_enabled",
  "quote_request_enabled",
  "starter_portal_enabled",
  "broker_dashboard_enabled"
] as const;

const SAFE_DISABLED_FLAGS = [
  "billing_enabled",
  "payments_enabled",
  "e_signature_enabled",
  "policy_issuance_enabled",
  "claims_enabled",
  "insurer_api_enabled",
  "whatsapp_enabled",
  "sponsored_offers_enabled",
  "multi_broker_routing_enabled",
  "ai_lead_scoring_enabled",
  "ai_summary_enabled",
  "ai_duplicate_detection_enabled",
  "ai_recommendation_enabled",
  "ai_broker_assistant_enabled"
] as const;

function parseArgs(argv: string[]): CliOptions {
  return {
    apply: argv.includes("--apply"),
    crmEnabled: !argv.includes("--crm-off"),
    allowDemoSeed: argv.includes("--allow-demo-seed")
  };
}

function assertLocalOnly(options: CliOptions): void {
  const appEnv = process.env.APP_ENV ?? "";
  if (appEnv === "production" || appEnv === "preproduction") {
    throw new Error("Refusing broker demo seed in production or preproduction");
  }
  if (appEnv !== "local" && !options.allowDemoSeed) {
    throw new Error("Refusing broker demo seed unless APP_ENV=local or --allow-demo-seed is provided");
  }
  if (!options.apply) return;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!process.env.LOCAL_DEMO_BROKER_PASSWORD || process.env.LOCAL_DEMO_BROKER_PASSWORD.length < 12) {
    throw new Error("LOCAL_DEMO_BROKER_PASSWORD must be set to a local-only password with 12+ characters");
  }
}

function daysAgo(days: number): Date {
  return new Date(DATE_2026.getTime() - days * 24 * 60 * 60 * 1000);
}

function futureDays(days: number): Date {
  return new Date(DATE_2026.getTime() + days * 24 * 60 * 60 * 1000);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  assertLocalOnly(options);
  if (!options.apply) {
    console.warn(JSON.stringify({
      dryRun: true,
      message: "Run with --apply after setting APP_ENV=local, DATABASE_URL and LOCAL_DEMO_BROKER_PASSWORD.",
      crmEnabled: options.crmEnabled
    }, null, 2));
    return;
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL as string) });
  try {
    const passwordHash = await new PasswordHashingService().hash(process.env.LOCAL_DEMO_BROKER_PASSWORD as string);

    await seedFlags(prisma, options.crmEnabled);
    const countries = await seedCountries(prisma);
    const products = await seedProducts(prisma);
    await seedCountryProducts(prisma, countries.ci, [products.auto, products.voyage]);
    await seedConsentAndForms(prisma, countries.ci, [products.auto, products.voyage]);

    const partners = await seedPartners(prisma);
    await seedPartnerCoverage(prisma, partners, countries.ci, [products.auto, products.voyage]);
    const users = await seedBrokerUsers(prisma, partners, passwordHash);
    const adminUsers = await seedAdminUsers(prisma, passwordHash);
    await seedOffers(prisma, partners, countries.ci, products);
    await seedStarterLeads(prisma, partners.starter, countries.ci, products);
    await seedCrmLeads(prisma, partners.pro, partners.enterprise, users, countries.ci, products);
    await audit(prisma, "local_demo_broker_seed.completed", "BrokerDemoSeed", "local-demo", "success", {
      crmEnabled: options.crmEnabled,
      seededUsers: users.map((user) => ({ email: user.email, role: user.role })),
      seededAdminUsers: adminUsers.map((user) => ({ email: user.email, role: user.role }))
    });
    const runtimeReloaded = await reloadLocalRuntimeFeatureFlags();

    console.warn(JSON.stringify({
      dryRun: false,
      crmEnabled: options.crmEnabled,
      runtimeReloaded,
      brokerUsers: users.map((user) => ({ email: user.email, role: user.role })),
      adminUsers: adminUsers.map((user) => ({ email: user.email, role: user.role })),
      note: "Synthetic local data only. Sensitive regulated modules remain disabled."
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

async function seedFlags(prisma: PrismaClient, crmEnabled: boolean): Promise<void> {
  for (const key of GLOBAL_FLAGS) {
    await upsertFlag(prisma, key, true, "local broker demo activation");
  }
  await upsertFlag(prisma, "broker_crm_enabled", crmEnabled, crmEnabled ? "local broker demo CRM enabled" : "local broker demo CRM disabled state");
  for (const key of SAFE_DISABLED_FLAGS) {
    await upsertFlag(prisma, key, false, "local broker demo safe disabled default");
  }
}

async function upsertFlag(prisma: PrismaClient, key: string, value: boolean, reason: string): Promise<void> {
  const existing = await prisma.featureFlag.findFirst({ where: { key, scopeType: "global", scopeId: null } });
  if (existing) {
    await prisma.featureFlag.update({
      where: { id: existing.id },
      data: { value, defaultValue: false, reason, changedAt: new Date(), cacheVersion: { increment: 1 } }
    });
    return;
  }
  await prisma.featureFlag.create({
    data: { key, scopeType: "global", value, defaultValue: false, reason }
  });
}

async function seedCountries(prisma: PrismaClient): Promise<{ ci: CountryRecord; sn: CountryRecord }> {
  const ci = await prisma.country.upsert({
    where: { isoCode: "CI" },
    create: {
      isoCode: "CI",
      name: "Cote d'Ivoire",
      currency: "XOF",
      languages: ["fr"],
      timezone: "Africa/Abidjan",
      regulatoryFamily: "cima",
      status: "public",
      flags: {
        country_public_enabled: true,
        country_quote_enabled: true,
        country_comparison_enabled: true,
        country_waitlist_enabled: false,
        country_broker_onboarding_enabled: false,
        country_ai_enabled: false
      },
      createdById: DEMO_ACTOR_ID
    },
    update: {
      status: "public",
      flags: {
        country_public_enabled: true,
        country_quote_enabled: true,
        country_comparison_enabled: true,
        country_waitlist_enabled: false,
        country_broker_onboarding_enabled: false,
        country_ai_enabled: false
      }
    }
  });
  const sn = await prisma.country.upsert({
    where: { isoCode: "SN" },
    create: {
      isoCode: "SN",
      name: "Senegal",
      currency: "XOF",
      languages: ["fr"],
      timezone: "Africa/Dakar",
      regulatoryFamily: "cima",
      status: "internal",
      flags: {
        country_public_enabled: false,
        country_quote_enabled: false,
        country_comparison_enabled: false,
        country_waitlist_enabled: true,
        country_broker_onboarding_enabled: false,
        country_ai_enabled: false
      },
      createdById: DEMO_ACTOR_ID
    },
    update: {
      status: "internal",
      flags: {
        country_public_enabled: false,
        country_quote_enabled: false,
        country_comparison_enabled: false,
        country_waitlist_enabled: true,
        country_broker_onboarding_enabled: false,
        country_ai_enabled: false
      }
    }
  });
  return { ci, sn };
}

async function seedProducts(prisma: PrismaClient): Promise<{ auto: ProductRecord; voyage: ProductRecord }> {
  const auto = await prisma.product.upsert({
    where: { key: "auto" },
    create: {
      key: "auto",
      name: "Assurance auto",
      description: "Produit indicatif local pour revue broker",
      sensitivity: "standard",
      requiresDocuments: false,
      requiresManualReview: false,
      status: "public",
      flags: publicProductFlags(false),
      createdById: DEMO_ACTOR_ID
    },
    update: { status: "public", flags: publicProductFlags(false), requiresManualReview: false }
  });
  const voyage = await prisma.product.upsert({
    where: { key: "voyage" },
    create: {
      key: "voyage",
      name: "Assurance voyage",
      description: "Produit indicatif local pour revue broker",
      sensitivity: "standard",
      requiresDocuments: false,
      requiresManualReview: false,
      status: "public",
      flags: publicProductFlags(false),
      createdById: DEMO_ACTOR_ID
    },
    update: { status: "public", flags: publicProductFlags(false), requiresManualReview: false }
  });
  return { auto, voyage };
}

function publicProductFlags(manualReview: boolean): Record<string, boolean> {
  return {
    product_public_enabled: true,
    product_quote_enabled: true,
    product_comparison_enabled: true,
    product_document_upload_enabled: false,
    product_sensitive_data_enabled: false,
    product_manual_review_required: manualReview,
    product_ai_scoring_enabled: false,
    product_ai_form_assistant_enabled: false
  };
}

async function seedCountryProducts(prisma: PrismaClient, country: CountryRecord, products: ProductRecord[]): Promise<void> {
  for (const product of products) {
    await prisma.countryProduct.upsert({
      where: { countryId_productId: { countryId: country.id, productId: product.id } },
      create: {
        countryId: country.id,
        productId: product.id,
        status: "public",
        flags: publicProductFlags(false),
        createdById: DEMO_ACTOR_ID
      },
      update: { status: "public", flags: publicProductFlags(false) }
    });
  }
}

async function seedConsentAndForms(prisma: PrismaClient, country: CountryRecord, products: ProductRecord[]): Promise<void> {
  for (const product of products) {
    const consentText = await prisma.consentText.upsert({
      where: {
        purpose_countryId_productId_channel_language_version: {
          purpose: "lead_transmission",
          countryId: country.id,
          productId: product.id,
          channel: "public_web",
          language: "fr",
          version: DEMO_VERSION
        }
      },
      create: {
        purpose: "lead_transmission",
        countryId: country.id,
        productId: product.id,
        channel: "public_web",
        recipientCategory: "courtier_partenaire_eligible",
        language: "fr",
        version: DEMO_VERSION,
        status: "published",
        contentHash: `${product.key}-${DEMO_VERSION}-lead-transmission`,
        publishedAt: DATE_2026,
        createdById: DEMO_ACTOR_ID
      },
      update: {
        status: "published",
        contentHash: `${product.key}-${DEMO_VERSION}-lead-transmission`,
        publishedAt: DATE_2026
      }
    });
    const existingForm = await prisma.quoteFormDefinition.findFirst({
      where: { countryId: country.id, productId: product.id, language: "fr", version: DEMO_VERSION }
    });
    const formData = {
      countryId: country.id,
      productId: product.id,
      language: "fr",
      version: DEMO_VERSION,
      status: "published" as const,
      fields: [
        { key: "usage", label: "Usage", type: "select", required: true, sensitivity: "public", options: ["personnel", "professionnel"] },
        { key: "budget", label: "Budget indicatif", type: "number", required: false, sensitivity: "public" }
      ],
      consentTextId: consentText.id,
      dataMinimizationNotes: "Donnees synthetiques locales minimales",
      publishedAt: DATE_2026,
      createdById: DEMO_ACTOR_ID
    };
    if (existingForm) await prisma.quoteFormDefinition.update({ where: { id: existingForm.id }, data: formData });
    else await prisma.quoteFormDefinition.create({ data: formData });
  }
}

async function seedPartners(prisma: PrismaClient): Promise<{ starter: PartnerRecord; pro: PartnerRecord; enterprise: PartnerRecord; blocked: PartnerRecord }> {
  const starter = await upsertPartner(prisma, {
    registrationNumber: "LOCAL-DEMO-STARTER",
    legalName: "Courtier Local Starter SARL",
    tradeName: "Starter Demo",
    plan: "starter",
    primaryEmail: "starter.office@broker.example",
    quotaMonthlyLeads: 30,
    capacityStatus: "available"
  });
  const pro = await upsertPartner(prisma, {
    registrationNumber: "LOCAL-DEMO-PRO",
    legalName: "Courtier Local Pro SARL",
    tradeName: "Pro Demo",
    plan: "pro",
    primaryEmail: "pro.office@broker.example",
    quotaMonthlyLeads: 120,
    capacityStatus: "available"
  });
  const enterprise = await upsertPartner(prisma, {
    registrationNumber: "LOCAL-DEMO-ENTERPRISE",
    legalName: "Courtier Local Enterprise SA",
    tradeName: "Enterprise Demo",
    plan: "enterprise",
    primaryEmail: "enterprise.office@broker.example",
    quotaMonthlyLeads: 500,
    capacityStatus: "limited"
  });
  const blocked = await upsertPartner(prisma, {
    registrationNumber: "LOCAL-DEMO-BLOCKED",
    legalName: "Courtier Local Licence Expiree",
    tradeName: "Blocked Demo",
    plan: "starter",
    primaryEmail: "blocked.office@broker.example",
    quotaMonthlyLeads: 5,
    capacityStatus: "blocked"
  });
  return { starter, pro, enterprise, blocked };
}

async function upsertPartner(prisma: PrismaClient, input: {
  registrationNumber: string;
  legalName: string;
  tradeName: string;
  plan: PartnerPlan;
  primaryEmail: string;
  quotaMonthlyLeads: number;
  capacityStatus: "available" | "limited" | "blocked";
}): Promise<PartnerRecord> {
  const existing = await prisma.partnerTenant.findFirst({ where: { registrationNumber: input.registrationNumber } });
  const data = {
    legalName: input.legalName,
    tradeName: input.tradeName,
    registrationNumber: input.registrationNumber,
    plan: input.plan,
    status: "active" as const,
    primaryEmail: input.primaryEmail,
    primaryWhatsApp: "+2250102030405",
    quotaMonthlyLeads: input.quotaMonthlyLeads,
    capacityStatus: input.capacityStatus,
    createdById: DEMO_ACTOR_ID
  };
  const partner = existing
    ? await prisma.partnerTenant.update({ where: { id: existing.id }, data })
    : await prisma.partnerTenant.create({ data });
  return { id: partner.id, legalName: partner.legalName, plan: partner.plan };
}

async function seedPartnerCoverage(prisma: PrismaClient, partners: Record<string, PartnerRecord>, country: CountryRecord, products: ProductRecord[]): Promise<void> {
  for (const partner of [partners.starter, partners.pro, partners.enterprise]) {
    await prisma.partnerCountryAuthorization.upsert({
      where: { partnerTenantId_countryId: { partnerTenantId: partner.id, countryId: country.id } },
      create: { partnerTenantId: partner.id, countryId: country.id, status: "active", createdById: DEMO_ACTOR_ID },
      update: { status: "active" }
    });
    for (const product of products) {
      await prisma.partnerProductAuthorization.upsert({
        where: { partnerTenantId_productId: { partnerTenantId: partner.id, productId: product.id } },
        create: { partnerTenantId: partner.id, productId: product.id, status: "active", createdById: DEMO_ACTOR_ID },
        update: { status: "active" }
      });
    }
    await upsertLicense(prisma, partner, country, products, partner.plan === "enterprise" ? futureDays(35) : new Date("2030-01-01T00:00:00.000Z"), "valid");
  }
  await upsertLicense(prisma, partners.blocked, country, products, new Date("2024-01-01T00:00:00.000Z"), "expired");
}

async function upsertLicense(prisma: PrismaClient, partner: PartnerRecord, country: CountryRecord, products: ProductRecord[], expirationDate: Date, status: "valid" | "expired"): Promise<void> {
  const licenseNumber = `LIC-${partner.id.slice(0, 8).toUpperCase()}`;
  const existing = await prisma.partnerLicense.findFirst({ where: { partnerTenantId: partner.id, countryId: country.id, licenseNumber } });
  const data = {
    partnerTenantId: partner.id,
    licenseNumber,
    issuingAuthority: "Regulateur Local Demo",
    countryId: country.id,
    productIds: products.map((product) => product.id),
    status,
    effectiveDate: new Date("2026-01-01T00:00:00.000Z"),
    expirationDate,
    validatedById: DEMO_ACTOR_ID,
    validatedAt: DATE_2026,
    createdById: DEMO_ACTOR_ID
  };
  if (existing) await prisma.partnerLicense.update({ where: { id: existing.id }, data });
  else await prisma.partnerLicense.create({ data });
}

async function seedBrokerUsers(prisma: PrismaClient, partners: { starter: PartnerRecord; pro: PartnerRecord; enterprise: PartnerRecord }, passwordHash: string): Promise<DemoUserRecord[]> {
  const users = [
    { email: "starter.owner@broker.example", displayName: "Awa Starter", role: "broker_owner_starter" as const, partner: partners.starter },
    { email: "pro.owner@broker.example", displayName: "Koffi Pro Owner", role: "broker_owner_pro" as const, partner: partners.pro },
    { email: "pro.manager@broker.example", displayName: "Mariam Manager", role: "broker_manager" as const, partner: partners.pro },
    { email: "pro.agent@broker.example", displayName: "Yao Agent", role: "broker_agent" as const, partner: partners.pro },
    { email: "pro.readonly@broker.example", displayName: "Nadia Read Only", role: "broker_read_only" as const, partner: partners.pro },
    { email: "enterprise.owner@broker.example", displayName: "Fatou Enterprise", role: "broker_owner_pro" as const, partner: partners.enterprise }
  ];
  const seeded: DemoUserRecord[] = [];
  for (const input of users) {
    const user = await prisma.user.upsert({
      where: { email: input.email },
      create: {
        email: input.email,
        displayName: input.displayName,
        status: "active",
        mfaStatus: "verified",
        passwordHash,
        passwordChangedAt: DATE_2026,
        passwordChangeRequired: false,
        partnerTenantId: input.partner.id,
        countryScopes: ["CI"],
        productScopes: ["auto", "voyage"],
        createdById: DEMO_ACTOR_ID
      },
      update: {
        displayName: input.displayName,
        status: "active",
        mfaStatus: "verified",
        passwordHash,
        passwordChangedAt: DATE_2026,
        passwordChangeRequired: false,
        partnerTenantId: input.partner.id,
        countryScopes: ["CI"],
        productScopes: ["auto", "voyage"]
      }
    });
    const role = await prisma.role.upsert({
      where: { key: input.role },
      create: { key: input.role, name: input.role, description: "Local demo broker role", isSystemRole: true },
      update: { name: input.role, description: "Local demo broker role", isSystemRole: true }
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id, reason: "local broker demo seed", createdById: DEMO_ACTOR_ID },
      update: { reason: "local broker demo seed" }
    });
    seeded.push({ id: user.id, email: user.email, role: input.role, partnerTenantId: input.partner.id });
  }
  return seeded;
}

async function seedAdminUsers(prisma: PrismaClient, passwordHash: string): Promise<AdminDemoUserRecord[]> {
  const users = [
    { email: "super.admin@assurmatch.local", displayName: "Super Admin Local", role: "super_admin" as const },
    { email: "country.admin@assurmatch.local", displayName: "Admin Pays Local", role: "admin_pays" as const },
    { email: "compliance.admin@assurmatch.local", displayName: "Compliance Local", role: "compliance_admin" as const },
    { email: "support.admin@assurmatch.local", displayName: "Support Local", role: "support_admin" as const },
    { email: "finance.admin@assurmatch.local", displayName: "Finance Local", role: "finance_admin" as const },
    { email: "content.admin@assurmatch.local", displayName: "Content Local", role: "content_admin" as const },
    { email: "ai.admin@assurmatch.local", displayName: "AI Local", role: "ai_admin" as const }
  ];
  const seeded: AdminDemoUserRecord[] = [];
  for (const input of users) {
    const user = await prisma.user.upsert({
      where: { email: input.email },
      create: {
        email: input.email,
        displayName: input.displayName,
        status: "active",
        mfaStatus: "verified",
        passwordHash,
        passwordChangedAt: DATE_2026,
        passwordChangeRequired: false,
        partnerTenantId: null,
        countryScopes: ["CI"],
        productScopes: ["auto", "voyage"],
        createdById: DEMO_ACTOR_ID
      },
      update: {
        displayName: input.displayName,
        status: "active",
        mfaStatus: "verified",
        passwordHash,
        passwordChangedAt: DATE_2026,
        passwordChangeRequired: false,
        partnerTenantId: null,
        countryScopes: ["CI"],
        productScopes: ["auto", "voyage"]
      }
    });
    const role = await prisma.role.upsert({
      where: { key: input.role },
      create: { key: input.role, name: input.role, description: "Local demo admin role", isSystemRole: true },
      update: { name: input.role, description: "Local demo admin role", isSystemRole: true }
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id, reason: "local admin demo seed", createdById: DEMO_ACTOR_ID },
      update: { reason: "local admin demo seed" }
    });
    seeded.push({ id: user.id, email: user.email, role: input.role });
  }
  return seeded;
}

async function seedOffers(prisma: PrismaClient, partners: { starter: PartnerRecord; pro: PartnerRecord; enterprise: PartnerRecord }, country: CountryRecord, products: { auto: ProductRecord; voyage: ProductRecord }): Promise<void> {
  await upsertOffer(prisma, country, products.auto, partners.starter, "local-demo-auto-essentiel", "Auto Essentiel Local", 45000, 75000);
  await upsertOffer(prisma, country, products.auto, partners.pro, "local-demo-auto-pro", "Auto Pro Local", 85000, 140000);
  await upsertOffer(prisma, country, products.voyage, partners.enterprise, "local-demo-voyage-enterprise", "Voyage Assistance Local", 18000, 45000);
}

async function upsertOffer(prisma: PrismaClient, country: CountryRecord, product: ProductRecord, partner: PartnerRecord, publicKey: string, name: string, min: number, max: number): Promise<void> {
  await prisma.offer.upsert({
    where: { countryId_productId_publicKey: { countryId: country.id, productId: product.id, publicKey } },
    create: {
      countryId: country.id,
      productId: product.id,
      partnerTenantId: partner.id,
      publicKey,
      name,
      shortDescription: "Offre indicative locale pour demonstration",
      guaranteeSummary: "Garanties principales a confirmer par le courtier partenaire",
      indicativePriceMin: min,
      indicativePriceMax: max,
      currency: "XOF",
      pricingUnit: "an",
      status: "active",
      validationStatus: "validated",
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validUntil: new Date("2030-01-01T00:00:00.000Z"),
      publicDisclaimers: ["offre indicative", "prix a confirmer par le courtier partenaire"],
      validatedById: DEMO_ACTOR_ID,
      validatedAt: DATE_2026,
      createdById: DEMO_ACTOR_ID
    },
    update: {
      partnerTenantId: partner.id,
      name,
      shortDescription: "Offre indicative locale pour demonstration",
      guaranteeSummary: "Garanties principales a confirmer par le courtier partenaire",
      indicativePriceMin: min,
      indicativePriceMax: max,
      status: "active",
      validationStatus: "validated",
      validUntil: new Date("2030-01-01T00:00:00.000Z"),
      publicDisclaimers: ["offre indicative", "prix a confirmer par le courtier partenaire"],
      validatedById: DEMO_ACTOR_ID,
      validatedAt: DATE_2026
    }
  });
}

async function seedStarterLeads(prisma: PrismaClient, partner: PartnerRecord, country: CountryRecord, products: { auto: ProductRecord; voyage: ProductRecord }): Promise<void> {
  const leads: QuoteSeedInput[] = [
    starterLead("starter-001", partner.id, country, products.auto, "Aminata Kone", "assigned", 1, { usage: "personnel", budget: 75000 }),
    starterLead("starter-002", partner.id, country, products.auto, "Jean Kouadio", "broker_notified", 2, { usage: "professionnel", budget: 110000 }),
    starterLead("starter-003", partner.id, country, products.voyage, "Moussa Traore", "seen", 5, { usage: "personnel", destination: "Senegal" }),
    starterLead("starter-004", partner.id, country, products.auto, "Grace Nguessan", "accepted", 8, { usage: "personnel", budget: 95000 }, "lead_quality"),
    starterLead("starter-005", partner.id, country, products.voyage, "Ibrahim Soro", "rejected", 12, { usage: "personnel", destination: "France" }, "wrong_scope"),
    starterLead("starter-006", partner.id, country, products.auto, "Sarah Bamba", "disputed", 15, { usage: "professionnel", budget: 65000 }, "duplicate", "Doublon local de demonstration")
  ];
  for (const lead of leads) await seedLead(prisma, lead);
}

function starterLead(key: string, partnerTenantId: string, country: CountryRecord, product: ProductRecord, prospectName: string, status: LeadStatus, assignedDaysAgo: number, answers: Record<string, unknown>, actionReason?: string, actionComment?: string): QuoteSeedInput {
  return {
    key,
    partnerTenantId,
    country,
    product,
    prospectName,
    email: `${key}@visitor.example`,
    phone: "+2250102030405",
    status,
    assignedDaysAgo,
    answers,
    actionReason,
    actionComment
  };
}

async function seedCrmLeads(prisma: PrismaClient, pro: PartnerRecord, enterprise: PartnerRecord, users: DemoUserRecord[], country: CountryRecord, products: { auto: ProductRecord; voyage: ProductRecord }): Promise<void> {
  const proAgent = users.find((user) => user.email === "pro.agent@broker.example");
  const proManager = users.find((user) => user.email === "pro.manager@broker.example");
  const crmLeads: CrmSeedInput[] = [
    crmLead("crm-001", pro.id, country, products.auto, "Cedric Tape", "nouveau", "urgent", proAgent?.id, 1),
    crmLead("crm-002", pro.id, country, products.auto, "Nadine Aka", "contacte", "high", proAgent?.id, 3),
    crmLead("crm-003", pro.id, country, products.voyage, "Pauline Ehui", "qualifie", "normal", proManager?.id, 4),
    crmLead("crm-004", pro.id, country, products.auto, "Arnaud Diarra", "documents_demandes", "high", proAgent?.id, 6),
    crmLead("crm-005", pro.id, country, products.auto, "Herve Bakayoko", "devis_en_preparation", "normal", proManager?.id, 9),
    crmLead("crm-006", pro.id, country, products.voyage, "Alice Toure", "devis_envoye", "normal", proAgent?.id, 11),
    crmLead("crm-007", pro.id, country, products.auto, "Marc Yapi", "negociation", "high", proManager?.id, 14),
    crmLead("crm-008", pro.id, country, products.auto, "Estelle Coulibaly", "gagne", "normal", proAgent?.id, 21, "accepted"),
    crmLead("crm-009", pro.id, country, products.voyage, "Boris Kouame", "perdu", "low", proManager?.id, 24, "closed"),
    crmLead("crm-010", pro.id, country, products.auto, "Chantal Zadi", "injoignable", "normal", proAgent?.id, 28),
    crmLead("crm-011", enterprise.id, country, products.auto, "Equipe Finance Demo", "qualifie", "high", undefined, 2),
    crmLead("crm-012", enterprise.id, country, products.voyage, "Direction RH Demo", "devis_envoye", "normal", undefined, 7)
  ];
  for (const lead of crmLeads) {
    const assignment = await seedLead(prisma, lead);
    await seedCrmState(prisma, assignment.id, lead);
    await seedCrmActivity(prisma, assignment.id, lead);
  }
}

function crmLead(key: string, partnerTenantId: string, country: CountryRecord, product: ProductRecord, prospectName: string, crmStatus: CrmStatus, urgency: CrmUrgency, advisorId: string | undefined, assignedDaysAgo: number, status: LeadStatus = "accepted"): CrmSeedInput {
  return {
    key,
    partnerTenantId,
    country,
    product,
    prospectName,
    email: `${key}@visitor.example`,
    phone: "+2250102030405",
    status,
    assignedDaysAgo,
    crmStatus,
    urgency,
    advisorId,
    tags: [product.key, urgency],
    answers: product.key === "auto"
      ? { usage: "professionnel", budget: 125000, vehicle_count: key.endsWith("1") ? 3 : 1 }
      : { usage: "personnel", destination: "CEDEAO", departure_month: "juin" }
  };
}

async function seedLead(prisma: PrismaClient, input: QuoteSeedInput): Promise<{ id: string; quoteRequestId: string }> {
  const form = await prisma.quoteFormDefinition.findFirstOrThrow({
    where: { countryId: input.country.id, productId: input.product.id, language: "fr", version: DEMO_VERSION }
  });
  const consentText = await prisma.consentText.findFirstOrThrow({
    where: { countryId: input.country.id, productId: input.product.id, purpose: "lead_transmission", channel: "public_web", language: "fr", version: DEMO_VERSION }
  });
  const prospect = await upsertProspect(prisma, input);
  const consentRecord = await upsertConsentRecord(prisma, input, consentText.id);
  const publicReference = `LOCAL-${input.key.toUpperCase()}`;
  const quoteRequest = await prisma.quoteRequest.upsert({
    where: { publicReference },
    create: {
      publicReference,
      verificationTokenHash: `${input.key}-verification-token-hash`,
      countryId: input.country.id,
      productId: input.product.id,
      quoteFormDefinitionId: form.id,
      prospectId: prospect.id,
      consentRecordId: consentRecord.id,
      source: "local_demo_seed",
      payload: jsonObject({ contact: contactPayload(input), answers: input.answers }),
      status: "routed",
      duplicateStatus: "unique",
      routingStatus: "assigned",
      correlationId: `local-demo-${input.key}`,
      retentionUntil: RETENTION_UNTIL,
      createdAt: daysAgo(input.assignedDaysAgo),
      updatedAt: daysAgo(input.assignedDaysAgo)
    },
    update: {
      countryId: input.country.id,
      productId: input.product.id,
      quoteFormDefinitionId: form.id,
      prospectId: prospect.id,
      consentRecordId: consentRecord.id,
      payload: jsonObject({ contact: contactPayload(input), answers: input.answers }),
      status: "routed",
      duplicateStatus: "unique",
      routingStatus: "assigned",
      updatedAt: daysAgo(input.assignedDaysAgo)
    }
  });
  const decision = await upsertRoutingDecision(prisma, quoteRequest.id, input);
  const existing = await prisma.leadAssignment.findFirst({ where: { quoteRequestId: quoteRequest.id } });
  const assignedAt = daysAgo(input.assignedDaysAgo);
  const actionAt = input.status === "assigned" || input.status === "broker_notified" ? undefined : futureFrom(assignedAt, 4);
  const assignmentData = {
    quoteRequestId: quoteRequest.id,
    partnerTenantId: input.partnerTenantId,
    status: input.status,
    assignedAt,
    assignmentReason: "local_demo_eligible_broker",
    routingDecisionId: decision.id,
    seenAt: input.status === "seen" || input.status === "accepted" || input.status === "rejected" || input.status === "disputed" || input.status === "closed" ? actionAt : undefined,
    seenById: actionAt ? DEMO_ACTOR_ID : undefined,
    acceptedAt: input.status === "accepted" ? actionAt : undefined,
    rejectedAt: input.status === "rejected" ? actionAt : undefined,
    disputedAt: input.status === "disputed" ? actionAt : undefined,
    actionReason: input.actionReason,
    actionComment: input.actionComment,
    lastBrokerActionById: actionAt ? DEMO_ACTOR_ID : undefined,
    lastBrokerActionAt: actionAt,
    createdAt: assignedAt,
    updatedAt: actionAt ?? assignedAt
  };
  const assignment = existing
    ? await prisma.leadAssignment.update({ where: { id: existing.id }, data: assignmentData })
    : await prisma.leadAssignment.create({ data: assignmentData });
  await upsertLeadHistory(prisma, assignment.id, input, assignedAt, actionAt);
  await upsertBrokerNotification(prisma, assignment.id, input);
  return { id: assignment.id, quoteRequestId: quoteRequest.id };
}

async function upsertProspect(prisma: PrismaClient, input: QuoteSeedInput): Promise<{ id: string }> {
  const existing = await prisma.prospect.findFirst({ where: { emailNormalized: input.email.toLowerCase(), countryId: input.country.id, productId: input.product.id } });
  const data = {
    countryId: input.country.id,
    productId: input.product.id,
    emailNormalized: input.email.toLowerCase(),
    phoneNormalized: input.phone,
    emailFingerprint: `local-demo:${input.email.toLowerCase()}`,
    phoneFingerprint: `local-demo:${input.phone}`,
    displayName: input.prospectName,
    preferredContactChannel: "email",
    consentRecordIds: [] as string[],
    retentionUntil: RETENTION_UNTIL
  };
  if (existing) return prisma.prospect.update({ where: { id: existing.id }, data });
  return prisma.prospect.create({ data });
}

async function upsertConsentRecord(prisma: PrismaClient, input: QuoteSeedInput, consentTextId: string): Promise<{ id: string }> {
  const subjectReference = `local-demo:${input.key}`;
  const existing = await prisma.consentRecord.findFirst({ where: { subjectReference, purpose: "lead_transmission", countryId: input.country.id, productId: input.product.id } });
  const data = {
    consentTextId,
    subjectReference,
    purpose: "lead_transmission" as const,
    countryId: input.country.id,
    productId: input.product.id,
    channel: "public_web" as const,
    intendedRecipient: input.partnerTenantId,
    status: "granted" as const,
    grantedAt: daysAgo(input.assignedDaysAgo),
    retentionUntil: RETENTION_UNTIL,
    createdById: DEMO_ACTOR_ID
  };
  if (existing) return prisma.consentRecord.update({ where: { id: existing.id }, data });
  return prisma.consentRecord.create({ data });
}

async function upsertRoutingDecision(prisma: PrismaClient, quoteRequestId: string, input: QuoteSeedInput): Promise<{ id: string }> {
  const existing = await prisma.routingDecision.findFirst({ where: { quoteRequestId } });
  const data = {
    quoteRequestId,
    result: "assigned",
    selectedPartnerTenantId: input.partnerTenantId,
    candidateCount: 1,
    excludedCandidates: [],
    reasons: ["local_demo_eligible_broker"],
    correlationId: `local-demo-${input.key}`,
    createdAt: daysAgo(input.assignedDaysAgo)
  };
  if (existing) return prisma.routingDecision.update({ where: { id: existing.id }, data });
  return prisma.routingDecision.create({ data });
}

async function upsertLeadHistory(prisma: PrismaClient, leadAssignmentId: string, input: QuoteSeedInput, assignedAt: Date, actionAt?: Date): Promise<void> {
  await upsertHistoryEvent(prisma, leadAssignmentId, input.partnerTenantId, `${leadAssignmentId}:assigned`, "assigned", undefined, "assigned", assignedAt);
  if (input.status !== "assigned" && input.status !== "broker_notified" && actionAt) {
    await upsertHistoryEvent(prisma, leadAssignmentId, input.partnerTenantId, `${leadAssignmentId}:${input.status}`, statusToEvent(input.status), "assigned", input.status, actionAt, input.actionReason, input.actionComment);
  }
}

async function upsertHistoryEvent(prisma: PrismaClient, leadAssignmentId: string, partnerTenantId: string, id: string, eventType: string, previousStatus: string | undefined, nextStatus: string | undefined, occurredAt: Date, reason?: string, comment?: string): Promise<void> {
  await prisma.leadActionHistory.upsert({
    where: { id },
    create: { id, leadAssignmentId, partnerTenantId, actorId: DEMO_ACTOR_ID, eventType, previousStatus, nextStatus, reason, comment, context: { source: "local_demo_seed" }, occurredAt },
    update: { eventType, previousStatus, nextStatus, reason, comment, context: { source: "local_demo_seed" }, occurredAt }
  });
}

function statusToEvent(status: LeadStatus): string {
  if (status === "seen") return "viewed";
  return status;
}

async function upsertBrokerNotification(prisma: PrismaClient, leadAssignmentId: string, input: QuoteSeedInput): Promise<void> {
  const existing = await prisma.notification.findFirst({ where: { payloadReference: leadAssignmentId, type: "broker_lead_assigned" } });
  const data = {
    type: "broker_lead_assigned" as const,
    recipientScope: `partner:${input.partnerTenantId}`,
    whatsAppStatus: "pending" as const,
    emailStatus: "sent" as const,
    payloadReference: leadAssignmentId,
    retryCount: 0,
    createdById: DEMO_ACTOR_ID
  };
  const notification = existing
    ? await prisma.notification.update({ where: { id: existing.id }, data })
    : await prisma.notification.create({ data });
  await prisma.leadAssignment.update({ where: { id: leadAssignmentId }, data: { brokerNotificationId: notification.id } });
}

async function seedCrmState(prisma: PrismaClient, leadAssignmentId: string, input: CrmSeedInput): Promise<void> {
  await prisma.brokerCrmLeadState.upsert({
    where: { leadAssignmentId },
    create: {
      leadAssignmentId,
      partnerTenantId: input.partnerTenantId,
      status: input.crmStatus,
      urgency: input.urgency,
      source: "quote_request",
      assignedAdvisorId: input.advisorId,
      tags: input.tags,
      createdById: DEMO_ACTOR_ID
    },
    update: {
      partnerTenantId: input.partnerTenantId,
      status: input.crmStatus,
      urgency: input.urgency,
      source: "quote_request",
      assignedAdvisorId: input.advisorId,
      tags: input.tags
    }
  });
  await prisma.brokerCrmPipelineHistory.upsert({
    where: { id: `${leadAssignmentId}:pipeline` },
    create: {
      id: `${leadAssignmentId}:pipeline`,
      leadAssignmentId,
      partnerTenantId: input.partnerTenantId,
      actorId: input.advisorId ?? DEMO_ACTOR_ID,
      nextStatus: input.crmStatus,
      occurredAt: daysAgo(Math.max(input.assignedDaysAgo - 1, 0))
    },
    update: {
      partnerTenantId: input.partnerTenantId,
      actorId: input.advisorId ?? DEMO_ACTOR_ID,
      nextStatus: input.crmStatus,
      occurredAt: daysAgo(Math.max(input.assignedDaysAgo - 1, 0))
    }
  });
}

async function seedCrmActivity(prisma: PrismaClient, leadAssignmentId: string, input: CrmSeedInput): Promise<void> {
  await prisma.brokerCrmNote.upsert({
    where: { id: `${leadAssignmentId}:note` },
    create: {
      id: `${leadAssignmentId}:note`,
      leadAssignmentId,
      partnerTenantId: input.partnerTenantId,
      authorId: input.advisorId,
      body: "Note locale: prospect a rappeler et informations a confirmer par le courtier partenaire.",
      createdAt: daysAgo(Math.max(input.assignedDaysAgo - 1, 0))
    },
    update: {
      authorId: input.advisorId,
      body: "Note locale: prospect a rappeler et informations a confirmer par le courtier partenaire."
    }
  });
  await prisma.brokerCrmTask.upsert({
    where: { id: `${leadAssignmentId}:task` },
    create: {
      id: `${leadAssignmentId}:task`,
      leadAssignmentId,
      partnerTenantId: input.partnerTenantId,
      assigneeId: input.advisorId,
      title: input.crmStatus === "injoignable" ? "Tenter un nouvel appel" : "Qualifier la demande",
      dueAt: input.urgency === "urgent" ? daysAgo(1) : futureDays(3),
      createdById: DEMO_ACTOR_ID,
      createdAt: daysAgo(input.assignedDaysAgo),
      updatedAt: DATE_2026
    },
    update: {
      assigneeId: input.advisorId,
      title: input.crmStatus === "injoignable" ? "Tenter un nouvel appel" : "Qualifier la demande",
      dueAt: input.urgency === "urgent" ? daysAgo(1) : futureDays(3),
      updatedAt: DATE_2026
    }
  });
  await prisma.brokerCrmReminder.upsert({
    where: { id: `${leadAssignmentId}:reminder` },
    create: {
      id: `${leadAssignmentId}:reminder`,
      leadAssignmentId,
      partnerTenantId: input.partnerTenantId,
      assigneeId: input.advisorId,
      remindAt: futureDays(2),
      message: "Relance locale a valider humainement.",
      createdById: DEMO_ACTOR_ID,
      createdAt: daysAgo(input.assignedDaysAgo)
    },
    update: {
      assigneeId: input.advisorId,
      remindAt: futureDays(2),
      message: "Relance locale a valider humainement."
    }
  });
  if (["documents_demandes", "devis_en_preparation", "devis_envoye", "negociation", "gagne"].includes(input.crmStatus)) {
    await prisma.brokerCrmDocument.upsert({
      where: { id: `${leadAssignmentId}:document` },
      create: {
        id: `${leadAssignmentId}:document`,
        leadAssignmentId,
        partnerTenantId: input.partnerTenantId,
        label: "Piece locale recue",
        storageKey: `local-demo/${leadAssignmentId}/document.pdf`,
        visibility: "internal",
        uploadedById: input.advisorId,
        createdAt: daysAgo(Math.max(input.assignedDaysAgo - 2, 0))
      },
      update: {
        label: "Piece locale recue",
        storageKey: `local-demo/${leadAssignmentId}/document.pdf`,
        visibility: "internal",
        uploadedById: input.advisorId
      }
    });
  }
  if (["devis_envoye", "negociation", "gagne"].includes(input.crmStatus)) {
    await prisma.brokerCrmProposal.upsert({
      where: { id: `${leadAssignmentId}:proposal` },
      create: {
        id: `${leadAssignmentId}:proposal`,
        leadAssignmentId,
        partnerTenantId: input.partnerTenantId,
        reference: `PROP-${input.key.toUpperCase()}`,
        amountIndicative: 95000,
        currency: "XOF",
        notes: "Montant indicatif local, a confirmer par le courtier partenaire.",
        nonContractual: true,
        createdById: DEMO_ACTOR_ID,
        createdAt: daysAgo(Math.max(input.assignedDaysAgo - 3, 0))
      },
      update: {
        amountIndicative: 95000,
        notes: "Montant indicatif local, a confirmer par le courtier partenaire.",
        nonContractual: true
      }
    });
  }
  if (input.crmStatus === "perdu") {
    await prisma.brokerCrmDispute.upsert({
      where: { id: `${leadAssignmentId}:dispute` },
      create: {
        id: `${leadAssignmentId}:dispute`,
        leadAssignmentId,
        partnerTenantId: input.partnerTenantId,
        reason: "client_abandoned",
        comment: "Cas local de suivi commercial perdu.",
        status: "opened",
        createdById: DEMO_ACTOR_ID,
        createdAt: daysAgo(Math.max(input.assignedDaysAgo - 2, 0)),
        updatedAt: DATE_2026
      },
      update: {
        reason: "client_abandoned",
        comment: "Cas local de suivi commercial perdu.",
        status: "opened",
        updatedAt: DATE_2026
      }
    });
  }
}

function contactPayload(input: QuoteSeedInput): Record<string, string> {
  return {
    displayName: input.prospectName,
    email: input.email,
    phone: input.phone
  };
}

function futureFrom(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

async function audit(prisma: PrismaClient, action: string, targetType: string, targetId: string, result: "success" | "refused" | "failed", context: Record<string, unknown>): Promise<void> {
  await prisma.auditLog.create({
    data: {
      id: randomUUID(),
      actorId: DEMO_ACTOR_ID,
      action,
      targetType,
      targetId,
      scope: jsonObject({ environment: "local" }),
      result,
      reason: "local broker demo seed",
      context: jsonObject(context),
      correlationId: "local-demo-broker-seed",
      retentionUntil: RETENTION_UNTIL
    }
  });
}

function jsonObject(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

async function reloadLocalRuntimeFeatureFlags(): Promise<boolean> {
  const apiBaseUrl = process.env.ASSURMATCH_LOCAL_API_URL ?? process.env.API_BASE_URL ?? "http://127.0.0.1:3600";
  try {
    const response = await fetch(`${apiBaseUrl}/local/dev/reload-feature-flags`, {
      method: "POST",
      headers: { "x-assurmatch-local-dev": "broker-demo-seed" }
    });
    return response.ok;
  } catch {
    return false;
  }
}

main().catch((error: unknown) => {
  console.error("[seed-broker-demo] Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
