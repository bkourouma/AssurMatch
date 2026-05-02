import { redirect } from "next/navigation";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { readAdminDashboard } from "../lib/admin-api";
import { Badge, Card, DataTable, KpiCard, PageHeader, StateMessage } from "../lib/ui/admin-ui";
import { dashboardKpis, flagTone, sensitiveFeatureFlagKeys } from "../lib/ui/admin-view-models";

export default async function AdminDashboardPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/dashboard", session.status));
  if (session.status === "mfa_required") return <div className="page-stack"><PageHeader title="MFA requise" description="L'acces dashboard reste bloque tant que la MFA n'est pas verifiee." /></div>;
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) {
    return <div className="page-stack"><PageHeader title="Acces refuse" description="Ce compte ne dispose pas d'un acces admin autorise." /></div>;
  }
  const dashboard = await readAdminDashboard();
  if (dashboard.unauthenticated) redirect(loginRedirect("/dashboard", dashboard.error ?? "session_required"));
  if (dashboard.forbidden) return <div className="page-stack"><PageHeader title="Acces refuse" description="Le role connecte ne permet pas la lecture du dashboard plateforme." /></div>;
  if (dashboard.status === "error") return <div className="page-stack"><PageHeader title="Dashboard plateforme" /><StateMessage tone="danger">Dashboard indisponible: {dashboard.error}</StateMessage></div>;
  const data = dashboard.data;
  return (
    <div className="page-stack">
      <PageHeader
        kicker="Back-office plateforme"
        title="Dashboard plateforme"
        description="Indicateurs internes operationnels et conformite. Les chiffres restent des signaux de pilotage et ne modifient aucune regle de routage."
      />
      <section aria-label="Volumes de leads" className="admin-grid admin-grid--kpi">
        {dashboardKpis(data).map((kpi) => <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} helper={kpi.helper} tone={kpi.tone} />)}
      </section>
      <section className="admin-grid admin-grid--two" aria-label="Raisons et repartition">
        <Card>
          <h2 className="section-title">Raisons de non-routage</h2>
          {data.nonRoutedReasons.length === 0 ? <StateMessage>Aucune raison enregistree dans la fenetre.</StateMessage> : (
            <DataTable
              columns={[
                { header: "Raison", render: (item) => item.reason },
                { header: "Total", render: (item) => item.total }
              ]}
              items={data.nonRoutedReasons}
              getKey={(item) => item.reason}
              emptyLabel="Aucune raison enregistree."
            />
          )}
        </Card>
        <Card>
          <h2 className="section-title">Partenaires et offres</h2>
          <ul className="simple-list">
            <li>Partenaires actifs: {data.partners.active}</li>
            <li>Partenaires inactifs: {data.partners.inactive}</li>
            <li>Offres expirees encore referencees: {data.expiredOffersStillReferenced}</li>
            <li>Licences expirant dans 30 jours: {data.licenseAlerts.expiringSoon}</li>
          </ul>
        </Card>
      </section>
      <section aria-label="Repartition" className="admin-grid admin-grid--two">
        <Card>
          <h2 className="section-title">Par pays</h2>
          <DataTable columns={[{ header: "Pays", render: (item) => item.countryCode }, { header: "Total", render: (item) => item.total }]} items={data.byCountry} getKey={(item) => item.countryCode} emptyLabel="Aucun pays dans cette fenetre." />
        </Card>
        <Card>
          <h2 className="section-title">Par produit</h2>
          <DataTable columns={[{ header: "Produit", render: (item) => item.productKey }, { header: "Total", render: (item) => item.total }]} items={data.byProduct} getKey={(item) => item.productKey} emptyLabel="Aucun produit dans cette fenetre." />
        </Card>
      </section>
      <section aria-label="Alertes conformite (synthese)">
        <Card>
          <h2 className="section-title">Alertes conformite</h2>
          <div className="admin-grid admin-grid--kpi">
            <KpiCard label="Consentement absent" value={data.complianceAlertCounts.consentMissing} tone={data.complianceAlertCounts.consentMissing > 0 ? "danger" : "success"} />
            <KpiCard label="CRM ferme" value={data.complianceAlertCounts.crmFlagClosed} tone={data.complianceAlertCounts.crmFlagClosed > 0 ? "warning" : "success"} />
            <KpiCard label="RBAC refuses" value={data.complianceAlertCounts.rbacDenied} tone={data.complianceAlertCounts.rbacDenied > 0 ? "warning" : "success"} />
            <KpiCard label="Tentatives inter-tenant" value={data.complianceAlertCounts.crossTenantAttempt} tone={data.complianceAlertCounts.crossTenantAttempt > 0 ? "danger" : "success"} />
          </div>
          <p><a href="/dashboard/compliance-alerts">Voir le detail des alertes</a></p>
        </Card>
      </section>
      <section aria-label="Feature flags sensibles">
        <Card>
          <h2 className="section-title">Feature flags sensibles (lecture seule)</h2>
          <div className="admin-grid">
            {sensitiveFeatureFlagKeys.map((key) => {
              const flag = data.sensitiveFeatureFlags.find((item) => item.key === key);
              const scope = flag ? `${flag.scopeType}${flag.scopeId ? `:${flag.scopeId}` : ""}` : "global";
              return <Badge key={key} tone={flagTone(flag?.value ?? false)}>{key} ({scope}): {flag?.value ? "actif" : "desactive"}</Badge>;
            })}
          </div>
        </Card>
      </section>
    </div>
  );
}
