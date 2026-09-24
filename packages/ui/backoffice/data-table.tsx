import type { ReactNode } from "react";
import { EmptyState } from "./empty-state";
import { Icon } from "./icons";

export type SortDirection = "asc" | "desc";
export type ColumnAlign = "left" | "right" | "center";

export interface TableSort {
  key: string;
  direction: SortDirection;
}

export interface DataTableColumn<T> {
  /** Stable identifier, also used as the `?sort=` value when the column is sortable. */
  key: string;
  header: ReactNode;
  render: (item: T) => ReactNode;
  align?: ColumnAlign | undefined;
  numeric?: boolean | undefined;
  width?: string | number | undefined;
  sortable?: boolean | undefined;
  /** Value the sort compares; without it a sortable column falls back to no ordering. */
  sortValue?: ((item: T) => string | number | null) | undefined;
}

export interface TablePagination {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
  /** Surface wording for "x to y of z"; the package ships no French default sentence. */
  label?: ((from: number, to: number, total: number) => string) | undefined;
}

export interface DataTableProps<T> {
  columns: Array<DataTableColumn<T>>;
  items: T[];
  getKey: (item: T) => string;
  emptyLabel: string;
  emptyDescription?: string | undefined;
  emptyAction?: ReactNode;
  caption?: string | undefined;
  dense?: boolean | undefined;
  stickyFirstColumn?: boolean | undefined;
  /** Current sort, normally read from the URL with `readTableParams`. */
  sort?: TableSort | undefined;
  /** Destination of a sortable header; without it headers stay plain text. */
  sortHref?: ((key: string, direction: SortDirection) => string) | undefined;
  pagination?: TablePagination | undefined;
  rowActions?: ((item: T) => ReactNode) | undefined;
  /** Turns the first cell of every row into a link to the record. */
  getRowHref?: ((item: T) => string) | undefined;
  /** Accessible name of the table when no visible caption is given. */
  "aria-label"?: string | undefined;
  className?: string | undefined;
}

function ariaSortOf(column: DataTableColumn<unknown>, sort: TableSort | undefined): "ascending" | "descending" | "none" | undefined {
  if (!column.sortable) return undefined;
  if (!sort || sort.key !== column.key) return "none";
  return sort.direction === "asc" ? "ascending" : "descending";
}

