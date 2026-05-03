import { redirect } from "next/navigation";
import { isStarterCrmDenied, loginRedirect, readBackOfficeSession } from "../../../lib/backoffice-auth";
import { Badge, Card, PageHeader, StateMessage } from "../../../lib/ui/broker-ui";

export default async function BrokerCrmLeadDetailPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/crm/leads/demo-lead", session.status));
  if (session.status !== "authenticated" || isStarterCrmDenied(session.profile)) {
    return (
      <div className="page-stack">
        <PageHeader
          kicker="CRM Pro/Enterprise"
          title="Acces CRM refuse"
          description="Le detail CRM exige un plan Pro/Enterprise, la MFA verifiee, le flag broker_crm_enabled et les permissions CRM."
        />
        <StateMessage tone="info">Le CRM complet est disponible avec le plan Pro.</StateMessage>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <a href="/crm/leads">Retour aux leads CRM</a>
      <PageHeader
        kicker="CRM Pro/Enterprise"
        title="AM-LEAD-2048"
        description="Detail CRM interne. Notes, documents internes et taches ne sont jamais visibles cote Web Publique Client."
        actions={<Badge tone="success">CRM autorise</Badge>}
      />

      <section className="split-layout">
        <div className="page-stack">
          <Card plain>
            <h2 className="section-title">Pipeline</h2>
            <div className="inline-cluster">
              {["Nouveau", "Contact tente", "Contacte", "Qualifie", "Reference devis", "Negociation", "Gagne", "Perdu"].map((status) => (
                <Badge key={status} tone={status === "Nouveau" ? "info" : "neutral"}>{status}</Badge>
              ))}
            </div>
          </Card>

          <Card plain>
            <h2 className="section-title">Activite interne</h2>
            <div className="inline-cluster">
              {["Note interne", "Tache commerciale", "Rappel"].map((label) => (
                <Badge key={label} tone="info">{label}</Badge>
              ))}
            </div>
          </Card>

          <Card plain>
            <h2 className="section-title">Documents et references</h2>
            <p className="page-description">
              Les propositions ou references de devis sont un suivi interne partenaire, pas une emission contractuelle par AssurMatch.
            </p>
            <div className="inline-cluster">
              {["Document interne", "Document prospect", "Reference devis"].map((label) => (
                <Badge key={label}>{label}</Badge>
              ))}
            </div>
          </Card>
        </div>

        <Card plain>
          <h2 className="section-title">Controle d'acces</h2>
          <ul className="simple-list">
            <li>Owner: organisation.</li>
            <li>Manager: equipe ou organisation selon permission.</li>
            <li>Agent: leads assignes.</li>
            <li>Read-only: lecture seule.</li>
          </ul>
        </Card>
      </section>
    </div>
  );
}
