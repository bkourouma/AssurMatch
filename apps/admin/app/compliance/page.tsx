import { Badge, Button, Card, Cluster, DescriptionList, PageHeader, PageStack, Stack, StateMessage } from "../lib/ui/admin-ui";

export default function ComplianceEvidencePage() {
  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Pilotage" }, { label: "Conformité" }]}
        title="Preuves de conformité"
        description="Les registres de preuve : consentements, audits, alertes et conservation des données."
      />
      <StateMessage>Cette page ne crée ni ne modifie aucune preuve : elle mène aux registres existants.</StateMessage>
      <Card title="Registres">
        <DescriptionList
          items={[
            {
              term: "Consentements et audits",
              value: (
                <Stack>
                  <p>Les preuves critiques sont conservées selon la rétention applicable et masquées dans les logs.</p>
                  <Cluster>
                    <Badge tone="success">Historique opposable</Badge>
                    <Button href="/compliance/consent-records" variant="secondary" size="sm">Rechercher une preuve de consentement</Button>
                    <Button href="/compliance/audit-logs" variant="secondary" size="sm">Ouvrir les journaux d&apos;audit</Button>
                  </Cluster>
                </Stack>
              )
            },
            {
              term: "Alertes",
              value: (
                <Stack>
                  <p>Les alertes conformité visibles restent issues des traces existantes.</p>
                  <Cluster>
                    <Button href="/dashboard/compliance-alerts" variant="secondary" size="sm">Voir les alertes</Button>
                  </Cluster>
                </Stack>
              )
            },
            {
              term: "Conservation et anonymisation",
              value: (
                <Stack>
                  <p>Durées de conservation par catégorie, lots d&apos;anonymisation prévisualisés puis approuvés, effacement sur demande.</p>
                  <Cluster>
                    <Button href="/compliance/retention" variant="secondary" size="sm">Gérer la rétention</Button>
                  </Cluster>
                </Stack>
              )
            },
            {
              term: "Demandes de données des visiteurs",
              value: (
                <Stack>
                  <p>Demandes d&apos;accès, de rectification ou d&apos;effacement déposées par les visiteurs, avec échéance indicative et historique.</p>
                  <Cluster>
                    <Button href="/compliance/data-requests" variant="secondary" size="sm">Ouvrir la file des demandes</Button>
                  </Cluster>
                </Stack>
              )
            }
          ]}
        />
      </Card>
    </PageStack>
  );
}
