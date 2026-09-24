import { readActivationChecklist } from "../lib/admin-api";
import {
  Card,
  DataTable,
  Grid,
  KpiCard,
  PageHeader,
  PageStack,
  StateMessage,
  StatusBadge,
  checklistStatusTones
} from "../lib/ui/admin-ui";

export default async function ActivationChecklistPage() {
  const checklist = await readActivationChecklist();

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Plateforme" }, { label: "Activation" }]}
        kicker="Activation controlee"
        title="Checklist technique d'activation"
        description="Verification lecture seule des preconditions techniques pays, produit, consentement, formulaire, partenaire, licence, offre et flags avant exposition publique."
      />

      {checklist.unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {checklist.forbidden ? <StateMessage tone="danger">Acces checklist refuse pour ce role admin.</StateMessage> : null}
      {checklist.status === "error" ? <StateMessage tone="danger">Checklist indisponible: {checklist.error}</StateMessage> : null}

      {checklist.status === "success" ? (
        <>
          <Grid columns="kpi" as="section" aria-label="Synthese checklist activation">
            <KpiCard label="Prets techniquement" value={checklist.data.summary.passed} tone="success" />
            <KpiCard label="A surveiller" value={checklist.data.summary.warning} tone="warning" />
            <KpiCard label="Bloquants" value={checklist.data.summary.blocked} tone="danger" />
          </Grid>

          <Card>
            <DataTable
              columns={[
                { key: "section", header: "Section", render: (section) => <strong>{section.title}</strong> },
                { key: "status", header: "Statut", render: (section) => <StatusBadge status={section.status} tones={checklistStatusTones} /> },
                {
                  key: "scope",
                  header: "Scope",
                  render: (section) => [
                    section.scope.countryCode,
                    section.scope.productKey,
                    section.scope.partnerId
                  ].filter(Boolean).join(" / ") || "global"
                },
                {
                  key: "controls",
                  header: "Controles",
                  render: (section) => (
                    <ul className="bo-list">
                      {section.controls.map((control) => (
                        <li key={control.key}>
                          <StatusBadge status={control.status} tones={checklistStatusTones} /> {control.label}: {control.evidence}
                        </li>
                      ))}
                    </ul>
                  )
                }
              ]}
              items={checklist.data.sections}
              getKey={(section) => section.key}
              emptyLabel="Aucune precondition d'activation disponible."
              aria-label="Preconditions techniques d'activation"
            />
          </Card>

          <StateMessage tone="warning">
            Cette surface ne modifie aucun flag, pays, produit, partenaire, licence, offre ou formulaire. Elle ne remplace pas le go/no-go conformite, juridique, support ou operations.
          </StateMessage>
        </>
      ) : null}
    </PageStack>
  );
}
