import type { ContentEntryView } from "../../../../packages/shared/contracts/content-cms.contracts";
import { readContentCapabilities, readContentEntries } from "../lib/admin-api";
import {
  CONTENT_KIND_LABELS,
  CONTENT_LOCALE_LABELS,
  CONTENT_STATUS_LABELS,
  CONTENT_STATUS_TONES,
  contentDate,
  contentKindLabel,
  contentLocaleLabel,
  contentReadErrorMessage
} from "../lib/content-messages";
import {
  Button,
  Card,
  DataTable,
  Field,
  FilterBar,
  Input,
  PageHeader,
  PageStack,
  Select,
  StateMessage,
  StatusBadge,
  fieldControlProps,
  paginateItems,
  readTableParams,
  sortItems
} from "../lib/ui/admin-ui";
import type { DataTableColumn } from "../lib/ui/admin-ui";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

const columns: Array<DataTableColumn<ContentEntryView>> = [
  {
    key: "label",
    header: "Contenu",
    render: (entry) => <a href={`/content/${encodeURIComponent(entry.id)}`}>{entry.label}</a>,
    sortable: true,
    sortValue: (entry) => entry.label
  },
  { key: "kind", header: "Type", render: (entry) => contentKindLabel(entry.kind), sortable: true, sortValue: (entry) => entry.kind },
  { key: "locale", header: "Langue", render: (entry) => contentLocaleLabel(entry.locale), sortable: true, sortValue: (entry) => entry.locale },
  { key: "country", header: "Pays", render: (entry) => entry.countryCode ?? "-", sortable: true, sortValue: (entry) => entry.countryCode ?? "" },
  { key: "version", header: "Version", render: (entry) => entry.version, numeric: true, align: "right", sortable: true, sortValue: (entry) => entry.version },
  {
    key: "status",
    header: "Statut",
    render: (entry) => <StatusBadge status={entry.status} tones={CONTENT_STATUS_TONES} labels={CONTENT_STATUS_LABELS} />,
    sortable: true,
    sortValue: (entry) => entry.status
  },
  { key: "updatedAt", header: "Modifié le", render: (entry) => contentDate(entry.updatedAt), sortable: true, sortValue: (entry) => entry.updatedAt }
];

export default async function AdminContentPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const kind = firstParam(params.kind);
  const locale = firstParam(params.locale);
  const status = firstParam(params.status);
  const countryCode = firstParam(params.countryCode).toUpperCase();

  const [capabilities, entries] = await Promise.all([
    readContentCapabilities(),
    readContentEntries({
      kind: (kind || undefined) as ContentEntryView["kind"] | undefined,
      locale: (locale || undefined) as ContentEntryView["locale"] | undefined,
      status: (status || undefined) as ContentEntryView["status"] | undefined,
      countryCode: countryCode || undefined
    })
  ]);
  const canEdit = capabilities.status === "success" && capabilities.data.canEdit;

  const table = readTableParams(params, {
    pathname: "/content",
    defaultSort: { key: "updatedAt", direction: "desc" },
    pageSize: 25
  });
  const rows = paginateItems(sortItems(entries.data, columns, table.sort), table.page, table.pageSize);

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Plateforme" }, { label: "Contenu" }]}
        kicker="Contenu éditorial"
        title="Contenu"
        description="FAQ, guides, glossaire et surcharges légales par pays. Chaque contenu passe par un brouillon, une soumission et l'approbation d'un second acteur avant d'être affiché sur le site public."
        actions={canEdit ? <Button href="/content/new">Nouveau contenu</Button> : undefined}
      />

      {entries.unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {entries.forbidden ? <StateMessage tone="danger">{contentReadErrorMessage("access_denied")}</StateMessage> : null}
      {entries.status === "error" ? <StateMessage tone="danger">{contentReadErrorMessage(entries.error)}</StateMessage> : null}

      {entries.status === "success" ? (
        <Card title="Versions de contenu">
          <FilterBar
            action="/content"
            label="Filtres contenu"
            submitLabel="Filtrer"
            resetLabel="Réinitialiser"
            resetHref="/content"
            activeCount={[kind, locale, status, countryCode].filter(Boolean).length}
            autoSubmit
          >
            <Field id="content-kind" label="Type">
              <Select {...fieldControlProps("content-kind")} name="kind" defaultValue={kind}>
                <option value="">Tous</option>
                {Object.entries(CONTENT_KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </Field>
            <Field id="content-locale" label="Langue">
              <Select {...fieldControlProps("content-locale")} name="locale" defaultValue={locale}>
                <option value="">Toutes</option>
                {Object.entries(CONTENT_LOCALE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </Field>
            <Field id="content-status" label="Statut">
              <Select {...fieldControlProps("content-status")} name="status" defaultValue={status}>
                <option value="">Tous</option>
                {Object.entries(CONTENT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </Field>
            <Field id="content-country" label="Pays (code ISO)">
              <Input {...fieldControlProps("content-country")} name="countryCode" defaultValue={countryCode} maxLength={2} placeholder="SN" />
            </Field>
          </FilterBar>
          <DataTable
            columns={columns}
            items={rows}
            getKey={(entry) => entry.id}
            emptyLabel="Aucun contenu : le site public affiche son contenu d'origine."
            aria-label="Versions de contenu"
            sort={table.sort}
            sortHref={table.sortHref}
            pagination={{
              page: table.page,
              pageSize: table.pageSize,
              total: entries.data.length,
              hrefFor: table.pageHref,
              label: (from, to, total) => `${from}-${to} sur ${total} versions`
            }}
          />
        </Card>
      ) : null}
    </PageStack>
  );
}
