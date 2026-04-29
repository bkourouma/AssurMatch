import { loginAction } from "../lib/backoffice-session-actions";

interface LoginPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : {};
  const returnTo = firstParam(params.returnTo) ?? "/";
  const error = firstParam(params.error);
  const reason = firstParam(params.reason);
  const mfa = firstParam(params.mfa);

  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: "48px 20px", fontFamily: "system-ui, sans-serif", color: "#172033" }}>
      <p style={{ margin: "0 0 8px", color: "#516070", fontSize: 14 }}>Back-office plateforme</p>
      <h1 style={{ margin: "0 0 18px", fontSize: 30 }}>Connexion admin</h1>
      {reason === "session_expired" ? <p role="status">Votre session a expire. Connectez-vous a nouveau.</p> : null}
      {reason === "session_required" ? <p role="status">Connectez-vous pour acceder a l'administration.</p> : null}
      {mfa === "required" ? <p role="alert">MFA requise. L'acces admin reste bloque tant que la verification MFA n'est pas terminee.</p> : null}
      {error === "activation_required" ? <p role="alert">Activation requise. Ouvrez l'ecran d'activation avec le jeton fourni par votre administrateur.</p> : null}
      {error === "mfa_required" ? <p role="alert">MFA requise. Terminez la verification MFA avant d'ouvrir les espaces admin.</p> : null}
      {error === "locked" ? <p role="alert">Compte verrouille. Contactez un Super Admin ou un administrateur conformite.</p> : null}
      {error === "suspended" ? <p role="alert">Compte suspendu. Contactez un administrateur habilite.</p> : null}
      {error === "validation_error" ? <p role="alert">Verifiez le format de l'email et du mot de passe.</p> : null}
      {error && !["activation_required", "mfa_required", "locked", "suspended", "validation_error"].includes(error) ? <p role="alert">Acces refuse ou identifiants invalides.</p> : null}

      <form action={loginAction} style={{ display: "grid", gap: 12 }}>
        <input type="hidden" name="returnTo" value={returnTo} />
        <label style={{ display: "grid", gap: 6 }}>
          Email
          <input name="email" type="email" autoComplete="email" required style={{ minHeight: 38, border: "1px solid #b9c3cf", borderRadius: 6, padding: "0 10px" }} />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          Mot de passe
          <input name="password" type="password" autoComplete="current-password" required minLength={12} style={{ minHeight: 38, border: "1px solid #b9c3cf", borderRadius: 6, padding: "0 10px" }} />
        </label>
        <button type="submit" style={{ minHeight: 40, border: "1px solid #245f73", background: "#245f73", color: "#fff", borderRadius: 6 }}>
          Se connecter
        </button>
      </form>
      <p style={{ marginTop: 14 }}><a href={`/activate?returnTo=${encodeURIComponent(returnTo)}`}>Activer un compte</a> · <a href="/password-reset">Consommer un jeton de reinitialisation</a></p>
    </main>
  );
}
