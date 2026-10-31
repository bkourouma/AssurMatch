import { redirect } from "next/navigation";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { readAdminDashboard } from "../lib/admin-api";
import { AttentionList, Badge, Button, Card, Cluster, DataTable, Grid, PageHeader, PageStack, StateMessage, StatStrip } from "../lib/ui/admin-ui";
import { AI_DISABLED, aiValidationLabel, dashboardAttention, dashboardPrdKpis, flagTone, sensitiveFeatureFlagKeys } from "../lib/ui/admin-view-models";
import { productLabel } from "../lib/ui/operations-labels";

const breadcrumb = [{ label: "Pilotage" }, { label: "Dashboard" }];

export default async function AdminDashboardPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/dashboard", session.status));
  if (session.status === "mfa_required") {
    return (
      <PageStack>
        <PageHeader breadcrumb={breadcrumb} title="MFA requise" description="L'accès dashboard reste bloqué tant que la MFA n'est pas vérifiée." />
      </PageStack>
    );
  }
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) {
    return (
      <PageStack>
        <PageHeader breadcrumb={breadcrumb} title="Accès refusé" description="Ce compte ne dispose pas d'un accès admin autorisé." />
      </PageStack>
    );
  }
  const dashboard = await readAdminDashboard();
  if (dashboard.unauthenticated) redirect(loginRedirect("/dashboard", dashboard.error ?? "session_required"));
  if (dashboard.forbidden) {
    return (
      <PageStack>
        <PageHeader breadcrumb={breadcrumb} title="Accès refusé" description="Le rôle connecté ne permet pas la lecture du dashboard plateforme." />
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
        title="Dashboard plateforme"
        description="Indicateurs internes opérationnels et conformité. Les chiffres restent des signaux de pilotage et ne modifient aucune règle de routage."
        actions={<Button href="/reports/export" variant="secondary">Exporter le rapport plateforme (CSV)</Button>}
      />
      <section aria-label="Volumes de leads" className="bo-stack">
        <Card title="À traiter" description="Les files qui attendent une décision, les plus urgentes en premier.">
          <AttentionList items={dashboardAttention(data)} />
        </Card>
        <StatStrip items={dashboardPrdKpis(data)} label="Indicateurs de pilotage" />
      </section>
      {/* Lot 6 (spec 073 T304): AI cards read stored insights only; no generation from this page. */}
      <Grid columns="two" as="section" aria-label="Assistance IA">
        <Card title="Synthèse IA" footer={<a href="/ai-assistance">Ouvrir l'assistance IA</a>}>
          {data.aiEnabled === false ? <StateMessage>{AI_DISABLED}</StateMessage>
            : data.aiRestricted ? <StateMessage>Réservé aux rôles autorisés à lire les synthèses IA.</StateMessage>
            : data.aiSummary ? (
              <>
                <p>{data.aiSummary.excerpt ?? "Synthèse sans contenu exploitable."}</p>
                <Cluster>
                  <Badge tone={data.aiSummary.status === "pending" ? "warning" : "info"}>Validation: {aiValidationLabel(data.aiSummary.status)}</Badge>
                  <span>Générée le {data.aiSummary.generatedAt.slice(0, 10)}</span>
                </Cluster>
              </>
            ) : <StateMessage>Aucune synthèse IA disponible.</StateMessage>}
        </Card>
        <Card title="Alertes IA" footer={<a href="/ai-assistance">Valider dans l'assistance IA</a>}>
          {data.aiEnabled === false ? <StateMessage>{AI_DISABLED}</StateMessage>
            : data.aiRestricted ? <StateMessage>Réservé aux rôles autorisés à lire les synthèses IA.</StateMessage>
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
      <Grid columns="two" as="section" aria-label="Raisons et répartition">
        <Card title="Raisons de non-routage">
          {data.nonRoutedReasons.length === 0 ? <StateMessage>Aucune raison enregistrée dans la fenêtre.</StateMessage> : (
            <DataTable
              columns={[
                { key: "reason", header: "Raison", render: (item) => item.reason },
                { key: "total", header: "Total", render: (item) => item.total, numeric: true, align: "right" }
              ]}
              items={data.nonRoutedReasons}
              getKey={(item) => item.reason}
              emptyLabel="Aucune raison enregistrée."
            />
          )}
        </Card>
        <Card title="Partenaires et offres">
          <ul className="bo-list">
            <li>Partenaires actifs: {data.partners.active}</li>
            <li>Partenaires inactifs: {data.partners.inactive}</li>
            <li>Offres expirées encore référencées: {data.expiredOffersStillReferenced}</li>
            <li>Licences expirant dans 30 jours: {data.licenseAlerts.expiringSoon}</li>
          </ul>
        </Card>
      </Grid>
      <Grid columns="two" as="section" aria-label="Répartition">
        <Card title="Par pays">
          <DataTable
            columns={[
              { key: "countryCode", header: "Pays", render: (item) => item.countryCode },
              { key: "total", header: "Total", render: (item) => item.total, numeric: true, align: "right" }
            ]}
            items={data.byCountry}
            getKey={(item) => item.countryCode}
            emptyLabel="Aucun pays dans cette fenêtre."
          />
        </Card>
        <Card title="Par produit">
          <DataTable
            columns={[
              { key: "productKey", header: "Produit", render: (item) => productLabel(item.productKey) },
              { key: "total", header: "Total", render: (item) => item.total, numeric: true, align: "right" }
            ]}
            items={data.byProduct}
            getKey={(item) => item.productKey}
            emptyLabel="Aucun produit dans cette fenêtre."
          />
        </Card>
      </Grid>
      <Card
        as="section"
        aria-label="Alertes conformité (synthèse)"
        title="Alertes conformité"
        footer={<a href="/dashboard/compliance-alerts">Voir le détail des alertes</a>}
      >
        <StatStrip
          label="Alertes par catégorie"
          items={[
            { label: "Consentement absent", value: data.complianceAlertCounts.consentMissing, tone: data.complianceAlertCounts.consentMissing > 0 ? "danger" : "success" },
            { label: "CRM fermé", value: data.complianceAlertCounts.crmFlagClosed, tone: data.complianceAlertCounts.crmFlagClosed > 0 ? "warning" : "success" },
            { label: "RBAC refusés", value: data.complianceAlertCounts.rbacDenied, tone: data.complianceAlertCounts.rbacDenied > 0 ? "warning" : "success" },
            { label: "Tentatives inter-tenant", value: data.complianceAlertCounts.crossTenantAttempt, tone: data.complianceAlertCounts.crossTenantAttempt > 0 ? "danger" : "success" }
          ]}
        />
      </Card>
      <Card as="section" aria-label="Feature flags sensibles" title="Feature flags sensibles (lecture seule)">
        <Cluster>
          {sensitiveFeatureFlagKeys.map((key) => {
            const flag = data.sensitiveFeatureFlags.find((item) => item.key === key);
            const scope = flag ? `${flag.scopeType}${flag.scopeId ? `:${flag.scopeId}` : ""}` : "global";
            return <Badge key={key} tone={flagTone(flag?.value ?? false)}>{key} ({scope}): {flag?.value ? "actif" : "désactivé"}</Badge>;
          })}
        </Cluster>
      </Card>
    </PageStack>
  );
}
