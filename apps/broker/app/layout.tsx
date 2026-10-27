import "@assurmatch/ui/backoffice.css";
import { monoFont, uiFont } from "@assurmatch/ui/backoffice-fonts";
import { initialsOf, themeByValue } from "@assurmatch/ui/backoffice";
import { cookies } from "next/headers";
import { readBackOfficeSession } from "./lib/backoffice-auth";
import { readBrokerBranding } from "./lib/broker-api";
import { toBrokerBranding } from "./lib/branding";
import type { BrokerBranding } from "./lib/branding";
import { agenciesOverviewAccess } from "./lib/agencies-overview";
import { TENANT_SUSPENDED_MESSAGE, isTenantReadOnly } from "./lib/broker-permissions";
import { BrokerShell } from "./lib/ui/broker-shell";
import { BROKER_THEME_COOKIE } from "./lib/theme-cookie";

/**
 * Spec 064 FR-009: the Enterprise charte (label and colour) only decorates the broker back-office header.
 * Any failure keeps the default charte: the layout never fails because of branding.
 */
async function readEnterpriseBranding(): Promise<BrokerBranding | undefined> {
  try {
    const branding = await readBrokerBranding();
    return branding.status === "success" ? toBrokerBranding(branding.data) : undefined;
  } catch {
    return undefined;
  }
}

export const metadata = {
  title: "AssurMatch Courtier",
  description: "Back-office courtier AssurMatch"
};

export default async function BrokerLayout({ children }: { children: React.ReactNode }) {
  const session = await readBackOfficeSession();
  // The chosen theme lives in a cookie so the server renders it: no flash of the default theme.
  const theme = themeByValue((await cookies()).get(BROKER_THEME_COOKIE)?.value);
  const profile = session.status === "authenticated" || session.status === "mfa_required" ? session.profile : undefined;
  const label = profile?.displayName ?? profile?.actorId ?? "Courtier connecte";
  const user = profile
    ? {
        label,
        role: profile.roles.join(", "),
        initials: initialsOf(label)
      }
    : undefined;
  // Le plan vient de la session deja lue. Seule exception: la charte Enterprise ci-dessous, lue avec garde try/catch.
  const plan = profile?.partnerPlan;
  // The charte is read for authenticated Enterprise sessions only (the API refuses it to other plans).
  const branding = session.status === "authenticated" && plan === "enterprise" ? await readEnterpriseBranding() : undefined;
  // Calcule cote serveur: le nom d'environnement ne part jamais dans le bundle client comme secret.
  const envBadge = process.env.APP_ENV === "local" ? "Local" : undefined;
  // Spec 051 R12: a suspended partner keeps read access only; the banner stays on every page.
  const suspendedBanner = isTenantReadOnly(profile) ? TENANT_SUSPENDED_MESSAGE : undefined;

  // Lot 3 (spec 069 FR-003): the multi-agency link follows the page and API rule (Enterprise and a role seeing the whole cabinet).
  const showAgenciesOverview = session.status === "authenticated" && agenciesOverviewAccess(session.profile) === "allowed";

  return (
    <html lang="fr" data-app="broker" data-theme={theme.value} data-mode={theme.mode} className={`${uiFont.variable} ${monoFont.variable}`}>
      <body>
        <BrokerShell theme={theme.value} user={user} plan={plan} showAgenciesOverview={showAgenciesOverview} branding={branding} envBadge={envBadge} suspendedBanner={suspendedBanner}>
          {children}
        </BrokerShell>
      </body>
    </html>
  );
}
