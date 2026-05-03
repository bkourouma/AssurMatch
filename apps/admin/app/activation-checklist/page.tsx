import { readActivationChecklist } from "../lib/admin-api";
import { Badge, Card, DataTable, KpiCard, PageHeader, StateMessage } from "../lib/ui/admin-ui";

function tone(status: "passed" | "warning" | "blocked") {
  if (status === "passed") return "success";
  if (status === "warning") return "warning";
  return "danger";
}

export default async function ActivationChecklistPage() {
  const checklist = await readActivationChecklist();

  return (
    <div className="page-stack">
      <PageHeader
        kicker="Activation controlee"
        title="Checklist d'activation"
        description="Verification lecture seule des preconditions pays, produit, consentement, formulaire, partenaire, licence, offre et flags avant exposition publique."
      />

      {checklist.unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {checklist.forbidden ? <StateMessage tone="danger">Acces checklist refuse pour ce role admin.</StateMessage> : null}
      {checklist.status === "error" ? <StateMessage tone="danger">Checklist indisponible: {checklist.error}</StateMessage> : null}

      {checklist.status === "success" ? (
        <>
          <section className="admin-grid admin-grid--kpi" aria-label="Synthese checklist activation">
            <KpiCard label="Prets" value={checklist.data.summary.passed} tone="success" />
            <KpiCard label="A surveiller" value={checklist.data.summary.warning} tone="warning" />
            <KpiCard label="Bloquants" value={checklist.data.summary.blocked} tone="danger" />
          </section>

          <Card>
            <DataTable
              columns={[
                { header: "Section", render: (section) => <strong>{section.title}</strong> },
                { header: "Statut", render: (section) => <Badge tone={tone(section.status)}>{section.status}</Badge> },
                {
                  header: "Scope",
                  render: (section) => [
                    section.scope.countryCode,
                    section.scope.productKey,
                    section.scope.partnerId
                  ].filter(Boolean).join(" / ") || "global"
                },
                {
                  header: "Controles",
                  render: (section) => (
                    <ul className="simple-list">
                      {section.controls.map((control) => (
                        <li key={control.key}>
                          <Badge tone={tone(control.status)}>{control.status}</Badge> {control.label}: {control.evidence}
                        </li>
                      ))}
                    </ul>
                  )
                }
              ]}
              items={checklist.data.sections}
              getKey={(section) => section.key}
              emptyLabel="Aucune precondition d'activation disponible."
            />
          </Card>

          <StateMessage tone="warning">
            Cette surface ne modifie aucun flag, pays, produit, partenaire, licence, offre ou formulaire. Les activations restent traitees par les controles existants et leurs audits.
          </StateMessage>
        </>
      ) : null}
    </div>
  );
}
