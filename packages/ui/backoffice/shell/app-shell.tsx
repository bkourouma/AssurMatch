"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Icon } from "../icons";
import { Logo } from "../logo";
import { UserMenu } from "./user-menu";
import { findActive, isActive } from "./navigation";
import type { NavGroup } from "./navigation";
import type { ThemeValue } from "../themes";

export interface AppShellBrand {
  /** Name of the surface under the logo, e.g. "Back-office Admin". */
  scope: string;
  plan?: string | undefined;
  tenant?: string | undefined;
  homeHref: string;
}

export interface AppShellUser {
  label: string;
  role?: string | undefined;
  initials?: string | undefined;
}

export interface AppShellProps {
  brand: AppShellBrand;
  navigation: NavGroup[];
  user?: AppShellUser | undefined;
  /** Server action of the surface; the shared shell owns no session logic. */
  logoutAction?: ((formData: FormData) => void | Promise<void>) | undefined;
  logoutLabel: string;
  envBadge?: string | undefined;
  /** Current path, passed in by the app layout (which calls `usePathname`). */
  pathname: string;
  children: ReactNode;
  navLabel: string;
  menuOpenLabel: string;
  menuCloseLabel: string;
  userMenuLabel: string;
  /** Theme chooser for the account menu; the layout reads the cookie and passes the current theme. */
  themePicker?: { cookieName: string; current: ThemeValue; label: string } | undefined;
  /** Kept for API compatibility: the page header owns the breadcrumb, the topbar no longer repeats it. */
  breadcrumbLabel?: string | undefined;
  /** `data-*` attributes the surface needs for its own static tests. */
  dataAttributes?: Record<string, string> | undefined;
}

/**
 * Sidebar + topbar frame of a back-office. It holds no route table, no access rule and no surface
 * wording: the navigation, the labels and the logout action all come from the app that mounts it.
 */
export function AppShell({
  brand,
  navigation,
  user,
  logoutAction,
  logoutLabel,
  envBadge,
  pathname,
  children,
  navLabel,
  menuOpenLabel,
  menuCloseLabel,
  userMenuLabel,
  themePicker,
  dataAttributes
}: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // The drawer closes on Escape and hands focus back to the button that opened it.
  useEffect(() => {
    if (!navOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setNavOpen(false);
      menuButtonRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navOpen]);
  const active = findActive(navigation, pathname);
  // The topbar only exists where the sidebar is a drawer (under 900px): it names the current screen.
  // On desktop the account menu lives at the foot of the rail and the page header carries the
  // breadcrumb.
  const currentLabel = active?.child?.label ?? active?.item.label;
  // Position of the open section on the page ruler: its place among every destination of the app.
  const destinations = navigation.flatMap((group) => group.items);
  const position = active ? (destinations.indexOf(active.item) + 0.5) / Math.max(1, destinations.length) : 0;

  return (
    <div className="bo-shell" data-nav-open={navOpen ? "true" : "false"} {...dataAttributes}>
      <aside className="bo-sidebar">
        <div className="bo-sidebar__brand">
          <div className="bo-sidebar__brand-row">
            <a href={brand.homeHref} aria-label={brand.scope}>
              <Logo variant="auto" height={28} priority />
            </a>
            {envBadge ? <span className="bo-env-badge">{envBadge}</span> : null}
          </div>
          <div className="bo-sidebar__brand-tags">
            <span className="bo-sidebar__brand-scope">{brand.scope}</span>
            {brand.plan ? <span className="bo-nav__badge">{brand.plan}</span> : null}
            {brand.tenant ? <span className="bo-sidebar__brand-meta">{brand.tenant}</span> : null}
          </div>
        </div>
        <nav className="bo-sidebar__nav" aria-label={navLabel}>
          <div className="bo-nav">
            {navigation.map((group, groupIndex) => (
              <div className="bo-nav__group" key={group.title ?? `group-${groupIndex}`}>
                {group.title ? <p className="bo-nav__group-title">{group.title}</p> : null}
                {group.items.map((item) => {
                  const itemActive = active?.item === item;
                  const content = (
                    <>
                      {item.icon ? <Icon name={item.icon} size={20} /> : null}
                      <span className="bo-nav__label">{item.label}</span>
                      {item.badge ? <span className="bo-nav__badge">{item.badge}</span> : null}
                    </>
                  );

                  return (
                    <div key={item.href}>
                      {item.disabled ? (
                        <span className="bo-nav__link" aria-disabled="true" title={item.disabledHint}>
                          {content}
                        </span>
                      ) : (
                        <a className="bo-nav__link" href={item.href} aria-current={itemActive ? "page" : undefined}>
                          {content}
                        </a>
                      )}
                      {itemActive && item.children && item.children.length > 0 ? (
                        <div className="bo-nav__sublinks">
                          {item.children.map((child) => (
                            <a
                              className="bo-nav__sublink"
                              key={child.href}
                              href={child.href}
                              aria-current={isActive(pathname, child.match ?? [child.href]) ? "page" : undefined}
                            >
                              {child.label}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </nav>
        {user ? (
          <div className="bo-sidebar__footer">
            <UserMenu
              label={user.label}
              role={user.role}
              initials={user.initials}
              menuLabel={userMenuLabel}
              logoutLabel={logoutLabel}
              logoutAction={logoutAction}
              placement="up"
              themePicker={themePicker}
            />
          </div>
        ) : null}
      </aside>

      {navOpen ? (
        <button className="bo-scrim" type="button" aria-label={menuCloseLabel} onClick={() => setNavOpen(false)} />
      ) : null}

      <div className="bo-main">
        <header className="bo-topbar">
          <button
            className="bo-topbar__menu"
            ref={menuButtonRef}
            type="button"
            aria-label={navOpen ? menuCloseLabel : menuOpenLabel}
            aria-expanded={navOpen}
            onClick={() => setNavOpen((previous) => !previous)}
          >
            <Icon name={navOpen ? "close" : "menu"} size={20} />
          </button>

          {currentLabel ? <span className="bo-topbar__title">{currentLabel}</span> : null}

          <span className="bo-topbar__spacer" />
        </header>

        <div className="bo-scale" aria-hidden="true" style={{ "--bo-pos": position } as CSSProperties}>
          <span className="bo-scale__mark" />
        </div>
        <main className="bo-content" id="bo-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
