import "@assurmatch/ui/backoffice.css";
import { monoFont, uiFont } from "@assurmatch/ui/backoffice-fonts";
import { initialsOf } from "@assurmatch/ui/backoffice";
import { readBackOfficeSession } from "./lib/backoffice-auth";
import { AdminShell } from "./lib/ui/admin-shell";

export const metadata = {
  title: "AssurMatch Admin",
  description: "Back-office admin AssurMatch"
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await readBackOfficeSession();
  const profile = session.status === "authenticated" || session.status === "mfa_required" ? session.profile : undefined;
  // The actor id is a UUID: it is shortened so the account menu stays readable, the role leads.
  const primaryRole = profile?.roles[0]?.replaceAll("_", " ");
  const label = primaryRole ? primaryRole.charAt(0).toUpperCase() + primaryRole.slice(1) : "Admin connecte";
  const user = profile
    ? {
        label,
        role: profile.actorId ? `ID ${profile.actorId.slice(0, 8)}` : undefined,
        initials: initialsOf(label)
      }
    : undefined;
  // Computed on the server: the environment name never leaks into the client bundle as a secret.
  const envBadge = process.env.APP_ENV === "local" ? "Local" : undefined;

  return (
    <html lang="fr" data-app="admin" className={`${uiFont.variable} ${monoFont.variable}`}>
      <body>
        <AdminShell user={user} envBadge={envBadge}>
          {children}
        </AdminShell>
      </body>
    </html>
  );
}
