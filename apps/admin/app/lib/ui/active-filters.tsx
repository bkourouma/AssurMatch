import { toQueryString } from "../operations-api";
import { Cluster } from "./admin-ui";

export interface ActiveFilterChip {
  /** Name of the query parameter the chip clears. */
  key: string;
  /** Human wording of the filter ("Statut"). */
  label: string;
  /** Human wording of the value ("Routée"). */
  value: string;
}

/**
 * Summary of the filters currently applied to a console, each one removable with a single link. The
 * filters stay in the query string (shareable view); a chip only drops its own key and the page
 * number, so removing a filter never leaves the operator on an out-of-range page.
 */
export function ActiveFilters({ pathname, filters, chips }: { pathname: string; filters: Record<string, string | undefined>; chips: ActiveFilterChip[] }) {
  if (chips.length === 0) return null;
  return (
    <Cluster as="section" aria-label="Filtres appliqués">
      <span className="bo-description">Filtres appliqués :</span>
      {chips.map((chip) => (
        <a
          key={chip.key}
          className="bo-filters__count"
          href={`${pathname}${toQueryString({ ...filters, [chip.key]: undefined })}`}
          aria-label={`Retirer le filtre ${chip.label} : ${chip.value}`}
          title="Retirer ce filtre"
        >
          {`${chip.label} : ${chip.value} ×`}
        </a>
      ))}
    </Cluster>
  );
}
