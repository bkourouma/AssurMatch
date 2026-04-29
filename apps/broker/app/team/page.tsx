import { redirect } from "next/navigation";
import { isBrokerProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { readBrokerTeamUsers } from "../lib/broker-api";

function formatDate(value?: string | null): string {
  return value ? new Date(value).toISOString().slice(0, 10) : "-";
}

export default async function BrokerTeamPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/team", session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent("/team")}`);
  if (session.status !== "authenticated" || !isBrokerProfile(session.profile)) redirect("/login?error=access_denied&returnTo=%2Fteam");

  const team = await readBrokerTeamUsers();
  if (team.unauthenticated) redirect(loginRedirect("/team", team.error ?? "session_required"));

  return (
    <main style={{ maxWidth: 1040, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, sans-serif", color: "#172033" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <p style={{ margin: "0 0 8px", color: "#516070", fontSize: 14 }}>Equipe courtier</p>
          <h1 style={{ margin: 0, fontSize: 32 }}>Utilisateurs du tenant</h1>
          <p style={{ maxWidth: 700, lineHeight: 1.55 }}>Lecture tenant-safe des comptes rattaches au partenaire connecte.</p>
        </div>
        <a href="/" style={{ color: "#245f73" }}>Retour portail</a>
      </header>

      {team.forbidden ? <p role="alert">Acces equipe refuse pour ce role ou MFA incomplete.</p> : null}
      {team.status === "error" ? <p role="status">Liste equipe indisponible: {team.error}.</p> : null}

      <section aria-label="Utilisateurs equipe" style={{ overflowX: "auto", border: "1px solid #d7dde4", borderRadius: 6 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", background: "#f6f8fb" }}>
              <th style={{ padding: 10 }}>Utilisateur</th>
              <th style={{ padding: 10 }}>Roles</th>
              <th style={{ padding: 10 }}>Statut</th>
              <th style={{ padding: 10 }}>MFA</th>
              <th style={{ padding: 10 }}>Derniere connexion</th>
            </tr>
          </thead>
          <tbody>
            {team.data.map((user) => (
              <tr key={user.id} style={{ borderTop: "1px solid #e3e8ef" }}>
                <td style={{ padding: 10 }}><strong>{user.displayName}</strong><div style={{ color: "#516070" }}>{user.email}</div></td>
                <td style={{ padding: 10 }}>{user.roles.join(", ")}</td>
                <td style={{ padding: 10 }}>{user.status}</td>
                <td style={{ padding: 10 }}>{user.mfaStatus}</td>
                <td style={{ padding: 10 }}>{formatDate(user.lastLoginAt)}</td>
              </tr>
            ))}
            {team.data.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 14 }}>Aucun utilisateur lisible pour ce tenant.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </main>
  );
}
