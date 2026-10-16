import { redirect } from "next/navigation";
import { RevokeTrustedDevicesForm } from "../../auth-flow-form";
import { listTrustedDevices, type TrustedDeviceView } from "../../lib/broker-api";
import { isBrokerProfile, loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { Button, Card, DataTable, PageHeader, PageStack, StateMessage } from "../../lib/ui/broker-ui";

const SECURITY_PATH = "/account/security";

// Deterministic French rendering (Africa/Abidjan is UTC+0, the platform reference zone).
const dateTimeFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Abidjan" });

function formatDateTime(value?: string | null): string {
  if (!value) return "Jamais";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : dateTimeFormat.format(date);
}

/** Account security of the signed-in broker user: trusted devices (spec 063, FR-A06) and password change. */
export default async function BrokerAccountSecurityPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect(SECURITY_PATH, session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent(SECURITY_PATH)}`);
  if (session.status !== "authenticated" || !isBrokerProfile(session.profile)) redirect(`/login?error=access_denied&returnTo=${encodeURIComponent(SECURITY_PATH)}`);

  const result = await listTrustedDevices();
  if (!result.ok && result.error === "session_required") redirect(loginRedirect(SECURITY_PATH, "session_required"));

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Compte" }, { label: "Compte", href: "/account" }, { label: "Appareils de confiance" }]}
        kicker="Compte courtier"
        title="Sécurité du compte"
        description="Appareils de confiance et mot de passe de votre compte."
        actions={<Button href="/account" variant="secondary">Retour au compte</Button>}
      />

      <Card
        title="Appareils de confiance"
        description="Sur un appareil de confiance, le code MFA n'est pas redemandé pendant 30 jours ; le mot de passe reste toujours exigé. Révoquez-les si un appareil est perdu, partagé ou si vous avez un doute."
      >
        {!result.ok ? (
          <StateMessage tone="danger">Impossible de charger la liste des appareils de confiance. Réessayez plus tard.</StateMessage>
        ) : (
          <DataTable<TrustedDeviceView>
            columns={[
              { key: "label", header: "Appareil", render: (device) => device.label ?? "Appareil inconnu" },
              { key: "createdAt", header: "Ajouté le", render: (device) => formatDateTime(device.createdAt) },
              { key: "lastUsedAt", header: "Dernière utilisation", render: (device) => formatDateTime(device.lastUsedAt) },
              { key: "expiresAt", header: "Expire le", render: (device) => formatDateTime(device.expiresAt) }
            ]}
            items={result.devices}
            getKey={(device) => device.id}
            emptyLabel="Aucun appareil de confiance actif. Le code MFA vous est demandé à chaque connexion."
            aria-label="Appareils de confiance actifs"
          />
        )}
        <RevokeTrustedDevicesForm />
      </Card>

      <Card title="Mot de passe" description="Changer votre mot de passe révoque aussi tous vos appareils de confiance.">
        <Button href="/password-change" variant="secondary">Changer le mot de passe</Button>
      </Card>
    </PageStack>
  );
}
