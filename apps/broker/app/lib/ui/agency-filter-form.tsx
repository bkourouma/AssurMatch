import { AGENCY_DISPLAY_HINT, AGENCY_PARAM } from "../agency-filter";
import type { AgencyFilter } from "../agency-filter";
import { Button, Cluster, Field, Select } from "./broker-ui";

/**
 * Spec 064: small GET form of the agency display filter for pages without a FilterBar (CRM dashboard,
 * Kanban). It reloads the page with `?agence=`; without JavaScript the button still applies it.
 */
export function AgencyFilterForm({ action, filter, fieldId = "agency-filter" }: { action: string; filter: AgencyFilter; fieldId?: string }) {
  if (!filter.enabled) return null;
  return (
    <form action={action} method="get" aria-label="Filtre par agence">
      <Cluster>
        <Field id={fieldId} label="Agence" hint={AGENCY_DISPLAY_HINT}>
          <Select id={fieldId} name={AGENCY_PARAM} defaultValue={filter.selected} options={filter.options} />
        </Field>
        <Button type="submit" variant="secondary" size="sm">Appliquer</Button>
      </Cluster>
    </form>
  );
}
