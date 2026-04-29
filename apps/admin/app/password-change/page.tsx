import { redirect } from "next/navigation";
import { PasswordChangeForm } from "../auth-flow-form";
import { loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";

export default async function PasswordChangePage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/password-change", session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent("/password-change")}`);
  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "42px 20px", fontFamily: "system-ui, sans-serif", color: "#172033" }}>
      <p style={{ margin: "0 0 8px", color: "#516070", fontSize: 14 }}>Securite du compte</p>
      <h1 style={{ margin: "0 0 16px", fontSize: 30 }}>Changer le mot de passe</h1>
      <PasswordChangeForm />
    </main>
  );
}
