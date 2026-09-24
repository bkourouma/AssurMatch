import "@assurmatch/ui/tokens.css";
import "@assurmatch/ui/backoffice.css";
import { bodyFont, headingFont } from "@assurmatch/ui/fonts";
import { initialsOf } from "@assurmatch/ui/backoffice";
import { readBackOfficeSession } from "./lib/backoffice-auth";
import { BrokerShell } from "./lib/ui/broker-shell";

export const metadata = {
  title: "AssurMatch Courtier",
  description: "Back-office courtier AssurMatch"
};

export default async function BrokerLayout({ children }: { children: React.ReactNode }) {
  const session = await readBackOfficeSession();
  const profile = session.status === "authenticated" || session.status === "mfa_required" ? session.profile : undefined;
  const label = profile?.actorId ?? "Courtier connecte";
  const user = profile
    ? {
        label,
        role: profile.roles.join(", "),
        initials: initialsOf(label)
      }
    : undefined;
  // Le plan vient de la session deja lue: le layout n'appelle jamais l'API courtier lui-meme.
  const plan = profile?.partnerPlan;
  // Calcule cote serveur: le nom d'environnement ne part jamais dans le bundle client comme secret.
  const envBadge = process.env.APP_ENV === "local" ? "Local" : undefined;

  return (
    <html lang="fr" className={`${headingFont.variable} ${bodyFont.variable}`}>
      <body>
        <BrokerShell user={user} plan={plan} envBadge={envBadge}>
          {children}
        </BrokerShell>
      </body>
    </html>
  );
}
