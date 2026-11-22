import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AttentionList } from "../backoffice/attention-list";
import { DataTable, paginateItems, readTableParams, sortItems } from "../backoffice/data-table";
import type { DataTableColumn, DataTableProps } from "../backoffice/data-table";
import { EmptyState } from "../backoffice/empty-state";
import { FilterBar } from "../backoffice/filter-bar";
import { KpiCard } from "../backoffice/kpi-card";
import { PageHeader } from "../backoffice/page-header";
import { Skeleton } from "../backoffice/skeleton";
import { Tabs } from "../backoffice/tabs";

interface Row {
  id: string;
  name: string;
  count: number;
}

const columns: Array<DataTableColumn<Row>> = [
  { key: "name", header: "Nom", render: (row) => row.name, sortable: true, sortValue: (row) => row.name },
  { key: "count", header: "Total", render: (row) => String(row.count), sortable: true, sortValue: (row) => row.count, numeric: true }
];

const rows: Row[] = [
  { id: "a", name: "Alpha", count: 3 },
  { id: "b", name: "Bravo", count: 1 }
];

function table(overrides: Partial<DataTableProps<Row>> = {}): string {
  const props: DataTableProps<Row> = {
    columns,
    items: rows,
    getKey: (row) => row.id,
    emptyLabel: "Aucun résultat",
    caption: "Dossiers",
    ...overrides
  };
  return renderToStaticMarkup(createElement(DataTable<Row>, props));
}

describe("DataTable", () => {
  it("keeps aria-sort on sortable headers", () => {
    const html = table({ sort: { key: "name", direction: "asc" }, sortHref: (key, direction) => `/x?sort=${key}&dir=${direction}` });
    expect(html).toContain('aria-sort="ascending"');
    expect(html).toContain('aria-sort="none"');
    expect(html).toContain('href="/x?sort=name&amp;dir=desc"');
  });

  it("adds a hidden sort label only when asked", () => {
    const sortHref = () => "/x";
    expect(table({ sortHref })).not.toContain("bo-visually-hidden");
    const html = table({ sortHref, sort: { key: "name", direction: "asc" }, sortLabel: (_header, direction) => `tri ${direction}` });
    expect(html).toContain('<span class="bo-visually-hidden">tri asc</span>');
    expect(html).toContain('<span class="bo-visually-hidden">tri none</span>');
  });

  it("makes the scroll frame a named, focusable region", () => {
    const html = table();
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Dossiers"');
    expect(html).toContain('tabindex="0"');
    const labelled = table({ caption: undefined, "aria-label": "Liste" });
    expect(labelled).toContain('role="region"');
    expect(table({ caption: undefined })).not.toContain('role="region"');
  });

  it("bounds the frame when maxHeight is given", () => {
    const html = table({ maxHeight: "20rem" });
    expect(html).toContain('data-scroll-y="true"');
    expect(html).toContain("max-height:20rem");
    expect(table()).not.toContain("data-scroll-y");
  });

  it("stretches the first-cell link over the row", () => {
    const html = table({ getRowHref: (row) => `/dossiers/${row.id}` });
    expect(html).toContain('data-linked="true"');
    expect(html).toContain('<a class="bo-table__rowlink" href="/dossiers/a">Alpha</a>');
    expect(table()).not.toContain("bo-table__rowlink");
  });

  it("renders a row header only when asked", () => {
    expect(table()).not.toContain('scope="row"');
    expect(table({ rowHeader: true })).toContain('<th scope="row">Alpha</th>');
  });

  it("renders skeleton rows and aria-busy while loading", () => {
    const html = table({ loading: true, loadingRows: 2, loadingLabel: "Chargement" });
    expect(html).toContain('aria-busy="true"');
    expect(html.match(/bo-table__skeleton-row/g)).toHaveLength(2);
    expect(html).toContain('role="status">Chargement');
    expect(html).not.toContain("Alpha");
    expect(html).not.toContain("Aucun résultat");
    expect(table()).not.toContain("aria-busy");
  });

  it("defaults to five skeleton rows", () => {
    expect(table({ loading: true }).match(/bo-table__skeleton-row/g)).toHaveLength(5);
  });

  it("shows the empty state, announced by default and silent on request", () => {
    const html = table({ items: [], emptyDescription: "Essayez un autre filtre" });
    expect(html).toContain("Aucun résultat");
    expect(html).toContain('role="status"');
    expect(table({ items: [], announceEmpty: false })).not.toContain('role="status"');
  });

  it("paginates with a nav, aria-current and non-focusable disabled links", () => {
    const pagination = { page: 1, pageSize: 2, total: 5, hrefFor: (page: number) => `/p?page=${page}`, paginationLabel: "Pagination" };
    const html = table({ pagination });
    expect(html).toContain('<nav aria-label="Pagination">');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("1-2 / 5");
    // The first page has no previous link target; the next one does.
    const previous = html.match(/<a[^>]*aria-label="Page précédente"[^>]*>/u)?.[0] ?? "";
    expect(previous).not.toContain("href=");
    expect(previous).toContain('aria-disabled="true"');
    expect(previous).toContain('tabindex="-1"');
    expect(html).toContain('href="/p?page=2"');
    expect(table({ pagination: { ...pagination, paginationLabel: undefined } })).not.toContain("<nav");
  });
});

