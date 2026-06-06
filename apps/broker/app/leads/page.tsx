import { redirect } from "next/navigation";
import { listStarterLeads } from "../lib/broker-api";
import { loginRedirect } from "../lib/backoffice-auth";
import { Badge, DataTable, PageHeader, StateMessage } from "../lib/ui/broker-ui";
import { leadSummary } from "../lib/ui/broker-view-models";

export default async function BrokerLeadsPage() {
  const apiLeads = await listStarterLeads();
  if (apiLeads.unauthenticated) redirect(loginRedirect("/leads", apiLeads.error ?? "session_required"));
  const leads = apiLeads.data.items.map(leadSummary);

  return (
    <div className="page-stack">
      <PageHeader
        kicker="Portail Starter"
        title="Leads assignes"
        description="Le courtier voit uniquement les leads qui lui sont assignes. Les donnees personnelles ne sont affichees qu'apres controle du tenant connecte."
        actions={<Badge tone="info">Export controle par permission et audit</Badge>}
      />

      <form aria-label="Filtres leads" className="form-grid">
        {["Statut", "Produit", "Pays", "Date"].map((label) => (
          <label key={label} className="field">
            {label}
            <select>
              <option>Tous</option>
            </select>
          </label>
        ))}
      </form>

      {apiLeads.forbidden ? <StateMessage tone="danger">Acces refuse ou MFA requis pour ce portail. Aucune donnee protegee n'est affichee.</StateMessage> : null}
      {apiLeads.error && !apiLeads.forbidden ? <StateMessage tone="warning">API leads indisponible. Aucune donnee protegee n'est affichee en mode erreur.</StateMessage> : null}

      {!apiLeads.forbidden ? (
        <DataTable
          items={leads}
          getKey={(lead) => lead.id}
          emptyLabel="Aucun lead autorise a afficher."
          columns={[
            { header: "Reference", render: (lead) => <a href={`/leads/${lead.id}`}>{lead.reference}</a> },
            { header: "Pays", render: (lead) => lead.country },
            { header: "Produit", render: (lead) => lead.product },
            { header: "Statut", render: (lead) => <Badge tone={lead.statusTone}>{lead.status}</Badge> },
            { header: "Date", render: (lead) => lead.assignedAt },
            { header: "Vu", render: (lead) => lead.seen }
          ]}
        />
      ) : null}

      <StateMessage title="Limites Starter">
        Aucun Kanban, assignation equipe ou CRM avance n'est active pour le portail Starter. Le CRM complet est disponible avec le plan Pro.
      </StateMessage>
    </div>
  );
}
