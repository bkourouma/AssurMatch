import { redirect } from "next/navigation";
import { MfaPanel } from "../auth-flow-form";
import { loginRedirect, readBackOfficeSession, sanitizeReturnTo } from "../lib/backoffice-auth";
import polish from "../lib/ui/self-service-polish.module.css";

export const metadata = { title: "Vérification en deux étapes" };

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function MfaPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const returnTo = sanitizeReturnTo(firstParam(params.returnTo) || "/");
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect(returnTo, session.status));
  if (session.status === "authenticated") redirect(returnTo);
  // Spec 063 (FR-A11): an enrolled account only gets the verification form.
  const mfaEnrolled = session.status === "mfa_required" && session.profile.mfaEnrolled === true;
  return (
    <>
      <h1 className="bo-auth__title">MFA requise</h1>
      <p className={polish.lead}>
        {mfaEnrolled
          ? "Saisissez le code de votre application d'authentification pour ouvrir le back-office."
          : "Vérification en deux étapes obligatoire : générez d'abord votre secret MFA, puis validez avec un code."}
      </p>
      <MfaPanel returnTo={returnTo} mfaEnrolled={mfaEnrolled} />
    </>
  );
}
