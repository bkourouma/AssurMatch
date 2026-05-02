import { Badge, Card, PageHeader, StateMessage } from "../lib/ui/admin-ui";

export default function PartnerCompliancePage() {
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
      <StateMessage>Les donnees partenaires detaillees restent servies par les pages et API existantes.</StateMessage>
    </div>
  );
}
