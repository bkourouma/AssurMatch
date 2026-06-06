import { readAdminAIAssistance } from "../lib/admin-api";
import { Badge, Card, DataTable, PageHeader, StateMessage } from "../lib/ui/admin-ui";

export default async function AdminAIAssistancePage() {
  const assistance = await readAdminAIAssistance();

  return (
    <div className="page-stack">
      <PageHeader
        kicker="IA controlee"
        title="Assistance IA admin"
        description="Statut lecture seule des assistances IA. Aucun appel modele, aucune decision automatisee, aucune donneee prospect envoyee."
      />
      {assistance.forbidden ? <StateMessage tone="danger">Acces assistance IA refuse pour ce role admin.</StateMessage> : null}
      {assistance.status === "error" ? <StateMessage tone="danger">Assistance IA indisponible: {assistance.error}</StateMessage> : null}
      {assistance.status === "success" ? (
        <>
          <section className="admin-grid admin-grid--two">
            <Card>
              <h2 className="section-title">Garde-fous</h2>
              <div className="admin-grid">
                <Badge tone="disabled">enabled: false</Badge>
                <Badge tone="disabled">modelCall: false</Badge>
                <Badge tone="warning">validation humaine obligatoire</Badge>
                <Badge tone="info">audit metadata_only</Badge>
              </div>
            </Card>
            <Card>
              <h2 className="section-title">Types disponibles</h2>
              <ul className="simple-list">
                {assistance.data.availableAssistTypes.map((assistType) => <li key={assistType}>{assistType}</li>)}
              </ul>
            </Card>
          </section>
          <Card>
            <DataTable
              columns={[
                { header: "Flag", render: (flag) => <code>{flag.key}</code> },
                { header: "Etat", render: (flag) => <Badge tone={flag.value ? "warning" : "disabled"}>{flag.value ? "actif" : "desactive"}</Badge> },
                { header: "Requis", render: (flag) => flag.required ? "oui" : "non" }
              ]}
              items={assistance.data.flags}
              getKey={(flag) => flag.key}
              emptyLabel="Aucun flag IA reference."
            />
          </Card>
          <StateMessage tone="warning">{assistance.data.message}</StateMessage>
        </>
      ) : null}
    </div>
  );
}
