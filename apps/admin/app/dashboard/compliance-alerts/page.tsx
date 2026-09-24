import { redirect } from "next/navigation";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { readComplianceAlerts } from "../../lib/admin-api";
import { Card, DataTable, PageHeader, PageStack, StateMessage } from "../../lib/ui/admin-ui";

interface Props {
  searchParams: Promise<{ page?: string; pageSize?: string }>;
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
  const alerts = await readComplianceAlerts(page, pageSize);
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
