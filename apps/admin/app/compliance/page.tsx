import { Badge, Button, Card, Grid, PageHeader, PageStack, StateMessage } from "../lib/ui/admin-ui";

export default function ComplianceEvidencePage() {
  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Pilotage" }, { label: "Conformite" }]}
        kicker="Conformite"
        title="Preuves de conformite"
        description="Vue structuree des exigences de preuve: consentements, audits, licences et documents."
      />
      <Grid columns="two">
        <Card
          title="Consentements et audits"
          description="Les preuves critiques sont conservees selon la retention applicable et masquees dans les logs."
        >
          <Badge tone="success">Historique opposable</Badge>
        </Card>
        <Card
          title="Alertes"
          description="Les alertes conformite visibles restent issues des traces existantes."
        >
          <Button href="/dashboard/compliance-alerts" variant="secondary">Voir les alertes</Button>
        </Card>
      </Grid>
      <StateMessage>Aucune preuve n'est creee ou modifiee par cette page de polish UX.</StateMessage>
    </PageStack>
  );
}
