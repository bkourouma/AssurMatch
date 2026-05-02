import { Badge, Card, PageHeader, StateMessage } from "../lib/ui/admin-ui";

export default function ComplianceEvidencePage() {
  return (
    <div className="page-stack">
      <PageHeader
        kicker="Conformite"
        title="Preuves de conformite"
        description="Vue structuree des exigences de preuve: consentements, audits, licences et documents."
      />
      <section className="admin-grid admin-grid--two">
        <Card>
          <h2 className="section-title">Consentements et audits</h2>
          <p className="page-description">Les preuves critiques sont conservees selon la retention applicable et masquees dans les logs.</p>
          <Badge tone="success">Historique opposable</Badge>
        </Card>
        <Card>
          <h2 className="section-title">Alertes</h2>
          <p className="page-description">Les alertes conformite visibles restent issues des traces existantes.</p>
          <a className="button button--secondary" href="/dashboard/compliance-alerts">Voir les alertes</a>
        </Card>
      </section>
      <StateMessage>Aucune preuve n'est creee ou modifiee par cette page de polish UX.</StateMessage>
    </div>
  );
}
