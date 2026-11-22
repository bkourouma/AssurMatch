"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Icon } from "../icons";
import { Logo } from "../logo";
import { SkipLink } from "./skip-link";
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
  /** Label of the keyboard skip link that jumps to the main content (default: French). */
  skipLinkLabel?: string | undefined;
  /** `data-*` attributes the surface needs for its own static tests. */
  dataAttributes?: Record<string, string> | undefined;
}

/** Same breakpoint as the stylesheet: under it the sidebar is a drawer behind a scrim. */
const DRAWER_QUERY = "(max-width: 900px)";
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function subscribeDrawer(onChange: () => void): () => void {
  const query = window.matchMedia(DRAWER_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function isDrawerViewport(): boolean {
  return window.matchMedia(DRAWER_QUERY).matches;
}

function neverDrawer(): boolean {
  return false;
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
  skipLinkLabel = "Aller au contenu principal",
  dataAttributes
}: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const wasDrawerOpen = useRef(false);
  const restoreFocus = useRef(false);
  // The drawer only exists under 900px; on desktop an open flag changes nothing (no inert, no lock).
  const isDrawer = useSyncExternalStore(subscribeDrawer, isDrawerViewport, neverDrawer);
  const drawerOpen = navOpen && isDrawer;

  // A new route closes the drawer (state adjusted while rendering, the documented way to derive it).
  const [seenPathname, setSeenPathname] = useState(pathname);
  if (seenPathname !== pathname) {
    setSeenPathname(pathname);
    setNavOpen(false);
  }

  // Open drawer: focus moves in, Tab loops inside the sidebar, Escape closes, the page behind does
  // not scroll. Closing through Escape or the close controls hands focus back to the menu button.
  useEffect(() => {
    if (!drawerOpen) {
      if (wasDrawerOpen.current && restoreFocus.current) menuButtonRef.current?.focus();
      wasDrawerOpen.current = false;
      restoreFocus.current = false;
      return;
    }
    wasDrawerOpen.current = true;
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      const sidebar = sidebarRef.current;
      if (event.key === "Escape") {
        // An account menu that is open inside the drawer takes the Escape for itself.
        if (sidebar?.querySelector('.bo-user-menu__button[aria-expanded="true"]')) return;
        restoreFocus.current = true;
        setNavOpen(false);
        return;
      }
      if (event.key !== "Tab" || !sidebar) return;
      const focusable = Array.from(sidebar.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !sidebar.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || !sidebar.contains(current))) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);
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
      <SkipLink label={skipLinkLabel} targetId="bo-content" />
      <aside className="bo-sidebar" id="bo-sidebar" ref={sidebarRef}>
        <button
          className="bo-sidebar__close"
          ref={closeButtonRef}
          type="button"
          aria-label={menuCloseLabel}
          onClick={() => {
            restoreFocus.current = true;
            setNavOpen(false);
          }}
        >
          <Icon name="close" size={20} />
        </button>
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
        <nav
          className="bo-sidebar__nav"
          aria-label={navLabel}
          onClick={(event) => {
            // Following a link navigates away: the drawer must not stay open over the new page.
            if (event.target instanceof Element && event.target.closest("a[href]")) setNavOpen(false);
          }}
        >
          <div className="bo-nav">
            {navigation.map((group, groupIndex) => (
              <div className="bo-nav__group" key={group.title ?? `group-${groupIndex}`}>
                {group.title ? <p className="bo-nav__group-title">{group.title}</p> : null}
                {group.items.map((item, itemIndex) => {
                  const itemActive = active?.item === item;
                  const hintId = `bo-nav-hint-${groupIndex}-${itemIndex}`;
                  const hasHint = Boolean(item.disabled && item.disabledHint);
                  const content = (
                    <>
                      {item.icon ? <Icon name={item.icon} size={20} /> : null}
                      <span className="bo-nav__label">{item.label}</span>
                      {item.badge ? (
                        item.badgeLabel ? (
                          <>
                            <span className="bo-nav__badge" aria-hidden="true">
                              {item.badge}
                            </span>
                            <span className="bo-visually-hidden">{item.badgeLabel}</span>
                          </>
                        ) : (
                          <span className="bo-nav__badge">{item.badge}</span>
                        )
                      ) : null}
                    </>
                  );

                  return (
                    <div key={item.href}>
                      {item.disabled ? (
                        <span
                          className="bo-nav__link"
                          aria-disabled="true"
                          title={item.disabledHint}
                          aria-describedby={hasHint ? hintId : undefined}
                        >
                          {content}
                          {hasHint ? (
                            <span className="bo-visually-hidden" id={hintId}>
                              {item.disabledHint}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <a
                          className="bo-nav__link"
                          href={item.href}
                          // A precise sub-entry is the page: its parent only says "you are in this section".
                          aria-current={itemActive ? (active?.child ? "true" : "page") : undefined}
                        >
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
        <button
          className="bo-scrim"
          type="button"
          tabIndex={-1}
          aria-label={menuCloseLabel}
          onClick={() => {
            restoreFocus.current = true;
            setNavOpen(false);
          }}
        />
      ) : null}

      {/* Inert while the drawer is open: the page behind it can neither be focused nor read. */}
      <div className="bo-main" inert={drawerOpen}>
        <header className="bo-topbar">
          <button
            className="bo-topbar__menu"
            ref={menuButtonRef}
            type="button"
            aria-label={navOpen ? menuCloseLabel : menuOpenLabel}
            aria-expanded={navOpen}
            aria-controls="bo-sidebar"
            onClick={() => setNavOpen((previous) => !previous)}
          >
            <Icon name={navOpen ? "close" : "menu"} size={20} />
          </button>

          {currentLabel ? <span className="bo-topbar__title" aria-current="page">{currentLabel}</span> : null}

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
