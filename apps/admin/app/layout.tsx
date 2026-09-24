import "@assurmatch/ui/tokens.css";
import "@assurmatch/ui/backoffice.css";
import { bodyFont, headingFont } from "@assurmatch/ui/fonts";
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
  const label = profile?.actorId ?? "Admin connecte";
  const user = profile
    ? {
        label,
        role: profile.roles.join(", "),
        initials: initialsOf(label)
      }
    : undefined;
  // Computed on the server: the environment name never leaks into the client bundle as a secret.
  const envBadge = process.env.APP_ENV === "local" ? "Local" : undefined;

  return (
    <html lang="fr" className={`${headingFont.variable} ${bodyFont.variable}`}>
      <body>
        <AdminShell user={user} envBadge={envBadge}>
          {children}
        </AdminShell>
      </body>
    </html>
  );
}
