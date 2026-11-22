import { ActivationForm } from "../auth-flow-form";
import polish from "../lib/ui/self-service-polish.module.css";

export const metadata = { title: "Activer le compte" };

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ActivationPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const token = firstParam(params.token);
  const returnTo = firstParam(params.returnTo) || "/";
  return (
    <>
      <h1 className="bo-auth__title">Activer le compte</h1>
      <p className={polish.lead}>Choisissez votre mot de passe. Vous passerez ensuite à la vérification en deux étapes (MFA) avant d&apos;ouvrir le back-office.</p>
      <ActivationForm token={token} returnTo={returnTo} />
    </>
  );
}
