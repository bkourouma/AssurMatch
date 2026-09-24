import type { IconName } from "../icons";

export interface NavChild {
  label: string;
  href: string;
  /** Extra path prefixes that keep this sub-entry marked as current. */
  match?: string[] | undefined;
}

export interface NavItem {
  label: string;
  href: string;
  icon?: IconName | undefined;
  match?: string[] | undefined;
  /** Short pill rendered after the label, e.g. a plan name. */
  badge?: string | undefined;
  /** Visible but not reachable; the surface decides why, the package never does. */
  disabled?: boolean | undefined;
  disabledHint?: string | undefined;
  children?: NavChild[] | undefined;
}

export interface NavGroup {
  title?: string | undefined;
  items: NavItem[];
}

export interface ActiveNavigation {
  group: NavGroup;
  item: NavItem;
  child?: NavChild | undefined;
}

/**
 * "/" only matches exactly; every other entry matches its own path and anything below it, on a "/"
 * boundary so "/users" never lights up for "/users-export".
 */
export function isActive(pathname: string, matches: string[]): boolean {
  if (pathname === "/" && matches.includes("/")) return true;
  return matches.some((match) => match !== "/" && (pathname === match || pathname.startsWith(`${match}/`)));
}

/** Length of the longest configured prefix that matches the path, or -1 when nothing matches. */
function matchLength(pathname: string, matches: string[]): number {
  let best = -1;
  for (const match of matches) {
    if (match === "/" ? pathname === "/" : pathname === match || pathname.startsWith(`${match}/`)) {
      best = Math.max(best, match.length);
    }
  }
  return best;
}

/**
 * Entry of the navigation that matches the current path most specifically, with its group and
 * sub-entry: "/crm/leads" selects the "Vue tableau" entry even though "/crm" also matches.
 */
export function findActive(navigation: NavGroup[], pathname: string): ActiveNavigation | undefined {
  let best: { score: number; result: ActiveNavigation } | undefined;
  const consider = (score: number, result: ActiveNavigation) => {
    if (score >= 0 && (!best || score > best.score)) best = { score, result };
  };
  for (const group of navigation) {
    for (const item of group.items) {
      consider(matchLength(pathname, item.match ?? [item.href]), { group, item });
      for (const child of item.children ?? []) {
        consider(matchLength(pathname, child.match ?? [child.href]), { group, item, child });
      }
    }
  }
  return best?.result;
}

/** Label of the current screen, for a document title or a topbar heading. */
export function titleForPath(navigation: NavGroup[], pathname: string, fallback: string): string {
  const active = findActive(navigation, pathname);
  if (!active) return fallback;
  return active.child?.label ?? active.item.label;
}
