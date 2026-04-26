import { redirect } from "next/navigation";
import { loginRedirect } from "../lib/backoffice-auth";
import { readBrokerDashboard } from "../lib/broker-api";

export default async function BrokerCrmPage() {
  const dashboard = await readBrokerDashboard();
  if (dashboard.unauthenticated) redirect(loginRedirect("/crm", dashboard.error ?? "session_required"));
  if (dashboard.forbidden) {
    return (
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "28px 20px", fontFamily: "system-ui, sans-serif", color: "#172033" }}>
        <h1>Acces dashboard refuse</h1>
        <p>Le dashboard courtier exige un courtier authentifie, la MFA verifiee et le flag broker_dashboard_enabled actif.</p>
      </main>
    );
  }

  const starter = dashboard.data.starter;
  const crm = dashboard.data.crm;

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 20px", fontFamily: "system-ui, sans-serif", color: "#172033" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 22 }}>
        <div>
          <p style={{ margin: "0 0 6px", color: "#52616f", fontSize: 13 }}>CRM Pro/Enterprise</p>
          <h1 style={{ margin: 0, fontSize: 30 }}>Pipeline commercial</h1>
          <p style={{ maxWidth: 760, lineHeight: 1.55 }}>
            Indicateurs operationnels internes; aucune action CRM ne declenche souscription, police, attestation ni signature.
          </p>
        </div>
        <a href="/crm/leads" style={{ padding: "10px 14px", border: "1px solid #24695c", color: "#24695c", textDecoration: "none", borderRadius: 6 }}>
          Vue tableau
        </a>
      </header>

      <section aria-label="Indicateurs Starter" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(120px, 1fr))", gap: 12, marginBottom: 22 }}>
        {[
          ["Recus", starter.received],
          ["Acceptes", starter.accepted],
          ["Rejetes", starter.rejected],
          ["Contestes", starter.disputed],
          ["En attente", starter.pendingAction]
        ].map(([label, value]) => (
          <div key={String(label)} style={{ border: "1px solid #d8dde3", borderRadius: 6, padding: 14, minHeight: 78 }}>
            <div style={{ color: "#52616f", fontSize: 13 }}>{label}</div>
            <strong style={{ display: "block", marginTop: 8, fontSize: 26 }}>{value}</strong>
          </div>
        ))}
      </section>

      {crm ? (
        <>
          <section aria-label="Pipeline CRM" style={{ marginBottom: 22 }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 20 }}>Pipeline par statut</h2>
            {crm.pipeline.length === 0 ? (
              <p>Aucune activite CRM dans la fenetre.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {crm.pipeline.map(({ status, total }) => (
                  <li key={status}>{status}: {total}</li>
                ))}
              </ul>
            )}
          </section>
          <section aria-label="Conversion par produit" style={{ marginBottom: 22 }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 20 }}>Conversion par produit</h2>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {crm.conversionByProduct.map(({ productKey, received, accepted, rate }) => (
                <li key={productKey}>{productKey}: {accepted}/{received} ({Math.round(rate * 100)}%)</li>
              ))}
            </ul>
          </section>
          <section aria-label="A venir" style={{ marginBottom: 22 }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 18 }}>Activites a venir</h2>
            <p>Taches a venir: {crm.upcomingTasks}. Rappels a venir: {crm.upcomingReminders}.</p>
          </section>
        </>
      ) : (
        <p role="status">Section CRM indisponible: le flag broker_crm_enabled est ferme ou le plan ne permet pas le CRM avance.</p>
      )}

      {dashboard.data.licenseAlerts.length > 0 ? (
        <section aria-label="Alertes licence">
          <h2 style={{ margin: "0 0 10px", fontSize: 18 }}>Alertes licence</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {dashboard.data.licenseAlerts.map((alert) => (
              <li key={alert.licenseId}>
                {alert.countryCode} — {alert.status === "expired" ? "expiree" : "expirante"} (
                {new Date(alert.expiresAt).toISOString().slice(0, 10)})
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
