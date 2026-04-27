// AssurMatch reference seed (idempotent).
//
// Reads JSON files in scripts/preprod/seeds/reference/ and upserts countries,
// regulatory regimes, product categories, products and global feature flag defaults.
// Currencies and languages are kept as reference JSON only (no schema model).
//
// Refuses to run when NODE_ENV=test to protect the test database.
//
// Usage:
//   node --import tsx scripts/preprod/seed-reference.ts            # apply
//   node --import tsx scripts/preprod/seed-reference.ts --dry-run  # plan only

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

interface CountrySeed {
  isoCode: string;
  name: string;
  currency: string;
  languages: string[];
  timezone: string;
  regulatoryFamily: string;
  status: string;
  flags: Record<string, boolean>;
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
  const prisma = new PrismaClient();
  try {
    const countries = readJson<CountrySeed[]>("countries.json");
    const regimes = readJson<RegulatoryRegimeSeed[]>("regulatory-regimes.json");
    const categories = readJson<ProductCategorySeed[]>("product-categories.json");
    const products = readJson<ProductSeed[]>("products.json");
    const flagDefaults = readJson<FeatureFlagDefaults>("feature-flags.defaults.json");

    console.warn(`[seed-reference] Plan: ${countries.length} countries, ${regimes.length} regimes, ${categories.length} categories, ${products.length} products${dryRun ? " (dry-run)" : ""}`);

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
      const regulatoryFamily = country.regulatoryFamily as "cima" | "fanaf" | "domestic";
      await prisma.country.upsert({
        where: { isoCode: country.isoCode },
        update: {
          name: country.name,
          currency: country.currency,
          languages: country.languages,
          timezone: country.timezone,
          regulatoryFamily,
          flags: country.flags as object,
          ...(country.regulatoryFamily === "cima" && cimaRegime ? { regulatoryRegimeId: cimaRegime.id } : {})
        },
        create: {
          isoCode: country.isoCode,
          name: country.name,
          currency: country.currency,
          languages: country.languages,
          timezone: country.timezone,
          regulatoryFamily,
          flags: country.flags as object,
          ...(country.regulatoryFamily === "cima" && cimaRegime ? { regulatoryRegimeId: cimaRegime.id } : {})
        }
      });
    }

    const categoryByKey = new Map<string, string>();
    for (const category of await prisma.productCategory.findMany()) {
      categoryByKey.set(category.key, category.id);
    }
    for (const product of products) {
      const categoryId = categoryByKey.get(product.category) ?? null;
      await prisma.product.upsert({
        where: { key: product.key },
        update: {
          name: product.name,
          flags: product.defaultFlags as object,
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
