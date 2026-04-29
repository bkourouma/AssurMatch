import { redirect } from "next/navigation";
import { MfaPanel, PasswordChangeForm } from "../auth-flow-form";
import { isBrokerProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";

export default async function BrokerAccountPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/account", session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent("/account")}`);
  if (session.status !== "authenticated" || !isBrokerProfile(session.profile)) redirect("/login?error=access_denied&returnTo=%2Faccount");

  return (
    <main style={{ maxWidth: 1040, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, sans-serif", color: "#172033" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <p style={{ margin: "0 0 8px", color: "#516070", fontSize: 14 }}>Compte courtier</p>
          <h1 style={{ margin: 0, fontSize: 32 }}>Securite du compte</h1>
          <p style={{ maxWidth: 700, lineHeight: 1.55 }}>Gestion du mot de passe et de la MFA pour le profil connecte.</p>
        </div>
        <a href="/" style={{ color: "#245f73" }}>Retour portail</a>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 18, alignItems: "start" }}>
        <section style={{ border: "1px solid #d7dde4", borderRadius: 6, padding: 16 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 20 }}>Profil</h2>
          <dl style={{ display: "grid", gap: 8, margin: 0 }}>
            <div><dt style={{ color: "#516070" }}>Acteur</dt><dd style={{ margin: 0 }}>{session.profile.actorId ?? "-"}</dd></div>
            <div><dt style={{ color: "#516070" }}>Tenant</dt><dd style={{ margin: 0 }}>{session.profile.partnerTenantId ?? "-"}</dd></div>
            <div><dt style={{ color: "#516070" }}>Plan</dt><dd style={{ margin: 0 }}>{session.profile.partnerPlan ?? "-"}</dd></div>
            <div><dt style={{ color: "#516070" }}>Roles</dt><dd style={{ margin: 0 }}>{session.profile.roles.join(", ")}</dd></div>
          </dl>
        </section>
        <PasswordChangeForm />
      </section>

      <section style={{ marginTop: 18 }}>
        <MfaPanel returnTo="/account" />
      </section>
    </main>
  );
}
