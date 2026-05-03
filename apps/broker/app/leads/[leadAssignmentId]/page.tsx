import { redirect } from "next/navigation";
import { loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { Badge, Card, PageHeader, StateMessage } from "../../lib/ui/broker-ui";

export default async function BrokerLeadDetailPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/leads/demo-lead", session.status));
  if (session.status === "mfa_required" || session.status === "forbidden" || session.status === "error") {
    return (
      <div className="page-stack">
        <PageHeader
          kicker="Lead assigne"
          title="Acces refuse"
          description="Le detail du lead reste masque tant que la session, la MFA et le tenant courtier ne sont pas valides."
        />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <a href="/leads">Retour aux leads</a>
      <PageHeader
        kicker="Lead assigne au courtier connecte"
        title="Detail du lead assigne"
        description="Informations consenties, pays, produit, statut et historique minimal. Toute consultation detail est auditee et marque le lead comme vu lors du premier acces autorise."
        actions={<Badge tone="info">Tenant courtier verifie</Badge>}
      />

      <section className="broker-grid broker-grid--two">
        <Card plain>
          <h2 className="section-title">Informations utiles</h2>
          <dl className="definition-list">
            <dt>Pays</dt><dd>CI</dd>
            <dt>Produit</dt><dd>auto</dd>
            <dt>Statut</dt><dd><Badge tone="info">Vu</Badge></dd>
            <dt>Contact</dt><dd>Affiche uniquement si le lead est assigne au tenant connecte.</dd>
          </dl>
        </Card>
        <Card plain>
          <h2 className="section-title">Actions Starter</h2>
          <div className="inline-cluster">
            <Badge tone="success">Accepter</Badge>
            <Badge tone="warning">Rejeter avec motif</Badge>
            <Badge tone="info">Contester avec motif</Badge>
          </div>
          <p className="page-description">
            Ces actions suivent le workflow existant: rejet et contestation exigent un motif allowliste et toute contestation est historisee.
          </p>
        </Card>
      </section>

      <Card plain>
        <h2 className="section-title">Historique minimal</h2>
        <ol className="simple-list">
          <li>Lead assigne par routage conforme.</li>
          <li>Detail consulte et marque vu.</li>
          <li>Action courtier historisee avec acteur, date et motif lorsque requis.</li>
        </ol>
      </Card>

      <StateMessage title="Plan Starter">
        Le CRM complet est disponible avec le plan Pro. Le portail Starter ne presente pas Kanban, pipeline avance, taches, rappels ou assignation equipe comme disponibles.
      </StateMessage>
    </div>
  );
}
