import { redirect } from "next/navigation";
import { PasswordChangeForm } from "../auth-flow-form";
import { loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import polish from "../lib/ui/self-service-polish.module.css";

export const metadata = { title: "Changer le mot de passe" };

export default async function PasswordChangePage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/password-change", session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent("/password-change")}`);
  return (
    <>
      <h1 className="bo-auth__title">Changer le mot de passe</h1>
      <p className={polish.lead}>Votre nouveau mot de passe remplace l&apos;actuel et révoque tous vos appareils de confiance : le code MFA vous sera redemandé.</p>
      <PasswordChangeForm />
    </>
  );
}
