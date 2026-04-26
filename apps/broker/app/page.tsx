import { redirect } from "next/navigation";
import { isBrokerProfile, loginRedirect, readBackOfficeSession } from "./lib/backoffice-auth";
import { logoutAction } from "./lib/backoffice-session-actions";
import { readBrokerDashboard } from "./lib/broker-api";

export default async function BrokerShellPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/", session.status));
  if (session.status === "mfa_required") {
    return (
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, sans-serif", color: "#172033" }}>
        <h1>MFA requise</h1>
        <p>Votre profil est reconnu, mais l'acces au portail courtier reste bloque tant que la MFA n'est pas verifiee.</p>
        <form action={logoutAction}><button type="submit">Retour au login</button></form>
      </main>
    );
  }
  if (session.status !== "authenticated" || !isBrokerProfile(session.profile)) {
    return (
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, sans-serif", color: "#172033" }}>
        <h1>Acces refuse</h1>
        <p>Ce compte ne dispose pas d'un acces courtier autorise.</p>
        <form action={logoutAction}><button type="submit">Changer de compte</button></form>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, sans-serif", color: "#172033" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <p style={{ margin: "0 0 8px", color: "#516070", fontSize: 14 }}>Plan Starter</p>
          <h1 style={{ margin: 0, fontSize: 32 }}>Portail courtier</h1>
          <p style={{ maxWidth: 680, lineHeight: 1.6 }}>
            Suivi simple des leads transmis par AssurMatch. Le courtier partenaire reste responsable de la prise de contact et de la suite commerciale.
          </p>
          <p style={{ margin: "8px 0 0", color: "#516070", fontSize: 13 }}>Connecte: {session.profile.actorId ?? "profil courtier"}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/leads" style={{ padding: "10px 14px", border: "1px solid #245f73", color: "#245f73", textDecoration: "none", borderRadius: 6 }}>
            Voir les leads
          </a>
          <form action={logoutAction}>
            <button type="submit" style={{ padding: "10px 14px", border: "1px solid #b9c3cf", background: "#fff", borderRadius: 6 }}>Deconnexion</button>
          </form>
        </div>
      </header>

      <BrokerDashboardSection />

      <section style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <div style={{ borderTop: "1px solid #d7dde4", paddingTop: 18 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 20 }}>Notifications minimales</h2>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            <li>Nouveau lead auto assigne disponible dans la liste.</li>
            <li>Les notifications restent limitees au tenant courtier connecte.</li>
          </ul>
        </div>
        <aside style={{ border: "1px solid #d7dde4", borderRadius: 6, padding: 16 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 18 }}>CRM complet</h2>
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            Le plan Starter ne comprend pas Kanban, pipeline avance, taches, rappels, assignation equipe, notes avancees ou IA commerciale.
          </p>
        </aside>
      </section>
    </main>
  );
}

async function BrokerDashboardSection() {
  const dashboard = await readBrokerDashboard();
  if (dashboard.unauthenticated) {
    return <p role="status">Session expiree. Reconnectez-vous pour voir le dashboard.</p>;
  }
  if (dashboard.forbidden) {
    return <p role="alert">Acces dashboard refuse. Le flag broker_dashboard_enabled est ferme ou la MFA est requise.</p>;
  }
  if (dashboard.status === "error") {
    return <p role="status">Dashboard indisponible: {dashboard.error ?? "erreur inconnue"}.</p>;
  }
  const starter = dashboard.data.starter;
  const cards: Array<[string, string | number]> = [
    ["Recus", starter.received],
    ["Acceptes", starter.accepted],
    ["Rejetes", starter.rejected],
    ["Contestes", starter.disputed],
    ["En attente", starter.pendingAction]
  ];
  return (
    <>
      <section aria-label="Dashboard Starter" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(120px, 1fr))", gap: 12, marginBottom: 28 }}>
        {cards.map(([label, value]) => (
          <div key={label} style={{ border: "1px solid #d7dde4", borderRadius: 6, padding: 16, minHeight: 82 }}>
            <div style={{ color: "#516070", fontSize: 13 }}>{label}</div>
            <strong style={{ display: "block", marginTop: 8, fontSize: 28 }}>{value}</strong>
          </div>
        ))}
      </section>
      {dashboard.data.licenseAlerts.length > 0 ? (
        <section aria-label="Alertes licence" style={{ marginBottom: 28 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Alertes licence</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {dashboard.data.licenseAlerts.map((alert) => (
              <li key={alert.licenseId}>
                {alert.countryCode} — licence {alert.status === "expired" ? "expiree" : "expirant prochainement"} (
                {new Date(alert.expiresAt).toISOString().slice(0, 10)})
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
