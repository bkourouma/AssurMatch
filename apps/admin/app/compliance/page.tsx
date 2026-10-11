import { Badge, Button, Card, Cluster, DescriptionList, PageHeader, PageStack, Stack, StateMessage } from "../lib/ui/admin-ui";

export default function ComplianceEvidencePage() {
  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Pilotage" }, { label: "Conformite" }]}
        title="Preuves de conformite"
        description="Les registres de preuve : consentements, audits, alertes et conservation des donnees."
      />
      <StateMessage>Cette page ne cree ni ne modifie aucune preuve : elle mene aux registres existants.</StateMessage>
      <Card title="Registres">
        <DescriptionList
          items={[
            {
              term: "Consentements et audits",
              value: (
                <Stack>
                  <p>Les preuves critiques sont conservees selon la retention applicable et masquees dans les logs.</p>
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
                  <p>Les alertes conformite visibles restent issues des traces existantes.</p>
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
                  <p>Durees de conservation par categorie, lots d&apos;anonymisation previsualises puis approuves, effacement sur demande.</p>
                  <Cluster>
                    <Button href="/compliance/retention" variant="secondary" size="sm">Gerer la retention</Button>
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
