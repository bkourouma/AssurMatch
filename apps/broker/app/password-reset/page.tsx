import { PasswordResetConsumeForm } from "../auth-flow-form";
import polish from "../lib/ui/self-service-polish.module.css";

export const metadata = { title: "Réinitialiser le mot de passe" };

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function PasswordResetPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  return (
    <>
      <h1 className="bo-auth__title">Consommer un jeton</h1>
      <p className={polish.lead}>Saisissez le jeton de réinitialisation reçu, puis choisissez un nouveau mot de passe. Vous pourrez ensuite vous connecter.</p>
      <PasswordResetConsumeForm token={firstParam(params.token)} />
    </>
  );
}
