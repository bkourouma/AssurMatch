import { redirect } from "next/navigation";
import { isBrokerProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { Badge, Card, Notice, PageHeader, PageStack } from "../lib/ui/broker-ui";

export default async function BrokerTeamPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/team", session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent("/team")}`);
  if (session.status !== "authenticated" || !isBrokerProfile(session.profile)) redirect("/login?error=access_denied&returnTo=%2Fteam");

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Organisation" }, { label: "Equipe" }]}
        kicker="Equipe courtier"
        title="Equipe"
        description="Lecture tenant-safe du module equipe. Aucun endpoint courtier dedie n'est expose dans le portail actuel, donc aucune route admin n'est consommee."
        actions={<Badge tone="disabled">Module indisponible</Badge>}
      />

      <Card title="Disponibilite du module">
        <p>
          La gestion d'equipe sera affichee ici uniquement lorsqu'une route courtier tenant-safe dediee sera disponible. Le portail courtier ne consomme pas de route admin.
        </p>
      </Card>

      <Notice tone="info" title="Permissions conservees">
        Les roles existants restent controles par l'API et aucune action d'invitation, mutation ou export equipe n'est proposee depuis cet ecran.
      </Notice>
    </PageStack>
  );
}
