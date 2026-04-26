import { redirect } from "next/navigation";
import { loginRedirect } from "../lib/backoffice-auth";
import { readCrmDashboard } from "../lib/broker-api";

const pipeline = [
  ["Nouveau", "12"],
  ["Contacte", "8"],
  ["Qualifie", "6"],
  ["Devis envoye", "4"],
  ["Gagne", "2"]
];

const metrics = [
  { label: "Leads ouverts", value: "32" },
  { label: "Urgents", value: "5" },
  { label: "Taches echues", value: "3" },
  { label: "Exports autorises", value: "Scope role" }
];

export default async function BrokerCrmPage() {
  const dashboard = await readCrmDashboard();
  if (dashboard.unauthenticated) redirect(loginRedirect("/crm", dashboard.error ?? "session_required"));
  if (dashboard.forbidden) {
    return (
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "28px 20px", fontFamily: "system-ui, sans-serif", color: "#172033" }}>
        <h1>Acces CRM refuse</h1>
        <p>Le CRM exige un plan Pro/Enterprise, la MFA verifiee, le flag broker_crm_enabled et les permissions CRM.</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 20px", fontFamily: "system-ui, sans-serif", color: "#172033" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 22 }}>
        <div>
          <p style={{ margin: "0 0 6px", color: "#52616f", fontSize: 13 }}>CRM Pro/Enterprise</p>
          <h1 style={{ margin: 0, fontSize: 30 }}>Pipeline commercial</h1>
          <p style={{ maxWidth: 760, lineHeight: 1.55 }}>
            Suivi interne des leads assignes au courtier connecte. Les propositions restent non contractuelles et aucune action CRM ne declenche souscription, police ou attestation.
          </p>
        </div>
        <a href="/crm/leads" style={{ padding: "10px 14px", border: "1px solid #24695c", color: "#24695c", textDecoration: "none", borderRadius: 6 }}>
          Vue tableau
        </a>
      </header>

      <section aria-label="Indicateurs CRM" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(150px, 1fr))", gap: 12, marginBottom: 22 }}>
        {metrics.map(({ label, value }) => (
          <div key={label} style={{ border: "1px solid #d8dde3", borderRadius: 6, padding: 14, minHeight: 78 }}>
            <div style={{ color: "#52616f", fontSize: 13 }}>{label}</div>
            <strong style={{ display: "block", marginTop: 8, fontSize: value.length > 4 ? 18 : 26 }}>{value}</strong>
          </div>
        ))}
      </section>

      <section aria-label="Kanban CRM" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(160px, 1fr))", gap: 12 }}>
        {pipeline.map(([status, count]) => (
          <div key={status} style={{ border: "1px solid #d8dde3", borderRadius: 6, minHeight: 190, padding: 12, background: "#fbfcfd" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
              <strong>{status}</strong>
              <span>{count}</span>
            </div>
            <a href="/crm/leads/demo-lead" style={{ display: "block", border: "1px solid #e2e6eb", borderRadius: 6, padding: 10, color: "#172033", textDecoration: "none", background: "#fff" }}>
              AM-LEAD-2048
              <span style={{ display: "block", marginTop: 4, color: "#52616f", fontSize: 13 }}>Auto - CI - urgent</span>
            </a>
          </div>
        ))}
      </section>
    </main>
  );
}
