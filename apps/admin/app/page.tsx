import { redirect } from "next/navigation";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "./lib/backoffice-auth";
import { logoutAction } from "./lib/backoffice-session-actions";
import { readAdminHealth, readAdminDashboard } from "./lib/admin-api";
import { Badge, Card, KpiCard, PageHeader, StateMessage } from "./lib/ui/admin-ui";
import { dashboardKpis, flagTone, sensitiveFeatureFlagKeys } from "./lib/ui/admin-view-models";

export default async function AdminHomePage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/", session.status));
  if (session.status === "mfa_required") {
    return (
      <div className="page-stack">
        <PageHeader title="MFA requise" description="L'acces admin reste bloque tant que la MFA n'est pas verifiee." />
        <form action={logoutAction}><button type="submit">Retour au login</button></form>
      </div>
    );
  }
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) {
    return (
      <div className="page-stack">
        <PageHeader title="Acces refuse" description="Ce compte ne dispose pas d'un acces admin autorise." />
        <form action={logoutAction}><button type="submit">Changer de compte</button></form>
      </div>
    );
  }
  const health = await readAdminHealth();
  if (health.unauthenticated) redirect(loginRedirect("/", health.error ?? "session_required"));
  const dashboard = await readAdminDashboard();
  if (dashboard.unauthenticated) redirect(loginRedirect("/", dashboard.error ?? "session_required"));

  return (
    <div className="page-stack">
      <PageHeader
        kicker="Back-office plateforme"
        title="Dashboard admin"
        description="Vue operationnelle et conformite du back-office AssurMatch. Les modules sensibles restent controles par les regles et flags existants."
      />

      {health.forbidden ? <StateMessage tone="warning">Acces sante systeme refuse pour ce role admin.</StateMessage> : null}
      {health.error && !health.forbidden ? <StateMessage tone="warning">Sante systeme indisponible: {health.error}</StateMessage> : null}
      {dashboard.forbidden ? (
        <StateMessage tone="danger">Acces dashboard plateforme refuse pour ce role admin.</StateMessage>
      ) : dashboard.status === "error" ? (
        <StateMessage tone="danger" title="Dashboard indisponible">L'API admin ne repond pas correctement: {dashboard.error}</StateMessage>
      ) : (
        <>
          <section className="admin-grid admin-grid--kpi" aria-label="Dashboard plateforme synthese">
            {dashboardKpis(dashboard.data).map((kpi) => (
              <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} helper={kpi.helper} tone={kpi.tone} />
            ))}
          </section>
          <section className="admin-grid admin-grid--two" aria-label="Synthese conformite et flags sensibles">
            <Card>
              <h2 className="section-title">Alertes conformite</h2>
              <ul className="simple-list">
                <li>Consentement absent: {dashboard.data.complianceAlertCounts.consentMissing}</li>
                <li>CRM ferme: {dashboard.data.complianceAlertCounts.crmFlagClosed}</li>
                <li>RBAC refuses: {dashboard.data.complianceAlertCounts.rbacDenied}</li>
                <li>Tentatives inter-tenant: {dashboard.data.complianceAlertCounts.crossTenantAttempt}</li>
              </ul>
            </Card>
            <Card>
              <h2 className="section-title">Feature flags sensibles (lecture seule)</h2>
              <div className="admin-grid">
                {sensitiveFeatureFlagKeys.map((key) => {
                  const flag = dashboard.data.sensitiveFeatureFlags.find((item) => item.key === key);
                  return <Badge key={key} tone={flagTone(flag?.value ?? false)}>{key}: {flag?.value ? "actif" : "desactive"}</Badge>;
                })}
              </div>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
