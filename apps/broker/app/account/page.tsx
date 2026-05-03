import { redirect } from "next/navigation";
import { MfaPanel, PasswordChangeForm } from "../auth-flow-form";
import { isBrokerProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { Badge, Card, PageHeader } from "../lib/ui/broker-ui";

export default async function BrokerAccountPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/account", session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent("/account")}`);
  if (session.status !== "authenticated" || !isBrokerProfile(session.profile)) redirect("/login?error=access_denied&returnTo=%2Faccount");

  return (
    <div className="page-stack">
      <PageHeader
        kicker="Compte courtier"
        title="Securite du compte"
        description="Gestion du mot de passe, de la MFA et des informations du profil connecte."
        actions={<a className="button button--secondary" href="/">Retour portail</a>}
      />

      <section className="broker-grid broker-grid--two">
        <Card plain>
          <h2 className="section-title">Profil</h2>
          <dl className="definition-list">
            <dt>Acteur</dt><dd>{session.profile.actorId ?? "-"}</dd>
            <dt>Tenant</dt><dd>{session.profile.partnerTenantId ?? "-"}</dd>
            <dt>Plan</dt><dd><Badge tone="info">{session.profile.partnerPlan ?? "-"}</Badge></dd>
            <dt>Roles</dt><dd>{session.profile.roles.join(", ")}</dd>
          </dl>
        </Card>
        <Card plain>
          <PasswordChangeForm />
        </Card>
      </section>

      <Card plain>
        <MfaPanel returnTo="/account" />
      </Card>
    </div>
  );
}
