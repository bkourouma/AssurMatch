import { redirect } from "next/navigation";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { readAdminDashboard } from "../lib/admin-api";
import { Badge, Button, Card, Cluster, DataTable, Grid, KpiCard, PageHeader, PageStack, StateMessage } from "../lib/ui/admin-ui";
import { AI_DISABLED, aiValidationLabel, dashboardPrdKpis, flagTone, sensitiveFeatureFlagKeys } from "../lib/ui/admin-view-models";

const breadcrumb = [{ label: "Pilotage" }, { label: "Dashboard" }];

export default async function AdminDashboardPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/dashboard", session.status));
  if (session.status === "mfa_required") {
    return (
      <PageStack>
        <PageHeader breadcrumb={breadcrumb} title="MFA requise" description="L'acces dashboard reste bloque tant que la MFA n'est pas verifiee." />
      </PageStack>
    );
  }
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) {
    return (
      <PageStack>
        <PageHeader breadcrumb={breadcrumb} title="Acces refuse" description="Ce compte ne dispose pas d'un acces admin autorise." />
      </PageStack>
    );
  }
  const dashboard = await readAdminDashboard();
  if (dashboard.unauthenticated) redirect(loginRedirect("/dashboard", dashboard.error ?? "session_required"));
  if (dashboard.forbidden) {
    return (
      <PageStack>
        <PageHeader breadcrumb={breadcrumb} title="Acces refuse" description="Le role connecte ne permet pas la lecture du dashboard plateforme." />
      </PageStack>
    );
  }
  if (dashboard.status === "error") {
    return (
      <PageStack>
        <PageHeader breadcrumb={breadcrumb} title="Dashboard plateforme" />
        <StateMessage tone="danger">Dashboard indisponible: {dashboard.error}</StateMessage>
      </PageStack>
    );
  }
  const data = dashboard.data;
  return (
    <PageStack>
      <PageHeader
        breadcrumb={breadcrumb}
        kicker="Back-office plateforme"
        title="Dashboard plateforme"
        description="Indicateurs internes operationnels et conformite. Les chiffres restent des signaux de pilotage et ne modifient aucune regle de routage."
        actions={<Button href="/reports/export" variant="secondary">Exporter le rapport plateforme (CSV)</Button>}
      />
      <Grid columns="kpi" as="section" aria-label="Volumes de leads">
        {dashboardPrdKpis(data).map((kpi) => <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} helper={kpi.helper} tone={kpi.tone} />)}
      </Grid>
      {/* Lot 6 (spec 073 T304): AI cards read stored insights only; no generation from this page. */}
      <Grid columns="two" as="section" aria-label="Assistance IA">
        <Card title="Synthese IA" footer={<a href="/ai-assistance">Ouvrir l'assistance IA</a>}>
          {data.aiEnabled === false ? <StateMessage>{AI_DISABLED}</StateMessage>
            : data.aiRestricted ? <StateMessage>Reserve aux roles autorises a lire les syntheses IA.</StateMessage>
            : data.aiSummary ? (
              <>
                <p>{data.aiSummary.excerpt ?? "Synthese sans contenu exploitable."}</p>
                <Cluster>
                  <Badge tone={data.aiSummary.status === "pending" ? "warning" : "info"}>Validation: {aiValidationLabel(data.aiSummary.status)}</Badge>
                  <span>Generee le {data.aiSummary.generatedAt.slice(0, 10)}</span>
                </Cluster>
              </>
            ) : <StateMessage>Aucune synthese IA disponible.</StateMessage>}
        </Card>
        <Card title="Alertes IA" footer={<a href="/ai-assistance">Valider dans l'assistance IA</a>}>
          {data.aiEnabled === false ? <StateMessage>{AI_DISABLED}</StateMessage>
            : data.aiRestricted ? <StateMessage>Reserve aux roles autorises a lire les syntheses IA.</StateMessage>
            : !data.aiAlerts ? <StateMessage>Aucune alerte IA disponible.</StateMessage> : (
              <>
                <p>{data.aiAlerts.pendingValidation} analyse(s) en attente de validation humaine.</p>
                {data.aiAlerts.items.length === 0 ? <StateMessage>Aucune alerte IA en attente.</StateMessage> : (
                  <ul className="bo-list">
                    {data.aiAlerts.items.map((item) => (
                      <li key={item.insightId}>{item.type} - {item.createdAt.slice(0, 10)} - {aiValidationLabel(item.status)}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
        </Card>
      </Grid>
      <Grid columns="two" as="section" aria-label="Raisons et repartition">
        <Card title="Raisons de non-routage">
          {data.nonRoutedReasons.length === 0 ? <StateMessage>Aucune raison enregistree dans la fenetre.</StateMessage> : (
            <DataTable
              columns={[
                { key: "reason", header: "Raison", render: (item) => item.reason },
                { key: "total", header: "Total", render: (item) => item.total, numeric: true, align: "right" }
              ]}
              items={data.nonRoutedReasons}
              getKey={(item) => item.reason}
              emptyLabel="Aucune raison enregistree."
            />
          )}
        </Card>
        <Card title="Partenaires et offres">
          <ul className="bo-list">
            <li>Partenaires actifs: {data.partners.active}</li>
            <li>Partenaires inactifs: {data.partners.inactive}</li>
            <li>Offres expirees encore referencees: {data.expiredOffersStillReferenced}</li>
            <li>Licences expirant dans 30 jours: {data.licenseAlerts.expiringSoon}</li>
          </ul>
        </Card>
      </Grid>
      <Grid columns="two" as="section" aria-label="Repartition">
        <Card title="Par pays">
          <DataTable
            columns={[
              { key: "countryCode", header: "Pays", render: (item) => item.countryCode },
              { key: "total", header: "Total", render: (item) => item.total, numeric: true, align: "right" }
            ]}
            items={data.byCountry}
            getKey={(item) => item.countryCode}
            emptyLabel="Aucun pays dans cette fenetre."
          />
        </Card>
        <Card title="Par produit">
          <DataTable
            columns={[
              { key: "productKey", header: "Produit", render: (item) => item.productKey },
              { key: "total", header: "Total", render: (item) => item.total, numeric: true, align: "right" }
            ]}
            items={data.byProduct}
            getKey={(item) => item.productKey}
            emptyLabel="Aucun produit dans cette fenetre."
          />
        </Card>
      </Grid>
      <Card
        as="section"
        aria-label="Alertes conformite (synthese)"
        title="Alertes conformite"
        footer={<a href="/dashboard/compliance-alerts">Voir le detail des alertes</a>}
      >
        <Grid columns="kpi">
          <KpiCard label="Consentement absent" value={data.complianceAlertCounts.consentMissing} tone={data.complianceAlertCounts.consentMissing > 0 ? "danger" : "success"} />
          <KpiCard label="CRM ferme" value={data.complianceAlertCounts.crmFlagClosed} tone={data.complianceAlertCounts.crmFlagClosed > 0 ? "warning" : "success"} />
          <KpiCard label="RBAC refuses" value={data.complianceAlertCounts.rbacDenied} tone={data.complianceAlertCounts.rbacDenied > 0 ? "warning" : "success"} />
          <KpiCard label="Tentatives inter-tenant" value={data.complianceAlertCounts.crossTenantAttempt} tone={data.complianceAlertCounts.crossTenantAttempt > 0 ? "danger" : "success"} />
        </Grid>
      </Card>
      <Card as="section" aria-label="Feature flags sensibles" title="Feature flags sensibles (lecture seule)">
        <Cluster>
          {sensitiveFeatureFlagKeys.map((key) => {
            const flag = data.sensitiveFeatureFlags.find((item) => item.key === key);
            const scope = flag ? `${flag.scopeType}${flag.scopeId ? `:${flag.scopeId}` : ""}` : "global";
            return <Badge key={key} tone={flagTone(flag?.value ?? false)}>{key} ({scope}): {flag?.value ? "actif" : "desactive"}</Badge>;
          })}
        </Cluster>
      </Card>
    </PageStack>
  );
}
