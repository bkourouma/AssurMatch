import { redirect } from "next/navigation";
import { isBrokerProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { Badge, Card, PageHeader, StateMessage } from "../lib/ui/broker-ui";

export default async function BrokerTeamPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/team", session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent("/team")}`);
  if (session.status !== "authenticated" || !isBrokerProfile(session.profile)) redirect("/login?error=access_denied&returnTo=%2Fteam");

  return (
    <div className="page-stack">
      <PageHeader
        kicker="Equipe courtier"
        title="Equipe"
        description="Lecture tenant-safe du module equipe. Aucun endpoint courtier dedie n'est expose dans le portail actuel, donc aucune route admin n'est consommee."
        actions={<Badge tone="disabled">Module indisponible</Badge>}
      />

      <Card plain>
        <h2 className="section-title">Disponibilite du module</h2>
        <p className="page-description">
          La gestion d'equipe sera affichee ici uniquement lorsqu'une route courtier tenant-safe dediee sera disponible. Le portail courtier ne consomme pas de route admin.
        </p>
      </Card>

      <StateMessage title="Permissions conservees">
        Les roles existants restent controles par l'API et aucune action d'invitation, mutation ou export equipe n'est proposee depuis cet ecran.
      </StateMessage>
    </div>
  );
}
