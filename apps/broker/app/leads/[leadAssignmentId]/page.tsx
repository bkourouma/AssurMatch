import { redirect } from "next/navigation";
import { loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";

export default async function BrokerLeadDetailPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/leads/demo-lead", session.status));
  if (session.status === "mfa_required" || session.status === "forbidden" || session.status === "error") {
    return (
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, sans-serif", color: "#172033" }}>
        <h1>Acces refuse</h1>
        <p>Le detail du lead reste masque tant que la session, la MFA et le tenant courtier ne sont pas valides.</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, sans-serif", color: "#172033" }}>
      <a href="/leads" style={{ color: "#245f73", textDecoration: "none" }}>Retour aux leads</a>
      <header style={{ margin: "18px 0 24px" }}>
        <p style={{ margin: "0 0 8px", color: "#516070", fontSize: 14 }}>Lead assigne au courtier connecte</p>
        <h1 style={{ margin: 0, fontSize: 30 }}>Detail du lead assigne</h1>
        <p style={{ maxWidth: 720, lineHeight: 1.6 }}>
          Informations consenties, pays, produit, statut et historique minimal. Toute consultation detail est auditee et marque le lead comme vu lors du premier acces autorise.
        </p>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 22 }}>
        <div style={{ border: "1px solid #d7dde4", borderRadius: 6, padding: 16 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Informations utiles</h2>
          <dl style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 8, margin: 0 }}>
            <dt>Pays</dt><dd style={{ margin: 0 }}>CI</dd>
            <dt>Produit</dt><dd style={{ margin: 0 }}>auto</dd>
            <dt>Statut</dt><dd style={{ margin: 0 }}>Vu</dd>
            <dt>Contact</dt><dd style={{ margin: 0 }}>Affiche uniquement si le lead est assigne</dd>
          </dl>
        </div>
        <div style={{ border: "1px solid #d7dde4", borderRadius: 6, padding: 16 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Actions Starter</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" style={{ padding: "9px 12px", border: "1px solid #245f73", background: "#245f73", color: "#fff", borderRadius: 6 }}>Accepter</button>
            <button type="button" style={{ padding: "9px 12px", border: "1px solid #b45814", background: "#fff", color: "#8a3f10", borderRadius: 6 }}>Rejeter avec motif</button>
            <button type="button" style={{ padding: "9px 12px", border: "1px solid #6b4bb8", background: "#fff", color: "#4b338a", borderRadius: 6 }}>Contester avec motif</button>
          </div>
          <p style={{ margin: "12px 0 0", color: "#516070", lineHeight: 1.5 }}>
            Rejet et contestation exigent un motif allowliste; toute contestation est historisee.
          </p>
        </div>
      </section>

      <section style={{ borderTop: "1px solid #d7dde4", paddingTop: 18 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Historique minimal</h2>
        <ol style={{ lineHeight: 1.9, margin: 0, paddingLeft: 22 }}>
          <li>Lead assigne par routage conforme.</li>
          <li>Detail consulte et marque vu.</li>
          <li>Action courtier historisee avec acteur, date et motif lorsque requis.</li>
        </ol>
      </section>

      <aside style={{ marginTop: 22, border: "1px solid #d7dde4", borderRadius: 6, padding: 16 }}>
        <strong>Plan Starter</strong>
        <p style={{ margin: "8px 0 0", lineHeight: 1.6 }}>
          Le plan Starter ne comprend pas le CRM complet: aucun Kanban, pipeline avance, taches, rappels, assignation equipe, devis joints ou IA commerciale avancee.
        </p>
      </aside>
    </main>
  );
}
