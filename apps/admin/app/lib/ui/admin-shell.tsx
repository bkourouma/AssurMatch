"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { logoutAction } from "../backoffice-session-actions";

export interface AdminShellUser {
  label: string;
  role?: string;
}

const authRoutePrefixes = ["/login", "/mfa", "/activate", "/password-change", "/password-reset"];

const navigationItems = [
  { label: "Dashboard", href: "/", match: ["/", "/dashboard"] },
  { label: "Catalogue", href: "/catalog", match: ["/catalog", "/offers", "/quote-form-definitions"] },
  { label: "Partenaires", href: "/partners", match: ["/partners"] },
  { label: "Utilisateurs", href: "/users", match: ["/users"] },
  { label: "Feature flags", href: "/feature-flags", match: ["/feature-flags"] },
  { label: "Conformite", href: "/compliance", match: ["/compliance", "/dashboard/compliance-alerts"] },
  { label: "Operations", href: "/operations", match: ["/operations", "/lead-assignments", "/prospects", "/quote-requests"] }
];

function isAuthRoute(pathname: string): boolean {
  return authRoutePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isActive(pathname: string, matches: string[]): boolean {
  if (pathname === "/" && matches.includes("/")) return true;
  return matches.some((match) => match !== "/" && (pathname === match || pathname.startsWith(`${match}/`)));
}

function titleForPath(pathname: string): string {
  const item = navigationItems.find((navItem) => isActive(pathname, navItem.match));
  return item?.label ?? "Administration";
}

export function AdminShell({ children, user }: { children: ReactNode; user?: AdminShellUser | undefined }) {
  const pathname = usePathname() || "/";

  if (isAuthRoute(pathname)) {
    return (
      <div className="auth-shell" data-admin-auth-shell="simple">
        <div className="auth-shell__panel">{children}</div>
      </div>
    );
  }

  return (
    <div className="admin-shell" data-admin-shell="true">
      <aside className="admin-sidebar" aria-label="Navigation admin principale">
        <div className="admin-brand">
          <span className="admin-brand__name">AssurMatch</span>
          <span className="admin-brand__scope">Back-office Admin</span>
        </div>
        <nav className="admin-nav" aria-label="Administration plateforme">
          {navigationItems.map((item) => {
            const active = isActive(pathname, item.match);
            return (
              <a key={item.href} className="admin-nav__link" href={item.href} aria-current={active ? "page" : undefined}>
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>
        <div className="admin-sidebar__footer">
          <div className="admin-user" aria-label="Utilisateur connecte">
            <span className="admin-user__label">{user?.label ?? "Session admin"}</span>
            <span className="admin-user__role">{user?.role ?? "Role verifie cote API"}</span>
          </div>
          <form action={logoutAction}>
            <button className="button button--secondary" type="submit">Deconnexion</button>
          </form>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <p className="admin-topbar__title">{titleForPath(pathname)}</p>
          <form action={logoutAction}>
            <button className="button button--secondary" type="submit">Deconnexion</button>
          </form>
        </header>
        <main className="admin-content" id="admin-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
