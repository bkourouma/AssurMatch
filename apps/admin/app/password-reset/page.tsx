import { PasswordResetConsumeForm } from "../auth-flow-form";

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
      <p className="bo-kicker">Reinitialisation admin</p>
      <h1 className="bo-auth__title">Consommer un jeton</h1>
      <PasswordResetConsumeForm token={firstParam(params.token)} />
    </>
  );
}
