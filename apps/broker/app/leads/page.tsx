import { redirect } from "next/navigation";
import { listStarterLeads } from "../lib/broker-api";
import { loginRedirect } from "../lib/backoffice-auth";

export default async function BrokerLeadsPage() {
  const apiLeads = await listStarterLeads();
  if (apiLeads.unauthenticated) redirect(loginRedirect("/leads", apiLeads.error ?? "session_required"));
  const leads = apiLeads.data.items.map((lead) => ({
    reference: String(lead.publicReference ?? lead.id ?? "lead"),
    pays: String(lead.countryCode ?? "-"),
    produit: String(lead.productKey ?? "-"),
    statut: String(lead.status ?? "-"),
    date: String(lead.assignedAt ?? "-"),
    vu: lead.seenAt ? "Oui" : "Non"
  }));

  return (
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, sans-serif", color: "#172033" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <p style={{ margin: "0 0 8px", color: "#516070", fontSize: 14 }}>Portail Starter</p>
          <h1 style={{ margin: 0, fontSize: 30 }}>Leads assignes</h1>
          <p style={{ maxWidth: 720, lineHeight: 1.6 }}>
            Le courtier voit uniquement les leads qui lui sont assignes. Les donnees personnelles ne sont affichees qu'apres controle du tenant connecte.
          </p>
        </div>
        <button type="button" style={{ padding: "10px 14px", border: "1px solid #245f73", color: "#245f73", background: "#fff", borderRadius: 6 }}>
          Export CSV autorise
        </button>
      </header>

      <form aria-label="Filtres leads" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(130px, 1fr))", gap: 12, marginBottom: 18 }}>
        {["Statut", "Produit", "Pays", "Date"].map((label) => (
          <label key={label} style={{ display: "grid", gap: 6, fontSize: 13, color: "#516070" }}>
            {label}
            <select style={{ minHeight: 38, border: "1px solid #b9c3cf", borderRadius: 6, padding: "0 10px", background: "#fff" }}>
              <option>Tous</option>
            </select>
          </label>
        ))}
      </form>

      {apiLeads.forbidden ? <p role="alert">Acces refuse ou MFA requis pour ce portail. Aucune donnee protegee n'est affichee.</p> : null}
      {apiLeads.error && !apiLeads.forbidden ? <p role="status">API leads indisponible. Aucune donnee protegee n'est affichee en mode erreur.</p> : null}

      {!apiLeads.forbidden && leads.length === 0 ? <p>Aucun lead autorise a afficher.</p> : null}

      {!apiLeads.forbidden && leads.length > 0 ? <table style={{ width: "100%", borderCollapse: "collapse", borderTop: "1px solid #d7dde4" }}>
        <thead>
          <tr>
            {["Reference", "Pays", "Produit", "Statut", "Date", "Vu"].map((header) => (
              <th key={header} style={{ textAlign: "left", padding: "12px 10px", borderBottom: "1px solid #d7dde4", color: "#516070", fontSize: 13 }}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.reference}>
              <td style={{ padding: "12px 10px", borderBottom: "1px solid #edf0f3" }}>
                <a href="/leads/demo-lead" style={{ color: "#245f73" }}>{lead.reference}</a>
              </td>
              <td style={{ padding: "12px 10px", borderBottom: "1px solid #edf0f3" }}>{lead.pays}</td>
              <td style={{ padding: "12px 10px", borderBottom: "1px solid #edf0f3" }}>{lead.produit}</td>
              <td style={{ padding: "12px 10px", borderBottom: "1px solid #edf0f3" }}>{lead.statut}</td>
              <td style={{ padding: "12px 10px", borderBottom: "1px solid #edf0f3" }}>{lead.date}</td>
              <td style={{ padding: "12px 10px", borderBottom: "1px solid #edf0f3" }}>{lead.vu}</td>
            </tr>
          ))}
        </tbody>
      </table> : null}

      <p style={{ marginTop: 20, color: "#516070", lineHeight: 1.6 }}>
        Aucun Kanban, assignation equipe ou CRM avance n'est active pour le portail Starter. L'export CSV est controle par permission, scope et audit.
      </p>
    </main>
  );
}
