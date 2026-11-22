import { ActivationForm } from "../auth-flow-form";

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
      <p className="bo-field__hint">Choisissez votre mot de passe : l'étape suivante est l'enrôlement MFA.</p>
      <ActivationForm token={token} returnTo={returnTo} />
      <p className="bo-auth__footer">
        <a href="/login">Retour à la connexion</a>
      </p>
    </>
  );
}
