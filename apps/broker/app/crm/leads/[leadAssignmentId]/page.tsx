import { redirect } from "next/navigation";
import { isStarterCrmDenied, loginRedirect, readBackOfficeSession } from "../../../lib/backoffice-auth";

export default async function BrokerCrmLeadDetailPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/crm/leads/demo-lead", session.status));
  if (session.status !== "authenticated" || isStarterCrmDenied(session.profile)) {
    return (
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "28px 20px", fontFamily: "system-ui, sans-serif", color: "#172033" }}>
        <h1>Acces CRM refuse</h1>
        <p>Le detail CRM exige un plan Pro/Enterprise, la MFA verifiee, le flag broker_crm_enabled et les permissions CRM.</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 20px", fontFamily: "system-ui, sans-serif", color: "#172033" }}>
      <header style={{ marginBottom: 22 }}>
        <p style={{ margin: "0 0 6px", color: "#52616f", fontSize: 13 }}>CRM Pro/Enterprise</p>
        <h1 style={{ margin: 0, fontSize: 28 }}>AM-LEAD-2048</h1>
        <p style={{ maxWidth: 760, lineHeight: 1.55 }}>
          Detail CRM interne. Notes, documents internes et taches ne sont jamais visibles cote Web Publique Client.
        </p>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 18 }}>
        <div>
          <section style={{ borderTop: "1px solid #d8dde3", paddingTop: 16, marginBottom: 18 }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 20 }}>Pipeline</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["Nouveau", "Contact tente", "Contacte", "Qualifie", "Devis envoye", "Negociation", "Gagne", "Perdu"].map((status) => (
                <button key={status} type="button" style={{ minHeight: 34, border: "1px solid #bac4cf", borderRadius: 6, background: status === "Nouveau" ? "#e7f3ef" : "#fff", padding: "0 10px" }}>
                  {status}
                </button>
              ))}
            </div>
          </section>

          <section style={{ borderTop: "1px solid #d8dde3", paddingTop: 16, marginBottom: 18 }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 20 }}>Activite interne</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(150px, 1fr))", gap: 10 }}>
              {["Note interne", "Tache commerciale", "Rappel"].map((label) => (
                <button key={label} type="button" style={{ minHeight: 38, border: "1px solid #24695c", color: "#24695c", background: "#fff", borderRadius: 6 }}>
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section style={{ borderTop: "1px solid #d8dde3", paddingTop: 16 }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 20 }}>Documents et propositions</h2>
            <p style={{ margin: "0 0 12px", color: "#52616f", lineHeight: 1.55 }}>
              Les propositions ou references de devis sont un suivi interne partenaire, pas une emission contractuelle par AssurMatch.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(150px, 1fr))", gap: 10 }}>
              {["Document interne", "Document prospect", "Reference devis"].map((label) => (
                <button key={label} type="button" style={{ minHeight: 38, border: "1px solid #bac4cf", background: "#fff", borderRadius: 6 }}>
                  {label}
                </button>
              ))}
            </div>
          </section>
        </div>

        <aside style={{ border: "1px solid #d8dde3", borderRadius: 6, padding: 16 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 18 }}>Controle d'acces</h2>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.75 }}>
            <li>Owner: organisation</li>
            <li>Manager: equipe ou organisation selon permission</li>
            <li>Agent: leads assignes</li>
            <li>Read-only: lecture seule</li>
          </ul>
        </aside>
      </section>
    </main>
  );
}
