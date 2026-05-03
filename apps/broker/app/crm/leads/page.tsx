import { redirect } from "next/navigation";
import { loginRedirect } from "../../lib/backoffice-auth";
import { listCrmLeads } from "../../lib/broker-api";
import { Badge, DataTable, PageHeader, StateMessage } from "../../lib/ui/broker-ui";
import { leadSummary } from "../../lib/ui/broker-view-models";

export default async function BrokerCrmLeadsPage() {
  const apiLeads = await listCrmLeads();
  if (apiLeads.unauthenticated) redirect(loginRedirect("/crm/leads", apiLeads.error ?? "session_required"));
  const leads = apiLeads.data.items.map(leadSummary);

  return (
    <div className="page-stack">
      <PageHeader
        kicker="CRM Pro/Enterprise"
        title="Leads CRM"
        description="Vue tableau des leads autorises selon role, tenant, conseiller et permissions PII."
        actions={<Badge tone="info">Export controle par permission et audit</Badge>}
      />

      <form aria-label="Filtres CRM" className="form-grid form-grid--crm">
        {["Statut", "Produit", "Pays", "Conseiller", "Urgence", "Source"].map((label) => (
          <label key={label} className="field">
            {label}
            <select>
              <option>Tous</option>
            </select>
          </label>
        ))}
      </form>

      <label className="field">
        Recherche autorisee
        <input placeholder="Nom, reference, telephone ou email selon permission" />
      </label>

      {apiLeads.forbidden ? <StateMessage tone="danger">Acces CRM refuse, verifiez le plan, la MFA et le flag broker_crm_enabled. Aucune donnee CRM n'est affichee.</StateMessage> : null}
      {apiLeads.error && !apiLeads.forbidden ? <StateMessage tone="warning">API CRM indisponible. Aucune donnee protegee n'est affichee en mode erreur.</StateMessage> : null}

      {!apiLeads.forbidden ? (
        <DataTable
          items={leads}
          getKey={(lead) => lead.id}
          emptyLabel="Aucun lead CRM autorise a afficher."
          columns={[
            { header: "Reference", render: (lead) => <a href={`/crm/leads/${lead.id}`}>{lead.reference}</a> },
            { header: "Pays", render: (lead) => lead.country },
            { header: "Produit", render: (lead) => lead.product },
            { header: "Statut", render: (lead) => <Badge tone={lead.statusTone}>{lead.status}</Badge> },
            { header: "Conseiller", render: (lead) => lead.advisor ?? "-" },
            { header: "Urgence", render: (lead) => lead.urgency ?? "-" },
            { header: "Source", render: (lead) => lead.source ?? "-" }
          ]}
        />
      ) : null}
    </div>
  );
}
