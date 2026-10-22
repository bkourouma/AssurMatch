import { firstValue, formatDateTime, pageHref, pageNumber, readProspects, type ProspectRow } from "../lib/operations-api";
import { Badge, Card, DataTable, Field, Input, PageHeader, PageStack, Select, StateMessage, fieldControlProps, type DataTableColumn } from "../lib/ui/admin-ui";
import { OperationsTabs } from "../lib/ui/operations-tabs";
import { readBackOfficeSession } from "../lib/backoffice-auth";
import { searchProspectsAction } from "./search-action";
import { ProspectContactSearch } from "./contact-search";
import { looksLikeProspectContact } from "../../../../packages/shared/security/prospect-contact-search";

/**
 * Spec 073 (FR-001 a FR-005): prospects console. A row never carries a clear e-mail or phone: the
 * API masks them for every role. Clear values exist on the detail page only, for the super admin
 * and the support admin, and each reading is audited.
 *
 * The name search is offered to the roles that may read names in clear only (same set as the API's
 * PROSPECT_PII_ROLES): the API answers 403 to the others (existence oracle on masked rows). The
 * exact e-mail / phone search is a separate POST form (`ProspectContactSearch`) whose result is
 * rendered from the action state: no contact value nor hash of it ever lands in this page's URL.
 */

const NAME_SEARCH_ROLES = new Set(["super_admin", "support_admin"]);

const columns: Array<DataTableColumn<ProspectRow>> = [
  { key: "name", header: "Nom", render: (row) => row.displayName ?? "-" },
  { key: "email", header: "E-mail (masque)", render: (row) => row.email ?? "-" },
  { key: "phone", header: "Telephone (masque)", render: (row) => row.phone ?? "-" },
  { key: "scope", header: "Pays / produit", render: (row) => `${row.countryCode ?? "-"} / ${row.productKey ?? "-"}` },
  { key: "consents", header: "Consentements", render: (row) => row.consentCount, numeric: true, align: "right" },
  { key: "quotes", header: "Demandes de devis", render: (row) => row.quoteRequestCount, numeric: true, align: "right" },
  { key: "state", header: "Etat", render: (row) => (row.anonymized ? <Badge tone="neutral">Anonymise</Badge> : <Badge tone="success">Actif</Badge>) },
  { key: "created", header: "Cree le", render: (row) => formatDateTime(row.createdAt) }
];

export default async function AdminProspectsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = searchParams ? await searchParams : {};
  const session = await readBackOfficeSession();
  const canSearchByName = session.status === "authenticated" && session.profile.roles.some((role) => NAME_SEARCH_ROLES.has(role));
  // A contact typed in clear in an old link is dropped, and so is a name search for a role refused by the API.
  const rawSearch = firstValue(params.search);
  const filters = {
    country: firstValue(params.country)?.toUpperCase(),
    product: firstValue(params.product),
    search: canSearchByName && rawSearch && !looksLikeProspectContact(rawSearch) ? rawSearch : undefined,
    includeAnonymized: firstValue(params.includeAnonymized) === "true" ? "true" : undefined
  };
  const contactNotice = firstValue(params.notice) === "contact";
  const page = pageNumber(params.page);
  const result = await readProspects({ ...filters, page, pageSize: 50 });
  const activeFilters = Object.values(filters).filter(Boolean).length;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Pilotage" }, { label: "Operations", href: "/operations" }, { label: "Prospects" }]}
        kicker="Operations"
        title="Prospects"
        description="Recherche paginee des prospects dans votre perimetre pays et produit. Les coordonnees sont masquees dans la liste; la fiche les affiche en clair uniquement pour les roles autorises, avec journal d'audit."
      />
      <OperationsTabs current="/prospects" />

      {result.status === "unauthenticated" ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {result.status === "forbidden" ? <StateMessage tone="danger">Acces aux prospects refuse pour ce role admin.</StateMessage> : null}
      {result.status === "error" ? <StateMessage tone="danger">Prospects indisponibles : {result.error}</StateMessage> : null}

      <Card>
        {/* POST (server action) then redirect: only a name fragment and the scope filters reach the URL. */}
        <form className="bo-filters" action={searchProspectsAction} role="search" aria-label="Filtres prospects">
          {canSearchByName ? (
            <Field id="prospect-search" label="Recherche par nom">
              <Input {...fieldControlProps("prospect-search")} name="search" defaultValue={filters.search ?? ""} autoComplete="off" />
            </Field>
          ) : null}
          <Field id="prospect-country" label="Pays (code ISO)">
            <Input {...fieldControlProps("prospect-country")} name="country" defaultValue={filters.country ?? ""} maxLength={3} placeholder="CI" />
          </Field>
          <Field id="prospect-product" label="Produit (cle)">
            <Input {...fieldControlProps("prospect-product")} name="product" defaultValue={filters.product ?? ""} placeholder="auto" />
          </Field>
          <Field id="prospect-anonymized" label="Prospects anonymises">
            <Select {...fieldControlProps("prospect-anonymized")} name="includeAnonymized" defaultValue={filters.includeAnonymized ?? ""}>
              <option value="">Exclure</option>
              <option value="true">Inclure</option>
            </Select>
          </Field>
          <div className="bo-filters__actions">
            <button className="bo-button" data-variant="secondary" data-size="sm" type="submit">Filtrer</button>
            <a className="bo-button" data-variant="tertiary" data-size="sm" href="/prospects">Reinitialiser</a>
            {activeFilters > 0 ? <span className="bo-filters__count">{activeFilters}</span> : null}
          </div>
        </form>
      </Card>

      {contactNotice ? (
        <StateMessage tone="warning">Un e-mail ou un telephone saisi dans le champ nom n'est pas recherche (il apparaitrait dans l'adresse de la page) : utilisez la recherche par e-mail ou telephone.</StateMessage>
      ) : null}

      <ProspectContactSearch />

      <Card as="section" aria-label="Liste des prospects">
        <DataTable
          columns={columns}
          items={result.data.items}
          getKey={(row) => row.id}
          getRowHref={(row) => `/prospects/${row.id}`}
          emptyLabel="Aucun prospect pour ces filtres."
          aria-label="Prospects"
          pagination={{
            page,
            pageSize: result.data.pageSize,
            total: result.data.total,
            hrefFor: (target) => pageHref("/prospects", filters, target),
            label: (from, to, total) => `${from}-${to} sur ${total} prospects`
          }}
        />
      </Card>
    </PageStack>
  );
}
