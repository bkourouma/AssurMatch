// AssurMatch reference seed (idempotent).
//
// Reads JSON files in scripts/preprod/seeds/reference/ and upserts countries,
// regulatory regimes, product categories, products and global feature flag defaults.
// Currencies and languages are kept as reference JSON only (no schema model).
//
// Spec 050 R13:
// - country and product flags and status are written on creation only: a rerun never reopens or
//   closes anything an admin changed (it used to rewrite the flags on every run);
// - the phone rule of a country is only filled when the country has none yet;
// - pilot links CI/SN x auto/voyage are created when absent (status internal, flags closed,
//   manual review on);
// - draft lead_transmission consent texts (FR and EN, no product) are created per pilot country
//   from consent-templates.json, with the server-side hash, when absent. Publication stays a
//   compliance act in the back-office.
//
// Refuses to run when NODE_ENV=test to protect the test database.
//
// Usage:
//   node --import tsx scripts/preprod/seed-reference.ts            # apply
//   node --import tsx scripts/preprod/seed-reference.ts --dry-run  # plan only

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type CountryStatus, type RegulatoryFamily } from "@prisma/client";
import { COUNTRY_PRODUCT_LINK_DEFAULT_FLAGS } from "../../packages/shared/contracts/catalog.contracts";
import { consentContentHash } from "../../packages/shared/contracts/consent-content";

/** Countries prepared for the first openings (links and draft consent texts). */
const PILOT_COUNTRIES = ["CI", "SN"] as const;
const PILOT_PRODUCTS = ["auto", "voyage"] as const;
const TEMPLATE_CONSENT_VERSION = "template-v1";
const TEMPLATE_RECIPIENT_CATEGORY = "courtier_partenaire_agree";

interface CountrySeed {
  isoCode: string;
  name: string;
  currency: string;
  languages: string[];
  timezone: string;
  regulatoryFamily: string;
  phoneDialCode?: string;
  phoneNationalLengths?: number[];
  status: string;
  flags: Record<string, boolean>;
}

interface ConsentTemplateSeed {
  templateKey: string;
  purpose: string;
  language: string;
  bodyTemplate: string;
}

interface RegulatoryRegimeSeed {
  key: string;
  name: string;
  scope?: string;
  notes?: string;
}

interface ProductCategorySeed {
  key: string;
  name: string;
}

interface ProductSeed {
  key: string;
  name: string;
  category: string;
  defaultFlags: Record<string, boolean>;
}

interface FeatureFlagDefaults {
  global: Record<string, boolean>;
  country: Record<string, boolean>;
  product: Record<string, boolean>;
}

function readJson<T>(filename: string): T {
  const path = resolve(process.cwd(), "scripts/preprod/seeds/reference", filename);
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as T;
}

