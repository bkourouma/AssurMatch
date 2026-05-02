import { Badge, Card, PageHeader, StateMessage } from "../lib/ui/admin-ui";

export default function OperationsPage() {
  return (
    <div className="page-stack">
      <PageHeader
        kicker="Operations"
        title="Operations techniques"
        description="Supervision des controles operationnels sans changement des jobs, notifications, routage ou modules IA."
      />
      <section className="admin-grid admin-grid--two">
        <Card>
          <h2 className="section-title">Notifications et routage</h2>
          <p className="page-description">WhatsApp est couple a l'email, le routage reste un pre-check non transmissif et l'IA avancee reste inactive.</p>
          <Badge tone="info">Pre-check non transmissif</Badge>
        </Card>
        <Card>
          <h2 className="section-title">Modules sensibles</h2>
          <p className="page-description">Aucun paiement, signature, sinistre, emission de police, API assureur ou recommandation IA n'est active.</p>
          <Badge tone="disabled">Modules fermes</Badge>
        </Card>
      </section>
      <StateMessage>Les actions operationnelles dangereuses ne sont pas exposees par cette interface.</StateMessage>
    </div>
  );
}
