import { readAdminCountries, readAdminProducts, readQuoteFormDefinitions, type QuoteFormDefinitionData } from "../lib/admin-api";
import { ActiveFilters, hrefWithout, type ActiveFilterItem } from "../lib/ui/active-filter-chips";
import {
  Badge,
  Button,
  DataTable,
  Field,
  FilterBar,
  Grid,
  Notice,
  PageHeader,
  PageStack,
  Select,
  Stack,
  StateMessage,
  StatStrip,
  StatusBadge,
  fieldControlProps,
  paginateItems,
  quoteFormStatusTones,
  readTableParams,
  sortItems
} from "../lib/ui/admin-ui";
import type { DataTableColumn } from "../lib/ui/admin-ui";
import { CreateQuoteFormDefinitionForm, PublishQuoteFormDefinitionForm, RetireQuoteFormDefinitionForm } from "./quote-form-forms";
import { readFailureDetail } from "../lib/auth-error-messages";

const statusOptions = ["published", "draft", "suspended", "retired"];
const languageOptions = ["fr", "en"];

/** Filter wording only: the table keeps the raw status badge. */
const STATUS_FILTER_LABELS: Record<string, string> = {
  published: "Publié",
  draft: "Brouillon",
  suspended: "Suspendu",
  retired: "Retiré"
};

/** Status of a version and what to do next (workflow brouillon, publié, retiré). */
function nextStepOf(form: QuoteFormDefinitionData): string {
  if (form.status === "draft") return "publier (après vérification du consentement lié)";
  if (form.status === "published") return form.consentSuperseded ? "créer une nouvelle version liée au consentement à jour" : "en ligne ; retirer pour couper l'exposition";
  if (form.status === "suspended") return "publier à nouveau ou retirer";
  return "aucune (historique conservé)";
}

