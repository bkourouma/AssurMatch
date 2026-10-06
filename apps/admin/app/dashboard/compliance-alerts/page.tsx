import { redirect } from "next/navigation";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { readAdminAlerts, readComplianceAlerts } from "../../lib/admin-api";
import { acknowledgeAlertAction } from "../../lib/alert-actions";
import { Button, Card, DataTable, Form, FormActions, Input, Notice, PageHeader, PageStack, StateMessage, StatusBadge } from "../../lib/ui/admin-ui";

interface Props {
  searchParams: Promise<{ page?: string; pageSize?: string; alert?: string; alertStatus?: string }>;
}

/** Spec 061 FR-004: outcome of the acknowledgement server action. */
const ALERT_NOTICES: Record<string, { tone: "success" | "warning" | "danger"; text: string }> = {
  acknowledged: { tone: "success", text: "Alerte acquittee. L'acquittement et son motif sont audites." },
  already: { tone: "warning", text: "Cette alerte etait deja acquittee." },
  invalid: { tone: "warning", text: "Motif d'acquittement requis (8 caracteres minimum)." },
  forbidden: { tone: "danger", text: "Acquittement reserve aux administrateurs plateforme et conformite (MFA requise)." },
  not_found: { tone: "warning", text: "Alerte introuvable." },
  error: { tone: "danger", text: "Acquittement indisponible pour le moment." }
};

const SEVERITY_TONES = { info: "info", warning: "warning", critical: "danger" } as const;
const ALERT_STATUS_TONES = { open: "warning", acknowledged: "neutral" } as const;
const ALERT_STATUS_FILTERS = new Set(["open", "acknowledged", "all"]);

function detailsLabel(details: Record<string, string | number | boolean>): string {
  const entries = Object.entries(details);
  return entries.length === 0 ? "-" : entries.map(([key, value]) => `${key}: ${String(value)}`).join(", ");
}

const breadcrumb = [{ label: "Pilotage" }, { label: "Conformite", href: "/compliance" }, { label: "Alertes conformite" }];

export default async function ComplianceAlertsPage({ searchParams }: Props) {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/dashboard/compliance-alerts", session.status));
  if (session.status === "mfa_required") {
    return (
      <PageStack>
        <PageHeader breadcrumb={breadcrumb} title="MFA requise" />
      </PageStack>
    );
  }
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) {
    return (
      <PageStack>
        <PageHeader breadcrumb={breadcrumb} title="Acces refuse" />
      </PageStack>
    );
  }
  const params = await searchParams;
  const page = Number(params.page ?? "1") || 1;
  const pageSize = Number(params.pageSize ?? "25") || 25;
  const alertStatus = (ALERT_STATUS_FILTERS.has(params.alertStatus ?? "") ? params.alertStatus : "open") as "open" | "acknowledged" | "all";
  const [alerts, center] = await Promise.all([readComplianceAlerts(page, pageSize), readAdminAlerts(alertStatus)]);
  const alertNotice = params.alert ? ALERT_NOTICES[params.alert] : undefined;
  if (alerts.unauthenticated) redirect(loginRedirect("/dashboard/compliance-alerts", alerts.error ?? "session_required"));
  if (alerts.forbidden) {
    return (
      <PageStack>
        <PageHeader breadcrumb={breadcrumb} title="Acces refuse" />
      </PageStack>
    );
  }
  if (alerts.status === "error") {
    return (
      <PageStack>
        <PageHeader breadcrumb={breadcrumb} title="Alertes conformite" />
        <StateMessage tone="warning">Alertes indisponibles: {alerts.error}</StateMessage>
      </PageStack>
    );
  }

  const data = alerts.data;
  const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));
  const hrefFor = (nextPage: number) => `/dashboard/compliance-alerts?page=${nextPage}&pageSize=${data.pageSize}`;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={breadcrumb}
        kicker="Conformite"
        title="Alertes conformite"
        description={`Page ${data.page} sur ${lastPage}. Total: ${data.total}.`}
      />
      {alertNotice ? <Notice tone={alertNotice.tone}>{alertNotice.text}</Notice> : null}
      <Card>
        <section aria-label="Centre d'alertes" data-alerts-center>
          <h2>Centre d&apos;alertes ({center.data.open} ouverte{center.data.open > 1 ? "s" : ""})</h2>
          <p>
            Alertes calculees par la tache planifiee du worker (licences J-60/J-30/J-7, offres expirees, pays publics sans
            courtier actif, leads non routes sur 24 h, taux de litige, worker inactif). Une alerte n&apos;est levee qu&apos;une fois
            par jour et par cible; l&apos;acquittement exige un motif et est audite.
          </p>
          <p>
            Filtre: <a href="/dashboard/compliance-alerts?alertStatus=open">ouvertes</a> ·{" "}
            <a href="/dashboard/compliance-alerts?alertStatus=acknowledged">acquittees</a> ·{" "}
            <a href="/dashboard/compliance-alerts?alertStatus=all">toutes</a>
          </p>
          {center.status === "error" ? (
            <StateMessage tone="warning">Centre d&apos;alertes indisponible: {center.error}</StateMessage>
          ) : (
            <DataTable
              columns={[
                { key: "lastSeenAt", header: "Derniere detection", render: (item) => item.lastSeenAt },
                { key: "label", header: "Alerte", render: (item) => item.label },
                { key: "severity", header: "Gravite", render: (item) => <StatusBadge status={item.severity} tones={SEVERITY_TONES} /> },
                { key: "status", header: "Statut", render: (item) => <StatusBadge status={item.status} tones={ALERT_STATUS_TONES} /> },
                { key: "target", header: "Cible", render: (item) => `${item.targetType}/${item.targetId ?? "-"}` },
                { key: "details", header: "Details", render: (item) => detailsLabel(item.details) },
                {
                  key: "action",
                  header: "Acquittement",
                  render: (item) => item.status === "open" ? (
                    <Form action={acknowledgeAlertAction} data-alert-ack={item.id}>
                      <input type="hidden" name="alertId" value={item.id} />
                      <Input name="reason" aria-label="Motif d'acquittement (audite)" placeholder="Motif (audite)" minLength={8} required />
                      <FormActions>
                        <Button type="submit" size="sm" variant="secondary">Acquitter</Button>
                      </FormActions>
                    </Form>
                  ) : `${item.acknowledgedAt ?? "-"} - ${item.acknowledgeReason ?? ""}`
                }
              ]}
              items={center.data.items}
              getKey={(item) => item.id}
              emptyLabel="Aucune alerte pour ce filtre."
              aria-label="Centre d'alertes"
            />
          )}
        </section>
      </Card>
      <Card>
        <DataTable
          columns={[
            { key: "occurredAt", header: "Date", render: (item) => item.occurredAt },
            { key: "category", header: "Categorie", render: (item) => item.category },
            { key: "reason", header: "Raison", render: (item) => item.reason },
            { key: "target", header: "Cible", render: (item) => `${item.targetType}/${item.targetId ?? "-"}` },
            { key: "tenant", header: "Tenant", render: (item) => item.partnerTenantId ?? "-" }
          ]}
          items={data.items}
          getKey={(item) => item.id}
          emptyLabel="Aucune alerte conformite dans la fenetre."
          aria-label="Alertes conformite"
          pagination={{
            page: data.page,
            pageSize: data.pageSize,
            total: data.total,
            hrefFor,
            label: (from, to, total) => `${from}-${to} sur ${total} alertes`
          }}
        />
      </Card>
    </PageStack>
  );
}
