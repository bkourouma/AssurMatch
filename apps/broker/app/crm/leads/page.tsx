import { listCrmLeads } from "../../lib/broker-api";

const fallbackLeads = [
  { reference: "AM-LEAD-2048", pays: "CI", produit: "auto", statut: "Nouveau", conseiller: "Awa", urgence: "Urgent", source: "Comparateur" },
  { reference: "AM-LEAD-2037", pays: "SN", produit: "sante", statut: "Qualifie", conseiller: "Moussa", urgence: "Normal", source: "Demande devis" },
  { reference: "AM-LEAD-2029", pays: "CI", produit: "habitation", statut: "Negociation", conseiller: "Awa", urgence: "Eleve", source: "Support" }
];

export default async function BrokerCrmLeadsPage() {
  const apiLeads = await listCrmLeads();
  const leads = apiLeads.data.items.length
    ? apiLeads.data.items.map((lead) => ({
        reference: String(lead.publicReference ?? lead.id ?? "lead"),
        pays: String(lead.countryCode ?? "-"),
        produit: String(lead.productKey ?? "-"),
        statut: String(lead.status ?? "-"),
        conseiller: String(lead.assignedAdvisorId ?? "-"),
        urgence: String(lead.urgency ?? "-"),
        source: String(lead.source ?? "-")
      }))
    : fallbackLeads;

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 20px", fontFamily: "system-ui, sans-serif", color: "#172033" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <p style={{ margin: "0 0 6px", color: "#52616f", fontSize: 13 }}>CRM Pro/Enterprise</p>
          <h1 style={{ margin: 0, fontSize: 28 }}>Leads CRM</h1>
          <p style={{ maxWidth: 760, lineHeight: 1.55 }}>
            Vue tableau des leads autorises selon role, tenant, conseiller et permissions PII.
          </p>
        </div>
        <button type="button" style={{ padding: "10px 14px", border: "1px solid #24695c", color: "#24695c", background: "#fff", borderRadius: 6 }}>
          Export CSV controle
        </button>
      </header>

      <form aria-label="Filtres CRM" style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(120px, 1fr))", gap: 10, marginBottom: 16 }}>
        {["Statut", "Produit", "Pays", "Conseiller", "Urgence", "Source"].map((label) => (
          <label key={label} style={{ display: "grid", gap: 6, fontSize: 13, color: "#52616f" }}>
            {label}
            <select style={{ minHeight: 38, border: "1px solid #bac4cf", borderRadius: 6, padding: "0 10px", background: "#fff" }}>
              <option>Tous</option>
            </select>
          </label>
        ))}
      </form>

      <label style={{ display: "grid", gap: 6, marginBottom: 14, color: "#52616f", fontSize: 13 }}>
        Recherche autorisee
        <input placeholder="Nom, reference, telephone ou email selon permission" style={{ minHeight: 38, border: "1px solid #bac4cf", borderRadius: 6, padding: "0 10px" }} />
      </label>

      {apiLeads.forbidden ? <p role="alert">Acces CRM refuse, verifiez le plan, la MFA et le flag broker_crm_enabled.</p> : null}
      {apiLeads.error && !apiLeads.forbidden ? <p role="status">API CRM indisponible, affichage de secours.</p> : null}

      <table style={{ width: "100%", borderCollapse: "collapse", borderTop: "1px solid #d8dde3" }}>
        <thead>
          <tr>
            {["Reference", "Pays", "Produit", "Statut", "Conseiller", "Urgence", "Source"].map((header) => (
              <th key={header} style={{ textAlign: "left", padding: "12px 10px", borderBottom: "1px solid #d8dde3", color: "#52616f", fontSize: 13 }}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.reference}>
              <td style={{ padding: "12px 10px", borderBottom: "1px solid #edf0f3" }}>
                <a href="/crm/leads/demo-lead" style={{ color: "#24695c" }}>{lead.reference}</a>
              </td>
              <td style={{ padding: "12px 10px", borderBottom: "1px solid #edf0f3" }}>{lead.pays}</td>
              <td style={{ padding: "12px 10px", borderBottom: "1px solid #edf0f3" }}>{lead.produit}</td>
              <td style={{ padding: "12px 10px", borderBottom: "1px solid #edf0f3" }}>{lead.statut}</td>
              <td style={{ padding: "12px 10px", borderBottom: "1px solid #edf0f3" }}>{lead.conseiller}</td>
              <td style={{ padding: "12px 10px", borderBottom: "1px solid #edf0f3" }}>{lead.urgence}</td>
              <td style={{ padding: "12px 10px", borderBottom: "1px solid #edf0f3" }}>{lead.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
