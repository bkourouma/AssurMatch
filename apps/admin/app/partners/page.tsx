import { readPartnerSla } from "../lib/admin-api";
import { Badge, Card, DataTable, PageHeader, StateMessage } from "../lib/ui/admin-ui";

export default async function PartnerCompliancePage() {
  const sla = await readPartnerSla();

  return (
    <div className="page-stack">
      <PageHeader
        kicker="Conformite partenaires"
        title="Partenaires courtiers"
        description="Suivi des partenaires, licences et agrements sans modification des controles existants."
      />
      <section className="admin-grid admin-grid--two">
        <Card>
          <h2 className="section-title">Licences et agrements</h2>
          <p className="page-description">Activation bloquee sans licence valide, preuve d'agrement acceptee et audit de conformite.</p>
          <Badge tone="warning">Licence expiree = blocage existant</Badge>
        </Card>
        <Card>
          <h2 className="section-title">Actions disponibles</h2>
          <p className="page-description">Aucune action destructive ou nouvelle activation n'est ajoutee par cette interface.</p>
          <Badge tone="disabled">Lecture operationnelle</Badge>
        </Card>
      </section>
      <Card>
        <h2 className="section-title">Engagement de reactivite (SLA) par partenaire</h2>
        <p className="page-description">
          Delai de premiere action mesure sur les 30 derniers jours. Indicateur de suivi: aucune suspension automatique n'est declenchee par ce tableau.
        </p>
        <DataTable
          columns={[
            { header: "Partenaire", render: (row) => <strong>{row.partnerName}</strong> },
            { header: "Plan", render: (row) => row.plan },
            { header: "Objectif", render: (row) => `${row.firstActionTargetMinutes} min` },
            { header: "Leads mesures", render: (row) => row.leadsMeasured },
            { header: "Dans l'objectif", render: (row) => row.leadsWithinTarget },
            { header: "Taux", render: (row) => <Badge tone={row.complianceRate >= 0.8 ? "info" : "warning"}>{Math.round(row.complianceRate * 100)}%</Badge> },
            { header: "Delai moyen", render: (row) => row.averageFirstActionMinutes === null ? "-" : `${row.averageFirstActionMinutes} min` }
          ]}
          items={sla.status === "success" ? sla.data : []}
          getKey={(row) => row.partnerTenantId}
          emptyLabel="Aucun partenaire mesure."
        />
      </Card>
      <StateMessage>Les donnees partenaires detaillees restent servies par les pages et API existantes.</StateMessage>
    </div>
  );
}
