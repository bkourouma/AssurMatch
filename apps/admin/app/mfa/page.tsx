import { redirect } from "next/navigation";
import { MfaPanel } from "../auth-flow-form";
import { loginRedirect, readBackOfficeSession, sanitizeReturnTo } from "../lib/backoffice-auth";

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
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "42px 20px", fontFamily: "system-ui, sans-serif", color: "#172033" }}>
      <p style={{ margin: "0 0 8px", color: "#516070", fontSize: 14 }}>Verification forte</p>
      <h1 style={{ margin: "0 0 16px", fontSize: 30 }}>MFA requise</h1>
      <MfaPanel returnTo={returnTo} />
    </main>
  );
}