function scopeKey(form: QuoteFormDefinitionData): string {
  return `${form.countryId}:${form.productId}:${form.language}`;
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function buildColumns(countryLabel: (id: string) => string, productLabel: (id: string) => string): Array<DataTableColumn<QuoteFormDefinitionData>> {
  return [
  { key: "country", header: "Pays", render: (form) => <span className="bo-ref" title={form.countryId}>{countryLabel(form.countryId)}</span>, sortable: true, sortValue: (form) => countryLabel(form.countryId) },
  { key: "product", header: "Produit", render: (form) => <span title={form.productId}>{productLabel(form.productId)}</span>, sortable: true, sortValue: (form) => productLabel(form.productId) },
  { key: "language", header: "Langue", render: (form) => form.language, sortable: true, sortValue: (form) => form.language },
  { key: "version", header: "Version", render: (form) => form.version, sortable: true, sortValue: (form) => form.version },
  {
    key: "status",
    header: "Statut",
    render: (form) => (
      <>
        <StatusBadge status={form.status} tones={quoteFormStatusTones} />
        <div className="bo-description">Prochaine étape : {nextStepOf(form)}</div>
      </>
    ),
    sortable: true,
    sortValue: (form) => form.status
  },
  { key: "fieldCount", header: "Champs", render: (form) => form.fieldCount, numeric: true, align: "right", sortable: true, sortValue: (form) => form.fieldCount },
  {
    key: "consent",
    header: "Consentement",
    render: (form) => (
      <>
        <a href={`/consent-texts/${encodeURIComponent(form.consentTextId)}`}><span className="bo-ref">{form.consentTextId.slice(0, 8)}</span></a>
        {/* Spec 050 FR-019: a more recent published version of the linked consent text exists. */}
        {form.consentSuperseded ? <Badge tone="warning">Consentement remplacé</Badge> : null}
      </>
    )
  },
  {
    key: "publishedAt",
    header: "Publié le",
    render: (form) => form.publishedAt?.slice(0, 10) ?? "-",
    sortable: true,
    sortValue: (form) => form.publishedAt ?? null
  },
  { key: "id", header: "Identifiant", render: (form) => <span className="bo-ref">{form.id}</span> }
  ];
}

export default async function AdminQuoteFormDefinitionsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const statusFilter = firstParam(params.status);
  const languageFilter = firstParam(params.language);
  const [forms, countries, products] = await Promise.all([
    readQuoteFormDefinitions(languageFilter ? { language: languageFilter } : {}),
    readAdminCountries(),
    readAdminProducts()
  ]);
  const countryById = new Map(countries.data.map((country) => [country.id, country.isoCode]));
  const productById = new Map(products.data.map((product) => [product.id, product.name]));
  const countryLabel = (id: string) => countryById.get(id) ?? id.slice(0, 8);
  const productLabel = (id: string) => productById.get(id) ?? id.slice(0, 8);
  const columns = buildColumns(countryLabel, productLabel);
  const items = forms.data;
  /** Readable name of a version for the selects and dialogs: scope, language, version and status. */
  const formChoice = (form: QuoteFormDefinitionData) => ({
    id: form.id,
    label: `${countryLabel(form.countryId)} · ${productLabel(form.productId)} · ${form.language} · v${form.version} (${form.status})`
  });
  const published = items.filter((form) => form.status === "published");
  const drafts = items.filter((form) => form.status === "draft");
  const exposedScopes = new Set(published.map(scopeKey));
  const superseded = items.filter((form) => form.consentSuperseded === true && form.status !== "retired");

  const table = readTableParams(params, {
    pathname: "/quote-form-definitions",
    defaultSort: { key: "publishedAt", direction: "desc" },
    pageSize: 25
  });
  const visible = statusFilter ? items.filter((form) => form.status === statusFilter) : items;
  const rows = paginateItems(sortItems(visible, columns, table.sort), table.page, table.pageSize);
  const activeItems: ActiveFilterItem[] = [
    ...(statusFilter ? [{ label: "Statut", value: STATUS_FILTER_LABELS[statusFilter] ?? statusFilter, removeHref: hrefWithout("/quote-form-definitions", params, "status") }] : []),
    ...(languageFilter ? [{ label: "Langue", value: languageFilter, removeHref: hrefWithout("/quote-form-definitions", params, "language") }] : [])
  ];

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Catalogue" }, { label: "Formulaires devis" }]}
        title="Formulaires de demande de devis"
        description="Définitions versionnées par pays, produit et langue. Un formulaire n'est exposé aux visiteurs qu'une fois publié et lié à un texte de consentement publié."
        actions={forms.status === "success" ? <Button href="#creer-formulaire">Créer un brouillon</Button> : null}
      />

      {forms.unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {forms.forbidden ? <StateMessage tone="danger">Accès aux formulaires de devis refusé pour ce rôle admin.</StateMessage> : null}
      {forms.status === "error" ? <StateMessage tone="danger">Formulaires indisponibles. {readFailureDetail(forms.error)}</StateMessage> : null}

      {forms.status === "success" ? (
        <>
          {published.length === 0 ? (
            <StateMessage tone="warning">
              Aucune version publiée: la demande de devis est indisponible pour tous les pays et produits. La checklist d'activation le signale comme bloquant.{" "}
              {drafts.length > 0
                ? <>Prochaine étape : publier un brouillon (formulaire « Publier une version » ci-dessous).</>
                : <>Prochaine étape : <a href="#creer-formulaire">créer un brouillon</a>, puis le publier.</>}
            </StateMessage>
          ) : null}

          <StatStrip
            label="Synthèse formulaires"
            items={[
              { label: "Versions publiées", value: published.length, tone: published.length > 0 ? "success" : "warning" },
              { label: "Brouillons", value: drafts.length },
              { label: "Parcours exposés", value: exposedScopes.size, tone: exposedScopes.size > 0 ? "success" : "warning" },
              { label: "Consentement remplacé", value: superseded.length, tone: superseded.length > 0 ? "warning" : "neutral" }
            ]}
          />

          {superseded.length > 0 ? (
            <StateMessage tone="warning">
              {`${superseded.length} formulaire(s) lient un texte de consentement dont une version plus récente est publiée. Créez puis publiez une nouvelle version du formulaire liée au texte à jour.`}
            </StateMessage>
          ) : null}

          <FilterBar
            action="/quote-form-definitions"
            label="Filtres formulaires de devis"
            submitLabel="Filtrer"
            resetLabel="Réinitialiser"
            resetHref="/quote-form-definitions"
            activeCount={(statusFilter ? 1 : 0) + (languageFilter ? 1 : 0)}
            autoSubmit
          >
            <Field id="quote-form-status" label="Statut">
              <Select {...fieldControlProps("quote-form-status")} name="status" defaultValue={statusFilter}>
                <option value="">Tous</option>
                {statusOptions.map((option) => <option key={option} value={option}>{STATUS_FILTER_LABELS[option] ?? option}</option>)}
              </Select>
            </Field>
            <Field id="quote-form-language" label="Langue">
              <Select {...fieldControlProps("quote-form-language")} name="language" defaultValue={languageFilter}>
                <option value="">Toutes</option>
                {languageOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </Select>
            </Field>
          </FilterBar>
          <ActiveFilters items={activeItems} />
          <DataTable
            columns={columns}
            items={rows}
            getKey={(form) => form.id}
            emptyLabel={items.length > 0 ? "Aucune version pour ces filtres." : "Aucune définition: le parcours de demande de devis reste indisponible côté public."}
            emptyDescription={items.length > 0 ? "Retirez un filtre ou réinitialisez-les tous pour voir les autres versions." : "Créez un brouillon ci-dessous, liez-le à un consentement publié, puis publiez-le."}
            emptyAction={
              items.length > 0
                ? <Button href="/quote-form-definitions" variant="secondary" size="sm">Réinitialiser les filtres</Button>
                : <Button href="#creer-formulaire" variant="secondary" size="sm">Créer un brouillon</Button>
            }
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

          <Notice tone="neutral" title="Règles de publication">
            <ul className="bo-list">
              <li>Le texte de consentement doit être publié, de finalité transmission de lead, et de même langue, pays et produit (ou sans produit).</li>
              <li>Les libellés de champ sont exposés aux visiteurs: le vocabulaire réglementé y est refusé.</li>
              <li>Un champ sensible n'est publiable que si le flag produit correspondant est ouvert.</li>
              <li>Une seule version publiée par pays, produit et langue: publier retire la précédente.</li>
            </ul>
          </Notice>

          <Grid columns="two">
            <div id="creer-formulaire"><CreateQuoteFormDefinitionForm /></div>
            <Stack>
              <PublishQuoteFormDefinitionForm forms={items.filter((form) => form.status !== "published").map(formChoice)} />
              <RetireQuoteFormDefinitionForm forms={published.map(formChoice)} />
            </Stack>
          </Grid>
        </>
      ) : null}
    </PageStack>
  );
}
