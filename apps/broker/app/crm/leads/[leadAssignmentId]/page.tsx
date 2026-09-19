import { redirect } from "next/navigation";
import { isStarterCrmDenied, loginRedirect, readBackOfficeSession } from "../../../lib/backoffice-auth";
import { listLeadAiInteractions, readBrokerAIAssistance, readCrmLeadDetail } from "../../../lib/broker-api";
import { Badge, Card, PageHeader, StateMessage } from "../../../lib/ui/broker-ui";
import { LeadAiPanel } from "./lead-ai-panel";

const PIPELINE = ["Nouveau", "Contact tente", "Contacte", "Qualifie", "Reference devis", "Negociation", "Gagne", "Perdu"];

export default async function BrokerCrmLeadDetailPage({ params, searchParams }: { params: Promise<{ leadAssignmentId: string }>; searchParams: Promise<{ ai?: string }> }) {
  const { leadAssignmentId } = await params;
  const { ai } = await searchParams;
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect(`/crm/leads/${leadAssignmentId}`, session.status));
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

  const [detail, assistance, interactions] = await Promise.all([readCrmLeadDetail(leadAssignmentId), readBrokerAIAssistance(), listLeadAiInteractions(leadAssignmentId)]);
  if (detail.unauthenticated) redirect(loginRedirect(`/crm/leads/${leadAssignmentId}`, detail.error ?? "session_required"));
  const lead = detail.status === "success" ? detail.data : undefined;

  return (
    <div className="page-stack">
      <a href="/crm/leads">Retour aux leads CRM</a>
      <PageHeader
        kicker="CRM Pro/Enterprise"
        title={lead?.publicReference || "Lead CRM"}
        description="Detail CRM interne. Notes, documents internes et taches ne sont jamais visibles cote Web Publique Client."
        actions={<Badge tone="success">CRM autorise</Badge>}
      />

      {detail.status === "forbidden" ? <StateMessage tone="warning" title="Acces refuse">Ce lead n'est pas accessible avec vos permissions CRM ou votre tenant.</StateMessage> : null}
      {detail.status === "error" ? <StateMessage tone="warning" title="Lead indisponible">{detail.error ?? "erreur inconnue"}</StateMessage> : null}

      <section className="split-layout">
        <div className="page-stack">
          <Card plain>
            <h2 className="section-title">Pipeline</h2>
            <div className="inline-cluster">
              {PIPELINE.map((status) => (
                <Badge key={status} tone={lead && status.toLowerCase().replace(" ", "_") === lead.status ? "info" : "neutral"}>{status}</Badge>
              ))}
            </div>
            {lead ? (
              <dl className="definition-list">
                <dt>Statut</dt><dd>{lead.status}</dd>
                <dt>Exclusivite</dt>
                <dd>
                  {lead.isShared
                    ? `Lead partage avec ${(lead.recipientCount ?? 2) - 1} autre(s) courtier(s) partenaire(s), au tarif reduit. L'identite des autres courtiers n'est pas communiquee.`
                    : "Lead exclusif: vous etes le seul courtier partenaire destinataire."}
                </dd>
                <dt>Pays / produit</dt><dd>{lead.countryCode} / {lead.productKey}</dd>
                <dt>Urgence</dt><dd>{lead.urgency}</dd>
                <dt>Source</dt><dd>{lead.source}</dd>
                <dt>Recu le</dt><dd>{lead.assignedAt ? new Date(lead.assignedAt).toISOString().slice(0, 10) : "-"}</dd>
                <dt>Contact</dt><dd>{[lead.prospectName, lead.emailMasked, lead.phoneMasked].filter(Boolean).join(" - ") || "Masque"}</dd>
              </dl>
            ) : null}
          </Card>

          {lead && Object.keys(lead.answers).length > 0 ? (
            <Card plain>
              <h2 className="section-title">Reponses consenties</h2>
              <dl className="definition-list">
                {Object.entries(lead.answers).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : JSON.stringify(value)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ) : null}

          <Card plain>
            <h2 className="section-title">Activite interne</h2>
            <div className="inline-cluster">
              <Badge tone="info">Note interne ({lead?.notes.length ?? 0})</Badge>
              <Badge tone="info">Tache commerciale ({lead?.tasks.length ?? 0})</Badge>
              <Badge tone="info">Rappel</Badge>
            </div>
          </Card>

          <Card plain>
            <h2 className="section-title">Documents et references</h2>
            <p className="page-description">
              Les propositions ou references de devis sont un suivi interne partenaire, pas une emission contractuelle par AssurMatch.
            </p>
            <div className="inline-cluster">
              <Badge>Document interne ({lead?.documents.length ?? 0})</Badge>
              <Badge>Document prospect</Badge>
              <Badge>Reference devis ({lead?.proposals.length ?? 0})</Badge>
            </div>
          </Card>

          <LeadAiPanel
            leadAssignmentId={leadAssignmentId}
            enabled={assistance.status === "success" && assistance.data.enabled && Boolean(lead)}
            availableAssistTypes={assistance.data.availableAssistTypes}
            interactions={interactions.status === "success" ? interactions.data : []}
            notice={ai}
          />
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
