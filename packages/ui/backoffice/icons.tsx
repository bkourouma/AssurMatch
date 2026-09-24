import type { ReactNode } from "react";

/**
 * Inline 24px icon set drawn with `currentColor`, in the same hand-written Feather/Lucide style as
 * the public site. No icon dependency is added to the back-offices: every glyph lives here, is
 * decorative by default (`aria-hidden`) and inherits the colour of its container.
 */
export const iconNames = [
  "dashboard",
  "operations",
  "shield",
  "catalog",
  "form",
  "gauge",
  "route",
  "partners",
  "plug",
  "receipt",
  "message",
  "users",
  "flag",
  "checklist",
  "sparkles",
  "leads",
  "crm",
  "bell",
  "building",
  "team",
  "user",
  "settings",
  "logout",
  "menu",
  "close",
  "chevronDown",
  "chevronRight",
  "chevronLeft",
  "search",
  "filter",
  "check",
  "alert",
  "info",
  "external",
  "sort",
  "sortAsc",
  "sortDesc",
  "plus",
  "edit",
  "trash",
  "eye",
  "download",
  "calendar",
  "refresh",
  "lock"
] as const;

export type IconName = (typeof iconNames)[number];

const paths: Record<IconName, ReactNode> = {
  dashboard: (
    <>
      <path d="M4 4.5h6.5V11H4z" />
      <path d="M13.5 4.5H20V9h-6.5z" />
      <path d="M13.5 11.5H20v8h-6.5z" />
      <path d="M4 13.5h6.5v6H4z" />
    </>
  ),
  operations: (
    <>
      <path d="M4 7h10" />
      <path d="M4 12h16" />
      <path d="M4 17h7" />
      <circle cx="17" cy="7" r="2.2" />
      <circle cx="14" cy="17" r="2.2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5.5c0 4.2 2.9 7.6 7 9.5 4.1-1.9 7-5.3 7-9.5V6l-7-3Z" />
      <path d="m9 12 2.2 2.2L15.2 10" />
    </>
  ),
  catalog: (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10v16H5.5A1.5 1.5 0 0 1 4 18.5Z" />
      <path d="M10 4h8.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H10" />
      <path d="M13.5 8.5h3.2M13.5 12h3.2" />
    </>
  ),
  form: (
    <>
      <path d="M5.5 3.5h13a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" />
      <path d="M8 8h8M8 12h8M8 16h4" />
    </>
  ),
  gauge: (
    <>
      <path d="M4 17a8 8 0 1 1 16 0" />
      <path d="m12 17 4.2-5" />
      <path d="M4 17h16" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="18" cy="18" r="2.2" />
      <path d="M8.2 6H14a3 3 0 0 1 0 6h-4a3 3 0 0 0 0 6h5.8" />
    </>
  ),
  partners: (
    <>
      <path d="M9 11.5 6.5 9 3.5 12l4 4 2-1.8" />
      <path d="m15 11.5 2.5-2.5 3 3-4 4-2-1.8" />
      <path d="m9.5 14.5 2.5 2.5 2.5-2.5-2.5-2.5Z" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3.5v5M15 3.5v5" />
      <path d="M6.5 8.5h11v3a5.5 5.5 0 0 1-11 0Z" />
      <path d="M12 17v3.5" />
    </>
  ),
  receipt: (
    <>
      <path d="M5.5 3.5h13v17l-2.2-1.6-2.2 1.6-2.1-1.6-2.2 1.6-2.2-1.6-2.1 1.6Z" />
      <path d="M9 8.5h6M9 12.5h6" />
    </>
  ),
  message: (
    <>
      <path d="M4 5.5h16v11H9.5L5 20v-3.5H4Z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </>
  ),
  users: (
    <>
      <circle cx="9.5" cy="8" r="3.3" />
      <path d="M3.8 19.5a5.7 5.7 0 0 1 11.4 0" />
      <path d="M16 5.2a3.3 3.3 0 0 1 0 6.3" />
      <path d="M17 14.5a5.7 5.7 0 0 1 3.2 5" />
    </>
  ),
  flag: (
    <>
      <path d="M6 3.5v17" />
      <path d="M6 5h11l-2 3.2L17 11.5H6Z" />
    </>
  ),
  checklist: (
    <>
      <path d="m3.8 7 1.7 1.7L8.8 5.4" />
      <path d="m3.8 16 1.7 1.7 3.3-3.3" />
      <path d="M11.5 7.5h8.7M11.5 16.5h8.7" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 4 1.7 4.3L18 10l-4.3 1.7L12 16l-1.7-4.3L6 10l4.3-1.7Z" />
      <path d="M17.5 15.5 18.4 18l2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9Z" />
    </>
  ),
  leads: (
    <>
      <path d="M4 18.5V8l8-4.5L20 8v10.5" />
      <path d="M4 18.5h16" />
      <path d="M9.5 18.5v-5h5v5" />
    </>
  ),
  crm: (
    <>
      <path d="M4 5.5h5v14H4zM9.5 5.5h5v9h-5zM15 5.5h5v11h-5z" />
    </>
  ),
  bell: (
    <>
      <path d="M6.5 17V10a5.5 5.5 0 0 1 11 0v7" />
      <path d="M4.5 17h15" />
      <path d="M10 19.8a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  building: (
    <>
      <path d="M5 20.5V5.2A1.7 1.7 0 0 1 6.7 3.5h7.6A1.7 1.7 0 0 1 16 5.2v15.3" />
      <path d="M16 10.5h2.3a1.7 1.7 0 0 1 1.7 1.7v8.3" />
      <path d="M3.5 20.5h17" />
      <path d="M8.3 7.5h4.4M8.3 11.5h4.4M8.3 15.5h4.4" />
    </>
  ),
  team: (
    <>
      <circle cx="12" cy="7" r="3" />
      <circle cx="5.5" cy="11.5" r="2.4" />
      <circle cx="18.5" cy="11.5" r="2.4" />
      <path d="M7.5 19.5a4.5 4.5 0 0 1 9 0" />
      <path d="M2.5 17.8a3.5 3.5 0 0 1 3-2.6M21.5 17.8a3.5 3.5 0 0 0-3-2.6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M4.9 7.8l1.9 1.1M17.2 15.1l1.9 1.1M4.9 16.2l1.9-1.1M17.2 8.9l1.9-1.1" />
    </>
  ),
  logout: (
    <>
      <path d="M14.5 4.5H18a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-3.5" />
      <path d="M10 8.5 6.5 12l3.5 3.5" />
      <path d="M6.5 12H15" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  chevronDown: <path d="m6 9.5 6 6 6-6" />,
  chevronRight: <path d="m9.5 6 6 6-6 6" />,
  chevronLeft: <path d="m14.5 6-6 6 6 6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  filter: <path d="M4 5.5h16l-6.2 7v6l-3.6 1.8v-7.8Z" />,
  check: <path d="M4 12.5 9.5 18 20 6.5" />,
  alert: (
    <>
      <path d="M12 3.5 21 19.5H3L12 3.5Z" />
      <path d="M12 9.5v4" />
      <path d="M12 16.5h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <path d="M12 7.8h.01" />
    </>
  ),
  external: (
    <>
      <path d="M13.5 4.5H19.5V10.5" />
      <path d="m19.5 4.5-8 8" />
      <path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
    </>
  ),
  sort: (
    <>
      <path d="m8 9.5 4-4 4 4" />
      <path d="m8 14.5 4 4 4-4" />
    </>
  ),
  sortAsc: <path d="m6 14.5 6-6 6 6" />,
  sortDesc: <path d="m6 9.5 6 6 6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  edit: (
    <>
      <path d="M5 19h3.5L19 8.5 15.5 5 5 15.5Z" />
      <path d="m14 6.5 3.5 3.5" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 6.5h15" />
      <path d="M9.5 6.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
      <path d="M6.5 6.5 7.4 20a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9l.9-13.5" />
      <path d="M10.5 10.5v6M13.5 10.5v6" />
    </>
  ),
  eye: (
    <>
      <path d="M2.8 12S6.5 5.8 12 5.8 21.2 12 21.2 12 17.5 18.2 12 18.2 2.8 12 2.8 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v10" />
      <path d="m7.8 10 4.2 4 4.2-4" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  calendar: (
    <>
      <path d="M4.5 6.5h15v13h-15z" />
      <path d="M4.5 10.5h15" />
      <path d="M8.5 3.8v3M15.5 3.8v3" />
    </>
  ),
  refresh: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.4-5.5" />
      <path d="M19.5 4v4.2h-4.2" />
    </>
  ),
  lock: (
    <>
      <path d="M6.5 10.5h11v9.5h-11z" />
      <path d="M8.8 10.5V8a3.2 3.2 0 0 1 6.4 0v2.5" />
    </>
  )
};

export interface IconProps {
  name: IconName;
  size?: number | undefined;
  className?: string | undefined;
  /** When given the icon becomes meaningful (`role="img"`) instead of decorative. */
  title?: string | undefined;
}

export function Icon({ name, size = 24, className, title }: IconProps) {
  return (
    <svg
      className={className ? `bo-icon ${className}` : "bo-icon"}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...(title ? { role: "img" } : { "aria-hidden": true as const })}
    >
      {title ? <title>{title}</title> : null}
      {paths[name]}
    </svg>
  );
}
