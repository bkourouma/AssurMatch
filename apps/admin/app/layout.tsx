import "./globals.css";
import { readBackOfficeSession } from "./lib/backoffice-auth";
import { AdminShell } from "./lib/ui/admin-shell";

export const metadata = {
  title: "AssurMatch Admin",
  description: "Back-office admin AssurMatch"
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await readBackOfficeSession();
  const profile = session.status === "authenticated" || session.status === "mfa_required" ? session.profile : undefined;
  const user = profile
    ? {
        label: profile.actorId ?? "Admin connecte",
        role: profile.roles.join(", ")
      }
    : undefined;

  return (
    <html lang="fr">
      <body><AdminShell user={user}>{children}</AdminShell></body>
    </html>
  );
}
