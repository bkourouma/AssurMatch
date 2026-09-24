"use client";

import type { ComponentProps, ReactNode } from "react";
import { Link, usePathname } from "../../../i18n/navigation";

/**
 * String form of the typed i18n href. Every entry of the main navigation is a static route, so the
 * object form (`{ pathname, params }`) is deliberately excluded: the active state is a simple prefix
 * comparison and never has to compile a parameterised pathname.
 */
export type NavHref = Extract<ComponentProps<typeof Link>["href"], string>;

export interface NavLinkProps {
  href: NavHref;
  children: ReactNode;
  className?: string;
  /** Glyph before the label; the mobile menu uses it, the header row does not. */
  icon?: ReactNode;
  /** Glyph after the label, e.g. the chevron of the mobile menu rows. */
  iconAfter?: ReactNode;
}

/**
 * Navigation link that knows whether it is the current page.
 *
 * `usePathname` of the localised router returns the INTERNAL pathname (`/countries/[countryCode]`,
 * never `/pays/CI`), so one comparison works in both languages: the link is current on its own route
 * and on everything below it (`/guides` stays current on `/guides/[slug]`).
 */
export function NavLink({ href, children, className, icon, iconAfter }: NavLinkProps) {
  const pathname = usePathname();
  const current = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  return (
    <Link className={className} href={href} aria-current={current ? "page" : undefined}>
      {icon}
      <span>{children}</span>
      {iconAfter}
    </Link>
  );
}
