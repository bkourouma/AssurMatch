import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("admin routing page exposes rules, manual queue and reassignment through the admin API", () => {
  const api = source("apps/admin/app/lib/admin-api.ts");
  const page = source("apps/admin/app/routing/page.tsx");
  const forms = source("apps/admin/app/routing/routing-forms.tsx");
  const actions = source("apps/admin/app/routing/actions.ts");
  const shell = source("apps/admin/app/lib/ui/admin-shell.tsx");

  expect(api).toContain("readRoutingRules");
  expect(api).toContain("readRoutingPendingQueue");
  expect(api).toContain("/admin/routing-rules");
  expect(api).toContain("/admin/routing/pending");
  expect(api).toContain("/reassign");
  expect(page).toContain("Règles de routage");
  expect(page).toContain("Assignation manuelle");
  expect(forms).toContain("round_robin");
  expect(forms).toContain("Courtier partenaire éligible");
  expect(forms).toContain("Motif (audité)");
  expect(actions).toContain("revalidatePath(\"/routing\")");
  expect(shell).toContain("/routing");
});

test("routing page avoids regulated wording and never presents multi-broker sending as ungated", () => {
  const page = source("apps/admin/app/routing/page.tsx");
  const forms = source("apps/admin/app/routing/routing-forms.tsx");
  for (const forbidden of ["Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "La meilleure assurance"]) {
    expect(page).not.toContain(forbidden);
    expect(forms).not.toContain(forbidden);
  }
  // Spec 042 implemented multi-send, so the mode is now selectable - but both surfaces must keep
  // saying it only applies if the flag is open AND the visitor accepted it.
  expect(forms).toContain("si le flag est ouvert et si le visiteur l'accepte");
  expect(page).toContain("si le visiteur l'accepte");
  // Lot 5 (spec 071): `ai_assisted` is selectable but only suggests a broker; the admin always decides.
  expect(forms).toContain("ai_assisted");
  expect(forms).toContain("AI_ASSISTED_MODE_NOTE");
});
