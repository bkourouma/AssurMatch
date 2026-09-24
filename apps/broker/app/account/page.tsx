import { redirect } from "next/navigation";
import { MfaPanel, PasswordChangeForm } from "../auth-flow-form";
import { isBrokerProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { Badge, Button, Card, DescriptionList, Grid, PageHeader, PageStack } from "../lib/ui/broker-ui";

export default async function BrokerAccountPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/account", session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent("/account")}`);
  if (session.status !== "authenticated" || !isBrokerProfile(session.profile)) redirect("/login?error=access_denied&returnTo=%2Faccount");

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Compte" }, { label: "Compte" }]}
        kicker="Compte courtier"
        title="Securite du compte"
        description="Gestion du mot de passe, de la MFA et des informations du profil connecte."
        actions={<Button href="/" variant="secondary">Retour portail</Button>}
      />

      <Grid columns="two">
        <Card title="Profil">
          <DescriptionList
            items={[
              { term: "Acteur", value: session.profile.actorId ?? "-" },
              { term: "Tenant", value: session.profile.partnerTenantId ?? "-" },
              { term: "Plan", value: <Badge tone="info">{session.profile.partnerPlan ?? "-"}</Badge> },
              { term: "Roles", value: session.profile.roles.join(", ") }
            ]}
          />
        </Card>
        <Card title="Mot de passe">
          <PasswordChangeForm />
        </Card>
      </Grid>

      <MfaPanel returnTo="/account" />
    </PageStack>
  );
}