export function DataTable<T>(props: DataTableProps<T>) {
  const {
    columns,
    items,
    getKey,
    emptyLabel,
    emptyDescription,
    emptyAction,
    caption,
    dense,
    stickyFirstColumn,
    sort,
    sortHref,
    pagination,
    rowActions,
    getRowHref,
    className
  } = props;

  const tableClasses = ["bo-table", dense ? "bo-table--dense" : null, stickyFirstColumn ? "bo-table--sticky-first" : null, className]
    .filter(Boolean)
    .join(" ");
  const columnCount = columns.length + (rowActions ? 1 : 0);

  return (
    <div className="bo-table-wrap">
      <table className={tableClasses} aria-label={caption ? undefined : props["aria-label"]}>
        {caption ? <caption>{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => {
              const ariaSort = ariaSortOf(column as DataTableColumn<unknown>, sort);
              const active = sort && sort.key === column.key;
              const nextDirection: SortDirection = active && sort.direction === "asc" ? "desc" : "asc";
              return (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width === undefined ? undefined : { width: column.width }}
                  data-align={column.align}
                  data-numeric={column.numeric ? "true" : undefined}
                  aria-sort={ariaSort}
                >
                  {column.sortable && sortHref ? (
                    <a className="bo-table__sort" href={sortHref(column.key, nextDirection)}>
                      {column.header}
                      <Icon name={active ? (sort.direction === "asc" ? "sortAsc" : "sortDesc") : "sort"} size={14} />
                    </a>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
            {rowActions ? <th scope="col" data-align="right" /> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const rowHref = getRowHref?.(item);
            return (
              <tr key={getKey(item)}>
                {columns.map((column, index) => {
                  const content = column.render(item);
                  return (
                    <td key={column.key} data-align={column.align} data-numeric={column.numeric ? "true" : undefined}>
                      {index === 0 && rowHref ? <a href={rowHref}>{content}</a> : content}
                    </td>
                  );
                })}
                {rowActions ? (
                  <td data-align="right">
                    <div className="bo-table__actions">{rowActions(item)}</div>
                  </td>
                ) : null}
              </tr>
            );
          })}
          {items.length === 0 ? (
            <tr>
              <td className="bo-table__empty" colSpan={columnCount}>
                <EmptyState title={emptyLabel} description={emptyDescription} action={emptyAction} />
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {pagination ? <TableFooter pagination={pagination} /> : null}
    </div>
  );
}

function TableFooter({ pagination }: { pagination: TablePagination }) {
  const { page, pageSize, total, hrefFor, label } = pagination;
  const lastPage = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="bo-table__footer">
      <span>{label ? label(from, to, total) : `${from}-${to} / ${total}`}</span>
      <div className="bo-pagination">
        <a
          className="bo-button"
          data-variant="secondary"
          data-size="sm"
          href={hrefFor(Math.max(1, page - 1))}
          aria-disabled={page <= 1 ? true : undefined}
        >
          <Icon name="chevronLeft" size={16} />
        </a>
        <span>{`${page} / ${lastPage}`}</span>
        <a
          className="bo-button"
          data-variant="secondary"
          data-size="sm"
          href={hrefFor(Math.min(lastPage, page + 1))}
          aria-disabled={page >= lastPage ? true : undefined}
        >
          <Icon name="chevronRight" size={16} />
        </a>
      </div>
    </div>
  );
}

/* ---------- Server-side helpers ----------
 * Sorting and pagination are computed on the server from the URL, so a table keeps working without
 * JavaScript and a sorted view stays shareable as a link.
 */

function compare(a: string | number | null, b: string | number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/** Returns a sorted copy of `items`; unknown or non-sortable keys leave the order untouched. */
export function sortItems<T>(items: T[], columns: Array<DataTableColumn<T>>, sort: TableSort | undefined): T[] {
  if (!sort) return items;
  const column = columns.find((candidate) => candidate.key === sort.key);
  const sortValue = column?.sortValue;
  if (!column?.sortable || !sortValue) return items;
  const factor = sort.direction === "desc" ? -1 : 1;
  return [...items].sort((left, right) => factor * compare(sortValue(left), sortValue(right)));
}

export function paginateItems<T>(items: T[], page: number, pageSize: number): T[] {
  const size = Math.max(1, pageSize);
  const start = Math.max(0, (Math.max(1, page) - 1) * size);
  return items.slice(start, start + size);
}

export type TableSearchParams = Record<string, string | string[] | undefined> | URLSearchParams;

export interface ReadTableParamsOptions {
  /** Base path the generated links point at, e.g. "/users". */
  pathname: string;
  defaultSort?: TableSort | undefined;
  pageSize?: number | undefined;
  sortParam?: string | undefined;
  directionParam?: string | undefined;
  pageParam?: string | undefined;
}

export interface TableParams {
  sort: TableSort | undefined;
  page: number;
  pageSize: number;
  /** Link for a sortable header. */
  sortHref: (key: string, direction: SortDirection) => string;
  /** Link for a pagination button. */
  pageHref: (page: number) => string;
}

function toSearchParams(searchParams: TableSearchParams): URLSearchParams {
  if (searchParams instanceof URLSearchParams) return new URLSearchParams(searchParams);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) params.append(key, entry);
    } else {
      params.set(key, value);
    }
  }
  return params;
}

/**
 * Reads the sort and the page out of the current query string and builds the links the table needs.
 * Every other filter already present in the URL is preserved by those links.
 */
export function readTableParams(searchParams: TableSearchParams, options: ReadTableParamsOptions): TableParams {
  const { pathname, defaultSort, pageSize = 25, sortParam = "sort", directionParam = "dir", pageParam = "page" } = options;
  const current = toSearchParams(searchParams);

  const sortKey = current.get(sortParam);
  const rawDirection = current.get(directionParam);
  const direction: SortDirection = rawDirection === "desc" ? "desc" : "asc";
  const sort: TableSort | undefined = sortKey ? { key: sortKey, direction } : defaultSort;

  const rawPage = Number.parseInt(current.get(pageParam) ?? "1", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  const buildHref = (mutate: (params: URLSearchParams) => void): string => {
    const next = new URLSearchParams(current);
    mutate(next);
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  return {
    sort,
    page,
    pageSize,
    sortHref: (key, nextDirection) =>
      buildHref((params) => {
        params.set(sortParam, key);
        params.set(directionParam, nextDirection);
        params.delete(pageParam);
      }),
    pageHref: (nextPage) =>
      buildHref((params) => {
        if (nextPage <= 1) params.delete(pageParam);
        else params.set(pageParam, String(nextPage));
      })
  };
}
