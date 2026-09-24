import { redirect } from "next/navigation";
import { PasswordChangeForm } from "../auth-flow-form";
import { loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";

export default async function PasswordChangePage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/password-change", session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent("/password-change")}`);
  return (
    <>
      <p className="bo-kicker">Securite du compte</p>
      <h1 className="bo-auth__title">Changer le mot de passe</h1>
      <PasswordChangeForm />
    </>
  );
}