function isDryRun(): boolean {
  return process.argv.includes("--dry-run");
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "test") {
    console.error("[seed-reference] Refusing to run with NODE_ENV=test");
    process.exit(2);
  }
  const dryRun = isDryRun();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[seed-reference] DATABASE_URL is required");
    process.exit(2);
  }
  const adapter = new PrismaPg(databaseUrl);
  const prisma = new PrismaClient({ adapter });
  try {
    const countries = readJson<CountrySeed[]>("countries.json");
    const regimes = readJson<RegulatoryRegimeSeed[]>("regulatory-regimes.json");
    const categories = readJson<ProductCategorySeed[]>("product-categories.json");
    const products = readJson<ProductSeed[]>("products.json");
    const flagDefaults = readJson<FeatureFlagDefaults>("feature-flags.defaults.json");
    const consentTemplates = readJson<ConsentTemplateSeed[]>("consent-templates.json").filter((template) => template.purpose === "lead_transmission");

    console.warn(`[seed-reference] Plan: ${countries.length} countries, ${regimes.length} regimes, ${categories.length} categories, ${products.length} products, ${PILOT_COUNTRIES.length * PILOT_PRODUCTS.length} pilot links, ${consentTemplates.length} consent templates per pilot country${dryRun ? " (dry-run)" : ""}`);

    if (dryRun) return;

    for (const regime of regimes) {
      await prisma.regulatoryRegime.upsert({
        where: { key: regime.key },
        update: { name: regime.name, ...(regime.notes ? { description: regime.notes } : {}) },
        create: { key: regime.key, name: regime.name, ...(regime.notes ? { description: regime.notes } : {}) }
      });
    }

    for (const category of categories) {
      await prisma.productCategory.upsert({
        where: { key: category.key },
        update: { name: category.name },
        create: { key: category.key, name: category.name }
      });
    }

    const cimaRegime = await prisma.regulatoryRegime.findUnique({ where: { key: "cima" } });
    for (const country of countries) {
      const regulatoryFamily = country.regulatoryFamily as RegulatoryFamily;
      const regime = country.regulatoryFamily === "cima" && cimaRegime ? { regulatoryRegimeId: cimaRegime.id } : {};
      const existing = await prisma.country.findUnique({ where: { isoCode: country.isoCode } });
      if (existing) {
        // Rerun: descriptive data only. Flags and status belong to the admin from now on.
        await prisma.country.update({
          where: { isoCode: country.isoCode },
          data: {
            name: country.name,
            currency: country.currency,
            languages: [...new Set([...existing.languages, ...country.languages])],
            timezone: country.timezone,
            regulatoryFamily,
            ...(existing.regulatoryRegimeId ? {} : regime),
            ...(!existing.phoneDialCode && country.phoneDialCode
              ? { phoneDialCode: country.phoneDialCode, phoneNationalLengths: country.phoneNationalLengths ?? [] }
              : {})
          }
        });
      } else {
        await prisma.country.create({
          data: {
            isoCode: country.isoCode,
            name: country.name,
            currency: country.currency,
            languages: country.languages,
            timezone: country.timezone,
            regulatoryFamily,
            status: country.status as CountryStatus,
            flags: country.flags as object,
            ...(country.phoneDialCode ? { phoneDialCode: country.phoneDialCode, phoneNationalLengths: country.phoneNationalLengths ?? [] } : {}),
            ...regime
          }
        });
      }
    }

    const categoryByKey = new Map<string, string>();
    for (const category of await prisma.productCategory.findMany()) {
      categoryByKey.set(category.key, category.id);
    }
    for (const product of products) {
      const categoryId = categoryByKey.get(product.category) ?? null;
      await prisma.product.upsert({
        where: { key: product.key },
        // Rerun: name and category only; flags and status are never rewritten.
        update: {
          name: product.name,
          ...(categoryId ? { categoryId } : {})
        },
        create: {
          key: product.key,
          name: product.name,
          flags: product.defaultFlags as object,
          ...(categoryId ? { categoryId } : {})
        }
      });
    }

    for (const isoCode of PILOT_COUNTRIES) {
      const country = await prisma.country.findUnique({ where: { isoCode } });
      if (!country) continue;
      for (const key of PILOT_PRODUCTS) {
        const product = await prisma.product.findUnique({ where: { key } });
        if (!product) continue;
        const link = await prisma.countryProduct.findUnique({ where: { countryId_productId: { countryId: country.id, productId: product.id } } });
        if (!link) {
          await prisma.countryProduct.create({
            data: { countryId: country.id, productId: product.id, status: "internal", flags: { ...COUNTRY_PRODUCT_LINK_DEFAULT_FLAGS } }
          });
        }
      }
      for (const template of consentTemplates) {
        const content = template.bodyTemplate;
        const existingText = await prisma.consentText.findFirst({
          where: {
            purpose: "lead_transmission",
            countryId: country.id,
            productId: null,
            channel: "public_web",
            language: template.language,
            version: TEMPLATE_CONSENT_VERSION
          }
        });
        if (!existingText) {
          await prisma.consentText.create({
            data: {
              purpose: "lead_transmission",
              countryId: country.id,
              channel: "public_web",
              recipientCategory: TEMPLATE_RECIPIENT_CATEGORY,
              language: template.language,
              version: TEMPLATE_CONSENT_VERSION,
              status: "draft",
              content,
              contentHash: consentContentHash(content)
            }
          });
        }
      }
    }

    for (const [key, defaultValue] of Object.entries(flagDefaults.global)) {
      const existing = await prisma.featureFlag.findFirst({ where: { key, scopeType: "global", scopeId: null } });
      if (!existing) {
        await prisma.featureFlag.create({
          data: {
            key,
            scopeType: "global",
            value: defaultValue,
            defaultValue,
            reason: "seeded reference defaults"
          }
        });
      }
    }

    console.warn("[seed-reference] Done.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("[seed-reference] Failed:", error);
  process.exit(1);
});
