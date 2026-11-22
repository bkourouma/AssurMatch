import { Badge, Button, Card, Cluster, Grid, PageHeader, PageStack, Stack, StateMessage } from "../lib/ui/admin-ui";

export default function ComplianceEvidencePage() {
  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Pilotage" }, { label: "Conformité" }]}
        title="Preuves de conformité"
        description="Les registres de preuve : consentements, audits, alertes et conservation des données."
      />
      <StateMessage>Cette page ne crée ni ne modifie aucune preuve : elle mène aux registres existants.</StateMessage>
      <Grid columns="two">
        <Card
          title="Preuves de consentement"
          description="Consentements : texte accepté, finalité, destinataire prévu et dates."
          actions={<Badge tone="success">Historique opposable</Badge>}
          footer={
            <Cluster>
              <Button href="/compliance/consent-records" variant="secondary" size="sm">Rechercher une preuve de consentement</Button>
            </Cluster>
          }
        >
          <Stack>
            <p>Retrouvez le consentement d&apos;un visiteur par référence de demande, e-mail ou pays. Réservé à la conformité et au Super Admin ; chaque recherche est journalisée.</p>
            <p className="bo-description">Les preuves critiques sont conservées selon la rétention applicable et masquées dans les logs.</p>
          </Stack>
        </Card>

        <Card
          title="Journaux d'audit"
          description="Audits : qui a fait quoi, sur quel objet, et quand."
          footer={
            <Cluster>
              <Button href="/compliance/audit-logs" variant="secondary" size="sm">Ouvrir les journaux d&apos;audit</Button>
            </Cluster>
          }
        >
          <p>Recherche par acteur, action, cible, résultat et période. L&apos;export CSV est réservé à la conformité et au Super Admin.</p>
        </Card>

        <Card
          title="Demandes de données des visiteurs"
          description="Accès, rectification ou effacement demandés par les visiteurs."
          footer={
            <Cluster>
              <Button href="/compliance/data-requests" variant="secondary" size="sm">Ouvrir la file des demandes</Button>
            </Cluster>
          }
        >
          <p>Demandes d&apos;accès, de rectification ou d&apos;effacement déposées par les visiteurs, avec échéance indicative et historique. Les demandes en retard sont signalées dans la file.</p>
        </Card>

        <Card
          title="Conservation et anonymisation"
          description="Durées de conservation, lots d'anonymisation et effacement sur demande."
          footer={
            <Cluster>
              <Button href="/compliance/retention" variant="secondary" size="sm">Gérer la rétention</Button>
            </Cluster>
          }
        >
          <p>Durées de conservation par catégorie, lots d&apos;anonymisation prévisualisés puis approuvés, effacement sur demande.</p>
        </Card>

        <Card
          title="Alertes de conformité"
          description="Suivi des alertes en cours."
          footer={
            <Cluster>
              <Button href="/dashboard/compliance-alerts" variant="secondary" size="sm">Voir les alertes</Button>
            </Cluster>
          }
        >
          <p>Les alertes conformité visibles restent issues des traces existantes.</p>
        </Card>
      </Grid>
    </PageStack>
  );
}
