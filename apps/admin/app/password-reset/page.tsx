import { PasswordResetConsumeForm } from "../auth-flow-form";

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
      <h1 className="bo-auth__title">Réinitialiser le mot de passe</h1>
      <PasswordResetConsumeForm token={firstParam(params.token)} />
      <p className="bo-auth__footer">
        <a href="/login">Retour à la connexion</a>
      </p>
    </>
  );
}
