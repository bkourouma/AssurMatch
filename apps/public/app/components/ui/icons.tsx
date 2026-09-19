import type { ReactNode, SVGProps } from "react";

/**
 * Inline 24px icon set drawn with `currentColor`. No icon dependency is added to the public app:
 * every glyph lives here, is decorative (`aria-hidden`) and inherits the colour of its container.
 */
export const iconNames = [
  "check",
  "chevron-down",
  "chevron-right",
  "shield",
  "umbrella",
  "leaf",
  "phone",
  "whatsapp",
  "mail",
  "globe",
  "search",
  "alert",
  "info",
  "file",
  "user",
  "building",
  "star",
  "arrow-right",
  "menu",
  "close",
  "external"
] as const;

export type IconName = (typeof iconNames)[number];

const paths: Record<IconName, ReactNode> = {
  check: <path d="M4 12.5 9.5 18 20 6.5" />,
  "chevron-down": <path d="m6 9.5 6 6 6-6" />,
  "chevron-right": <path d="m9.5 6 6 6-6 6" />,
  shield: <path d="M12 3 5 6v5.5c0 4.2 2.9 7.6 7 9.5 4.1-1.9 7-5.3 7-9.5V6l-7-3Z" />,
  umbrella: (
    <>
      <path d="M12 3.5v1.2" />
      <path d="M3 13a9 9 0 0 1 18 0c-1.6-1.2-3.2-1.2-4.8 0-1.6-1.2-3.2-1.2-4.8 0-1.6-1.2-3.2-1.2-4.8 0Z" />
      <path d="M12 13v6a2 2 0 0 0 4 0" />
    </>
  ),
  leaf: (
    <>
      <path d="M4 20c0-8 5-14 16-15 0 10-5 15-11 15a5 5 0 0 1-5 0Z" />
      <path d="M9 15c2.5-2.5 5-4 9-5" />
    </>
  ),
  phone: <path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6L16.5 13l4 1.5v3a2 2 0 0 1-2.2 2C10.4 19 5 13.6 4.5 5.7a2 2 0 0 1 2-2.2Z" />,
  whatsapp: (
    <>
      <path d="M3.8 20.2 5 16.4A8.2 8.2 0 1 1 8.2 19.5l-4.4.7Z" />
      <path d="M9 9c.3 2.5 3.5 5.7 6 6 .8.1 1.5-.6 1.5-1.4l-2-.9-1 1c-1.2-.5-2.7-2-3.2-3.2l1-1-.9-2C9.6 7.5 8.9 8.2 9 9Z" />
    </>
  ),
  mail: (
    <>
      <path d="M3.5 6.5h17v11h-17z" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.2 2.4 3.3 5.3 3.3 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.3-5.3-3.3-8.5S9.8 5.9 12 3.5Z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
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
  file: (
    <>
      <path d="M14 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8L14 3.5Z" />
      <path d="M13.8 3.7V8.2h4.5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0" />
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
  star: <path d="m12 3.8 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 10l5.9-.9L12 3.8Z" />,
  "arrow-right": (
    <>
      <path d="M4 12h15.5" />
      <path d="m13.5 6 6 6-6 6" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  external: (
    <>
      <path d="M13.5 4.5H19.5V10.5" />
      <path d="m19.5 4.5-8 8" />
      <path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
    </>
  )
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name" | "children"> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 24, className, ...rest }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className ? `am-icon ${className}` : "am-icon"}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
