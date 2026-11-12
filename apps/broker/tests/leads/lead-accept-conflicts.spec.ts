import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

/** Lot 6 codes of the Starter accept refusal: the broker reads why (never a generic conflict). */
function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("lead actions map the 409 accept codes to dedicated outcomes", () => {
  const actions = source("apps/broker/app/lib/lead-actions.ts");
  expect(actions).toContain("result.code === \"LEAD_ALREADY_ACCEPTED\") return \"already_accepted\"");
  expect(actions).toContain("result.code === \"LEAD_STATUS_NOT_ACCEPTABLE\") return \"not_acceptable\"");
});

test("the Starter and CRM lead pages word every 409 outcome", () => {
  for (const path of ["apps/broker/app/leads/[leadAssignmentId]/page.tsx", "apps/broker/app/crm/leads/[leadAssignmentId]/page.tsx"]) {
    const page = source(path);
    expect(page, path).toContain("already_accepted: {");
    expect(page, path).toContain("not_acceptable: {");
    expect(page, path).toContain("conflict: {");
  }
});