describe("table helpers", () => {
  it("sorts a copy and ignores unknown keys", () => {
    expect(sortItems(rows, columns, { key: "count", direction: "asc" }).map((row) => row.id)).toEqual(["b", "a"]);
    expect(sortItems(rows, columns, { key: "count", direction: "desc" }).map((row) => row.id)).toEqual(["a", "b"]);
    expect(sortItems(rows, columns, { key: "nope", direction: "asc" })).toBe(rows);
    expect(rows.map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("paginates", () => {
    expect(paginateItems([1, 2, 3, 4, 5], 2, 2)).toEqual([3, 4]);
    expect(paginateItems([1, 2, 3], 0, 0)).toEqual([1]);
  });

  it("reads table params and keeps other filters in the links", () => {
    const params = readTableParams({ sort: "name", dir: "desc", page: "3", q: "x" }, { pathname: "/users", pageSize: 10 });
    expect(params.sort).toEqual({ key: "name", direction: "desc" });
    expect(params.page).toBe(3);
    expect(params.pageSize).toBe(10);
    expect(params.pageHref(1)).toBe("/users?sort=name&dir=desc&q=x");
    expect(params.sortHref("count", "asc")).toBe("/users?sort=count&dir=asc&q=x");
    expect(readTableParams({}, { pathname: "/users", defaultSort: { key: "name", direction: "asc" } }).sort).toEqual({ key: "name", direction: "asc" });
  });
});

describe("Tabs", () => {
  it("keeps the tab roles and aria-current", () => {
    const html = renderToStaticMarkup(
      createElement(Tabs, {
        label: "Sections",
        items: [
          { label: "Un", href: "/a", current: true, badge: "2" },
          { label: "Deux", href: "/b" }
        ]
      })
    );
    expect(html).toContain('<nav aria-label="Sections">');
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-selected="false"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });
});

describe("EmptyState", () => {
  it("stays a status with a paragraph title", () => {
    const html = renderToStaticMarkup(createElement(EmptyState, { title: "Rien", description: "Détail" }));
    expect(html).toContain('role="status"');
    expect(html).toContain('<p class="bo-empty__title">Rien</p>');
    expect(html).not.toContain("data-tone");
  });

  it("supports tone, compact and a silent mode", () => {
    const html = renderToStaticMarkup(createElement(EmptyState, { title: "Erreur", tone: "danger", compact: true, announce: false }));
    expect(html).toContain('data-tone="danger"');
    expect(html).toContain('data-compact="true"');
    expect(html).not.toContain("role=");
  });
});

describe("Skeleton", () => {
  it("stays hidden from assistive technology by default", () => {
    const html = renderToStaticMarkup(createElement(Skeleton, { lines: 2 }));
    expect(html).toContain('aria-hidden="true"');
    expect(html.match(/bo-skeleton__line/g)).toHaveLength(2);
    expect(html).not.toContain("role=");
  });

  it("adds a status label and variants", () => {
    const html = renderToStaticMarkup(createElement(Skeleton, { lines: 2, label: "Chargement", variant: "table" }));
    expect(html).toContain('data-variant="table"');
    expect(html).toContain('<span class="bo-visually-hidden" role="status">Chargement</span>');
    expect(html.match(/bo-skeleton__row/g)).toHaveLength(2);
  });
});

describe("AttentionList", () => {
  const items = [
    { label: "Demandes", count: 3, href: "/d", actionLabel: "Ouvrir", tone: "warning" as const },
    { label: "Litiges", count: 0, href: "/l", actionLabel: "Ouvrir", quiet: true }
  ];

  it("keeps the French defaults", () => {
    const html = renderToStaticMarkup(createElement(AttentionList, { items }));
    expect(html).toContain("Rien à signaler : ");
    expect(html).not.toContain("aria-label");
  });

  it("supports a list label, localized lines and a count label", () => {
    const html = renderToStaticMarkup(
      createElement(AttentionList, {
        items,
        label: "A traiter",
        quietLabel: "Nothing to report: ",
        countLabel: (item) => `${String(item.count)} en attente`
      })
    );
    expect(html).toContain('aria-label="A traiter"');
    expect(html).toContain("Nothing to report: ");
    expect(html).toContain('aria-label="3 en attente"');
    const allQuiet = renderToStaticMarkup(createElement(AttentionList, { items: [items[1] as (typeof items)[number]], emptyLabel: "Nothing to do: " }));
    expect(allQuiet).toContain("Nothing to do: ");
  });
});

describe("KpiCard", () => {
  it("is named by its label and value, with an explicit trend direction", () => {
    const html = renderToStaticMarkup(createElement(KpiCard, { label: "Leads", value: "12", trend: { direction: "up", label: "+2" } }));
    expect(html).toMatch(/aria-labelledby="[^"]+"/u);
    expect(html).not.toContain('aria-label="Leads"');
    expect(html).toContain("(en hausse)");
    const custom = renderToStaticMarkup(createElement(KpiCard, { label: "Leads", value: "12", trend: { direction: "down", label: "-2", directionLabel: "falling" } }));
    expect(custom).toContain("(falling)");
  });
});

describe("PageHeader", () => {
  it("marks the last breadcrumb item as the current page", () => {
    const html = renderToStaticMarkup(
      createElement(PageHeader, { title: "Détail", breadcrumb: [{ label: "Accueil", href: "/" }, { label: "Détail" }] })
    );
    expect(html).toContain('<span aria-current="page">Détail</span>');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html.match(/<h1/g)).toHaveLength(1);
  });
});

describe("FilterBar", () => {
  it("renders a count status with an optional hidden label", () => {
    const html = renderToStaticMarkup(
      createElement(FilterBar, { action: "/x", label: "Filtres", submitLabel: "Filtrer", activeCount: 2, activeCountLabel: "filtres actifs", children: null })
    );
    expect(html).toContain('role="search"');
    expect(html).toContain('role="status"');
    expect(html).toContain("filtres actifs");
    expect(html).not.toContain("disabled");
  });
});
