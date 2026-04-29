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
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "42px 20px", fontFamily: "system-ui, sans-serif", color: "#172033" }}>
      <p style={{ margin: "0 0 8px", color: "#516070", fontSize: 14 }}>Activation courtier</p>
      <h1 style={{ margin: "0 0 16px", fontSize: 30 }}>Activer le compte</h1>
      <ActivationForm token={token} returnTo={returnTo} />
    </main>
  );
}
