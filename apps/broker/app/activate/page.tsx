import { ActivationForm } from "../auth-flow-form";

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
      <p>Activation courtier</p>
      <h1 className="bo-auth__title">Activer le compte</h1>
      <ActivationForm token={token} returnTo={returnTo} />
    </>
  );
}
