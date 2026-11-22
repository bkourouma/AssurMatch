import { Badge, Cluster } from "./admin-ui";

export interface ActiveFilterItem {
  /** Visible name of the filter, e.g. "Statut". */
  label: string;
  /** Visible value, already humanised by the page, e.g. "Brouillon". */
  value: string;
  /** Link that removes only this filter and keeps the others. */
  removeHref: string;
}

/**
 * Summary of the filters applied to a list, one removable chip each. The query string stays the
 * single source of truth: a chip is a plain link, so it works without JavaScript and the filtered
 * view remains a shareable URL. Renders nothing when no filter is active.
 */
export function ActiveFilters({ items, label = "Filtres appliqués" }: { items: ActiveFilterItem[]; label?: string }) {
  if (items.length === 0) return null;
  return (
    <Cluster aria-label={label} as="section">
      <span className="bo-description">{label} :</span>
      {items.map((item) => (
        <Badge key={`${item.label}:${item.value}`} tone="info">
          {item.label} : {item.value}
          {" "}
          <a href={item.removeHref} aria-label={`Retirer le filtre ${item.label} : ${item.value}`}>×</a>
        </Badge>
      ))}
    </Cluster>
  );
}

/**
 * Builds the href of a list page with one query parameter dropped (and the page reset), keeping the
 * other filters and the sort.
 */
export function hrefWithout(pathname: string, params: Record<string, string | string[] | undefined>, drop: string): string {
  const query = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    if (key === drop || key === "page" || key === "notice") continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) query.set(key, value);
  }
  const serialised = query.toString();
  return serialised ? `${pathname}?${serialised}` : pathname;
}
