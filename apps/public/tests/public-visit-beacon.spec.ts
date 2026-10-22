import { expect, test } from "@playwright/test";
import { VISIT_PAGE_KEYS } from "../../../packages/shared/contracts/visit-stats.contracts";
import { publicFile, publicPage, readSource } from "./helpers/public-sources";

// Spec 073 FR-008 (hypothesis H5): the visit beacon is a UI-less client component that counts one
// page view per navigation, with no cookie, no storage and nothing but a closed page key.
const beacon = readSource(publicFile("components/site/visit-beacon.tsx"));
const keys = readSource(publicFile("lib/visit-page-key.ts"));
const layout = readSource(publicPage("layout.tsx"));

test("the beacon is mounted once in the root locale layout", () => {
  expect(layout).toContain('import { VisitBeacon } from "../components/site/visit-beacon"');
  expect(layout.match(/<VisitBeacon \/>/g)).toHaveLength(1);
});

test("the beacon respects Do Not Track and stays silent on failure", () => {
  expect(beacon).toContain('"use client"');
  expect(beacon).toContain('navigator.doNotTrack === "1"');
  expect(beacon).toContain(".catch(() => undefined)");
  expect(beacon).toContain("keepalive: true");
  expect(beacon).toContain("return null;");
});

test("the beacon uses no cookie, no storage and sends only the page key", () => {
  for (const forbidden of ["document.cookie", "localStorage", "sessionStorage", "indexedDB", "location.href", "location.search", "document.referrer", "useSearchParams"]) {
    expect(beacon, forbidden).not.toContain(forbidden);
  }
  expect(beacon).toContain('credentials: "omit"');
  expect(beacon).toContain("body: JSON.stringify({ page: visitPageKey(pathname");
  expect(beacon).toContain("/public-stats/visits");
});

test("the page keys are the closed list of the shared contract", () => {
  for (const key of VISIT_PAGE_KEYS) expect(keys, key).toContain(`"${key}"`);
});
