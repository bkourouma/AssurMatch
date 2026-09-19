import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { publicFile, publicPage, publicPageFiles, readSources } from "./helpers/public-sources";

test("every page under [locale] exports generateMetadata or a static metadata object", () => {
  const pages = publicPageFiles();
  expect(pages.length).toBeGreaterThan(20);

  const missing = pages.filter((path) => {
    const source = readSources([path]);
    return !source.includes("export async function generateMetadata") && !source.includes("export const metadata") && !source.includes("export function generateMetadata");
  });

  expect(missing).toEqual([]);
});

test("sitemap.ts and robots.ts exist and are wired to the public catalogue", () => {
  expect(existsSync("apps/public/app/sitemap.ts")).toBe(true);
  expect(existsSync("apps/public/app/robots.ts")).toBe(true);

  const sitemap = readSources([publicFile("sitemap.ts")]);
  const robots = readSources([publicFile("robots.ts")]);

  expect(sitemap).toContain("export default async function sitemap");
  expect(sitemap).toContain("listCountryDirectory");
  expect(robots).toContain("export default function robots");
  expect(robots).toContain("siteUrl");
});

test("the offer detail page emits offer structured data", () => {
  const page = readSources([publicPage("offers/[offerId]/page.tsx")]);
  expect(page).toContain("offerJsonLd");
  expect(page).toContain("<JsonLd");
});

test("the product page emits FAQ structured data", () => {
  const page = readSources([publicPage("countries/[countryCode]/products/[productKey]/page.tsx")]);
  expect(page).toContain("faqJsonLd");
  expect(page).toContain("<JsonLd");
});

test("the broker detail page emits local-business structured data", () => {
  const page = readSources([publicPage("countries/[countryCode]/brokers/[partnerId]/page.tsx")]);
  expect(page).toContain("localBusinessJsonLd");
  expect(page).toContain("<JsonLd");
});
