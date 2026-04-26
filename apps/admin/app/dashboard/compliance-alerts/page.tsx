import { redirect } from "next/navigation";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { readComplianceAlerts } from "../../lib/admin-api";

interface Props {
  searchParams: Promise<{ page?: string; pageSize?: string }>;
}

export default async function ComplianceAlertsPage({ searchParams }: Props) {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/dashboard/compliance-alerts", session.status));
  if (session.status === "mfa_required") return <main><h1>MFA requise</h1></main>;
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) return <main><h1>Acces refuse</h1></main>;
  const params = await searchParams;
  const page = Number(params.page ?? "1") || 1;
  const pageSize = Number(params.pageSize ?? "25") || 25;
  const alerts = await readComplianceAlerts(page, pageSize);
  if (alerts.unauthenticated) redirect(loginRedirect("/dashboard/compliance-alerts", alerts.error ?? "session_required"));
  if (alerts.forbidden) return <main><h1>Acces refuse</h1></main>;
  if (alerts.status === "error") return <main><h1>Alertes conformite</h1><p role="status">Alertes indisponibles: {alerts.error}</p></main>;
  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 20px", fontFamily: "system-ui, sans-serif", color: "#172033" }}>
      <h1 style={{ margin: 0, fontSize: 28 }}>Alertes conformite</h1>
      <p style={{ color: "#516070" }}>Page {alerts.data.page} sur {Math.max(1, Math.ceil(alerts.data.total / alerts.data.pageSize))}. Total: {alerts.data.total}.</p>
      {alerts.data.items.length === 0 ? (
        <p>Aucune alerte conformite dans la fenetre.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #d7dde4", padding: 8 }}>Date</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #d7dde4", padding: 8 }}>Categorie</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #d7dde4", padding: 8 }}>Raison</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #d7dde4", padding: 8 }}>Cible</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #d7dde4", padding: 8 }}>Tenant</th>
            </tr>
          </thead>
          <tbody>
            {alerts.data.items.map((item) => (
              <tr key={item.id}>
                <td style={{ padding: 8, borderBottom: "1px solid #ebeff3" }}>{item.occurredAt}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #ebeff3" }}>{item.category}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #ebeff3" }}>{item.reason}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #ebeff3" }}>{item.targetType}/{item.targetId ?? "-"}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #ebeff3" }}>{item.partnerTenantId ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
