import { firstValue, formatDateTime, pageHref, pageNumber, readProspects, type ProspectRow } from "../lib/operations-api";
import { Badge, Card, DataTable, Field, Input, PageHeader, PageStack, Select, StateMessage, fieldControlProps, type DataTableColumn } from "../lib/ui/admin-ui";
import { OperationsTabs } from "../lib/ui/operations-tabs";
import { searchProspectsAction } from "./search-action";
import { looksLikeProspectContact } from "../../../../packages/shared/security/prospect-contact-fingerprint";

/**
 * Spec 073 (FR-001 a FR-005): prospects console. A row never carries a clear e-mail or phone: the
 * API masks them for every role. Clear values exist on the detail page only, for the super admin
 * and the support admin, and each reading is audited.
 */

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
  // A contact typed in clear in the URL (old link) is dropped: only the hash (`contact`) is forwarded.
  const rawSearch = firstValue(params.search);
  const contactParam = firstValue(params.contact);
  const filters = {
    country: firstValue(params.country)?.toUpperCase(),
    product: firstValue(params.product),
    search: rawSearch && !looksLikeProspectContact(rawSearch) ? rawSearch : undefined,
    contact: contactParam && /^[0-9a-fA-F]{64}$/.test(contactParam) ? contactParam.toLowerCase() : undefined,
    includeAnonymized: firstValue(params.includeAnonymized) === "true" ? "true" : undefined
  };
  const page = pageNumber(params.page);
  const { contact, ...listFilters } = filters;
  const result = await readProspects({ ...listFilters, ...(contact ? { contactHash: contact } : {}), page, pageSize: 50 });
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
        {/* POST (server action): an e-mail / phone is hashed server side and never lands in the URL. */}
        <form className="bo-filters" action={searchProspectsAction} role="search" aria-label="Filtres prospects">
          <Field id="prospect-search" label="Recherche (nom, ou e-mail / telephone exact)">
            <Input
              {...fieldControlProps("prospect-search")}
              name="search"
              defaultValue={filters.search ?? ""}
              placeholder={filters.contact ? "Recherche par e-mail / telephone active (valeur non conservee)" : undefined}
              autoComplete="off"
            />
          </Field>
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
