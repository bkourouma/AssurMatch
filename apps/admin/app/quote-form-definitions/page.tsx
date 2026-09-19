import { readQuoteFormDefinitions, type QuoteFormDefinitionData } from "../lib/admin-api";
import { Badge, Card, DataTable, KpiCard, PageHeader, StateMessage } from "../lib/ui/admin-ui";
import { CreateQuoteFormDefinitionForm, PublishQuoteFormDefinitionForm, RetireQuoteFormDefinitionForm } from "./quote-form-forms";

const statusTones: Record<QuoteFormDefinitionData["status"], "success" | "warning" | "disabled" | "neutral"> = {
  published: "success",
  draft: "neutral",
  suspended: "warning",
  retired: "disabled"
};

function scopeKey(form: QuoteFormDefinitionData): string {
  return `${form.countryId}:${form.productId}:${form.language}`;
}

export default async function AdminQuoteFormDefinitionsPage() {
  const forms = await readQuoteFormDefinitions();
  const items = forms.data;
  const published = items.filter((form) => form.status === "published");
  const drafts = items.filter((form) => form.status === "draft");
  const exposedScopes = new Set(published.map(scopeKey));

  return (
    <div className="page-stack">
      <PageHeader
        kicker="Parcours devis"
        title="Formulaires de demande de devis"
        description="Definitions versionnees par pays, produit et langue. Un formulaire n'est expose aux visiteurs qu'une fois publie et lie a un texte de consentement publie."
      />

      {forms.unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {forms.forbidden ? <StateMessage tone="danger">Acces aux formulaires de devis refuse pour ce role admin.</StateMessage> : null}
      {forms.status === "error" ? <StateMessage tone="danger">Formulaires indisponibles: {forms.error}</StateMessage> : null}

      {forms.status === "success" ? (
        <>
          <section className="admin-grid admin-grid--kpi" aria-label="Synthese formulaires">
            <KpiCard label="Versions publiees" value={published.length} tone={published.length > 0 ? "success" : "warning"} />
            <KpiCard label="Brouillons" value={drafts.length} tone="neutral" />
            <KpiCard label="Parcours exposes" value={exposedScopes.size} tone={exposedScopes.size > 0 ? "success" : "warning"} />
          </section>

          <Card>
            <h2 className="section-title">Versions</h2>
            <DataTable
              columns={[
                { header: "Pays", render: (form) => <code>{form.countryId.slice(0, 8)}</code> },
                { header: "Produit", render: (form) => <code>{form.productId.slice(0, 8)}</code> },
                { header: "Langue", render: (form) => form.language },
                { header: "Version", render: (form) => form.version },
                { header: "Statut", render: (form) => <Badge tone={statusTones[form.status]}>{form.status}</Badge> },
                { header: "Champs", render: (form) => form.fieldCount },
                { header: "Consentement", render: (form) => <code>{form.consentTextId.slice(0, 8)}</code> },
                { header: "Publie le", render: (form) => form.publishedAt?.slice(0, 10) ?? "-" },
                { header: "Identifiant", render: (form) => <code>{form.id}</code> }
              ]}
              items={items}
              getKey={(form) => form.id}
              emptyLabel="Aucune definition: le parcours de demande de devis reste indisponible cote public."
            />
          </Card>

          {published.length === 0 ? (
            <StateMessage tone="warning">
              Aucune version publiee: la demande de devis est indisponible pour tous les pays et produits. La checklist d'activation le signale comme bloquant.
            </StateMessage>
          ) : null}

          <section className="admin-grid admin-grid--two">
            <CreateQuoteFormDefinitionForm />
            <PublishQuoteFormDefinitionForm formIds={items.filter((form) => form.status !== "published").map((form) => form.id)} />
          </section>

          <section className="admin-grid admin-grid--two">
            <RetireQuoteFormDefinitionForm formIds={published.map((form) => form.id)} />
            <Card>
              <h2 className="section-title">Regles de publication</h2>
              <ul>
                <li>Le texte de consentement doit etre publie et de finalite transmission de lead.</li>
                <li>Les libelles de champ sont exposes aux visiteurs: le vocabulaire reglemente y est refuse.</li>
                <li>Un champ sensible n'est publiable que si le flag produit correspondant est ouvert.</li>
                <li>Une seule version publiee par pays, produit et langue: publier retire la precedente.</li>
              </ul>
            </Card>
          </section>
        </>
      ) : null}
    </div>
  );
}
