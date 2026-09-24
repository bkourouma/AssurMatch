import { readQuoteFormDefinitions, type QuoteFormDefinitionData } from "../lib/admin-api";
import {
  Card,
  DataTable,
  Field,
  FilterBar,
  Grid,
  KpiCard,
  PageHeader,
  PageStack,
  Select,
  StateMessage,
  StatusBadge,
  fieldControlProps,
  paginateItems,
  quoteFormStatusTones,
  readTableParams,
  sortItems
} from "../lib/ui/admin-ui";
import type { DataTableColumn } from "../lib/ui/admin-ui";
import { CreateQuoteFormDefinitionForm, PublishQuoteFormDefinitionForm, RetireQuoteFormDefinitionForm } from "./quote-form-forms";

const statusOptions = ["published", "draft", "suspended", "retired"];

function scopeKey(form: QuoteFormDefinitionData): string {
  return `${form.countryId}:${form.productId}:${form.language}`;
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

const columns: Array<DataTableColumn<QuoteFormDefinitionData>> = [
  { key: "country", header: "Pays", render: (form) => <code>{form.countryId.slice(0, 8)}</code>, sortable: true, sortValue: (form) => form.countryId },
  { key: "product", header: "Produit", render: (form) => <code>{form.productId.slice(0, 8)}</code>, sortable: true, sortValue: (form) => form.productId },
  { key: "language", header: "Langue", render: (form) => form.language, sortable: true, sortValue: (form) => form.language },
  { key: "version", header: "Version", render: (form) => form.version, sortable: true, sortValue: (form) => form.version },
  {
    key: "status",
    header: "Statut",
    render: (form) => <StatusBadge status={form.status} tones={quoteFormStatusTones} />,
    sortable: true,
    sortValue: (form) => form.status
  },
  { key: "fieldCount", header: "Champs", render: (form) => form.fieldCount, numeric: true, align: "right", sortable: true, sortValue: (form) => form.fieldCount },
  { key: "consent", header: "Consentement", render: (form) => <code>{form.consentTextId.slice(0, 8)}</code> },
  {
    key: "publishedAt",
    header: "Publie le",
    render: (form) => form.publishedAt?.slice(0, 10) ?? "-",
    sortable: true,
    sortValue: (form) => form.publishedAt ?? null
  },
  { key: "id", header: "Identifiant", render: (form) => <code>{form.id}</code> }
];

export default async function AdminQuoteFormDefinitionsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const statusFilter = firstParam(params.status);
  const forms = await readQuoteFormDefinitions();
  const items = forms.data;
  const published = items.filter((form) => form.status === "published");
  const drafts = items.filter((form) => form.status === "draft");
  const exposedScopes = new Set(published.map(scopeKey));

  const table = readTableParams(params, {
    pathname: "/quote-form-definitions",
    defaultSort: { key: "publishedAt", direction: "desc" },
    pageSize: 25
  });
  const visible = statusFilter ? items.filter((form) => form.status === statusFilter) : items;
  const rows = paginateItems(sortItems(visible, columns, table.sort), table.page, table.pageSize);

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Catalogue" }, { label: "Formulaires devis" }]}
        kicker="Parcours devis"
        title="Formulaires de demande de devis"
        description="Definitions versionnees par pays, produit et langue. Un formulaire n'est expose aux visiteurs qu'une fois publie et lie a un texte de consentement publie."
      />

      {forms.unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {forms.forbidden ? <StateMessage tone="danger">Acces aux formulaires de devis refuse pour ce role admin.</StateMessage> : null}
      {forms.status === "error" ? <StateMessage tone="danger">Formulaires indisponibles: {forms.error}</StateMessage> : null}

      {forms.status === "success" ? (
        <>
          <Grid columns="kpi" as="section" aria-label="Synthese formulaires">
            <KpiCard label="Versions publiees" value={published.length} tone={published.length > 0 ? "success" : "warning"} />
            <KpiCard label="Brouillons" value={drafts.length} tone="neutral" />
            <KpiCard label="Parcours exposes" value={exposedScopes.size} tone={exposedScopes.size > 0 ? "success" : "warning"} />
          </Grid>

          <Card title="Versions">
            <FilterBar
              action="/quote-form-definitions"
              label="Filtres formulaires de devis"
              submitLabel="Filtrer"
              resetLabel="Reinitialiser"
              resetHref="/quote-form-definitions"
              activeCount={statusFilter ? 1 : 0}
              autoSubmit
            >
              <Field id="quote-form-status" label="Statut">
                <Select {...fieldControlProps("quote-form-status")} name="status" defaultValue={statusFilter}>
                  <option value="">Tous</option>
                  {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </Select>
              </Field>
            </FilterBar>
            <DataTable
              columns={columns}
              items={rows}
              getKey={(form) => form.id}
              emptyLabel="Aucune definition: le parcours de demande de devis reste indisponible cote public."
              aria-label="Versions de formulaire de devis"
              sort={table.sort}
              sortHref={table.sortHref}
              pagination={{
                page: table.page,
                pageSize: table.pageSize,
                total: visible.length,
                hrefFor: table.pageHref,
                label: (from, to, total) => `${from}-${to} sur ${total} versions`
              }}
            />
          </Card>

          {published.length === 0 ? (
            <StateMessage tone="warning">
              Aucune version publiee: la demande de devis est indisponible pour tous les pays et produits. La checklist d'activation le signale comme bloquant.
            </StateMessage>
          ) : null}

          <Grid columns="two">
            <CreateQuoteFormDefinitionForm />
            <PublishQuoteFormDefinitionForm formIds={items.filter((form) => form.status !== "published").map((form) => form.id)} />
          </Grid>

          <Grid columns="two">
            <RetireQuoteFormDefinitionForm formIds={published.map((form) => form.id)} />
            <Card title="Regles de publication">
              <ul className="bo-list">
                <li>Le texte de consentement doit etre publie et de finalite transmission de lead.</li>
                <li>Les libelles de champ sont exposes aux visiteurs: le vocabulaire reglemente y est refuse.</li>
                <li>Un champ sensible n'est publiable que si le flag produit correspondant est ouvert.</li>
                <li>Une seule version publiee par pays, produit et langue: publier retire la precedente.</li>
              </ul>
            </Card>
          </Grid>
        </>
      ) : null}
    </PageStack>
  );
}
