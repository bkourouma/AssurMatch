import { redirect } from "next/navigation";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "./lib/backoffice-auth";
import { logoutAction } from "./lib/backoffice-session-actions";
import { readAdminHealth } from "./lib/admin-api";

export default async function AdminHomePage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/", session.status));
  if (session.status === "mfa_required") {
    return (
      <main>
        <h1>MFA requise</h1>
        <p>L'acces admin reste bloque tant que la MFA n'est pas verifiee.</p>
        <form action={logoutAction}><button type="submit">Retour au login</button></form>
      </main>
    );
  }
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) {
    return (
      <main>
        <h1>Acces refuse</h1>
        <p>Ce compte ne dispose pas d'un acces admin autorise.</p>
        <form action={logoutAction}><button type="submit">Changer de compte</button></form>
      </main>
    );
  }
  const health = await readAdminHealth();
  if (health.unauthenticated) redirect(loginRedirect("/", health.error ?? "session_required"));

  return (
    <main>
      <h1>AssurMatch Admin</h1>
      {health.forbidden ? <p role="alert">Acces sante systeme refuse pour ce role admin.</p> : null}
      {health.error && !health.forbidden ? <p role="status">Sante systeme indisponible: {health.error}</p> : null}
      <nav aria-label="Administration socle">
        <a href="/catalog">Catalogue</a>
        <a href="/partners">Partenaires</a>
        <a href="/users">Utilisateurs</a>
        <a href="/feature-flags">Feature flags</a>
        <a href="/compliance">Conformite</a>
        <a href="/operations">Operations</a>
      </nav>
      <form action={logoutAction}>
        <button type="submit">Deconnexion</button>
      </form>
    </main>
  );
}
