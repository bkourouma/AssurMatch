export default function BrokerLeadsPage() {
  const leads = [
    { reference: "AM-LEAD-1042", pays: "CI", produit: "auto", statut: "Nouveau", date: "2026-04-25", vu: "Non" },
    { reference: "AM-LEAD-1039", pays: "CI", produit: "sante", statut: "Vu", date: "2026-04-24", vu: "Oui" },
    { reference: "AM-LEAD-1032", pays: "SN", produit: "auto", statut: "Conteste", date: "2026-04-22", vu: "Oui" }
  ];

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

      <table style={{ width: "100%", borderCollapse: "collapse", borderTop: "1px solid #d7dde4" }}>
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
      </table>

      <p style={{ marginTop: 20, color: "#516070", lineHeight: 1.6 }}>
        Aucun Kanban, assignation equipe ou CRM avance n'est active pour le portail Starter. L'export CSV est controle par permission, scope et audit.
      </p>
    </main>
  );
}
