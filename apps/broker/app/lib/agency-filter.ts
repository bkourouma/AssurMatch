/**
 * Spec 064: agency DISPLAY filter of the broker CRM (Enterprise cabinets only). It never restricts
 * access: RBAC is unchanged and the API only narrows what is listed or counted. A lead belongs to an
 * agency through the agency membership of its assigned advisor; leads without advisor, or whose
 * advisor is in no agency, are « Sans agence ». Pure logic (no I/O), unit tested.
 */
export const AGENCY_PARAM = "agence";
export const AGENCY_ALL = "all";
export const AGENCY_NONE = "none";
export const AGENCY_ALL_LABEL = "Toutes les agences";
export const AGENCY_NONE_LABEL = "Sans agence";
export const AGENCY_DISPLAY_HINT = "Filtre d'affichage : il ne restreint pas vos droits d'accès.";

export interface AgencyFilterAgency {
  id: string;
  name: string;
  memberIds?: string[] | undefined;
}

export interface AgencyFilterOption {
  value: string;
  label: string;
}

export interface AgencyFilter {
  /** False for non-Enterprise plans, and for an Enterprise cabinet without readable agencies. */
  enabled: boolean;
  options: AgencyFilterOption[];
  /** `all`, `none` or an agency uuid; always one of the option values (`all` when disabled). */
  selected: string;
  /** Value of the API `agencyId` parameter: `none` or an agency uuid; undefined for « all » and when disabled. */
  apiAgencyId: string | undefined;
}

const DISABLED: AgencyFilter = { enabled: false, options: [], selected: AGENCY_ALL, apiAgencyId: undefined };

function firstValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Default selection when the `agence` parameter is absent: the user's own agency if the user belongs to
 * exactly one agency, otherwise « all ». An explicit `all` is kept (it is a value, not an absence).
 */
export function resolveAgencyFilter(input: {
  plan?: string | undefined;
  actorId?: string | undefined;
  agencies: AgencyFilterAgency[];
  param?: string | string[] | undefined;
}): AgencyFilter {
  if (input.plan !== "enterprise" || input.agencies.length === 0) return DISABLED;

  const options: AgencyFilterOption[] = [
    { value: AGENCY_ALL, label: AGENCY_ALL_LABEL },
    ...[...input.agencies].sort((a, b) => a.name.localeCompare(b.name, "fr")).map((agency) => ({ value: agency.id, label: agency.name })),
    { value: AGENCY_NONE, label: AGENCY_NONE_LABEL }
  ];
  const known = new Set(options.map((option) => option.value));

  const requested = firstValue(input.param);
  let selected: string;
  if (requested !== undefined) {
    // An unknown or foreign value is never forwarded: it falls back to « all ».
    selected = known.has(requested) ? requested : AGENCY_ALL;
  } else {
    const own = input.actorId ? input.agencies.filter((agency) => (agency.memberIds ?? []).includes(input.actorId as string)) : [];
    selected = own.length === 1 && own[0] ? own[0].id : AGENCY_ALL;
  }

  return { enabled: true, options, selected, apiAgencyId: selected === AGENCY_ALL ? undefined : selected };
}

/** Optional query object accepted by the broker readers (`listCrmLeads`, dashboard, advisors, kanban). */
export function agencyQuery(filter: AgencyFilter): { agencyId?: string } {
  return filter.apiAgencyId ? { agencyId: filter.apiAgencyId } : {};
}
