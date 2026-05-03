"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { logoutAction } from "../backoffice-session-actions";

const authRoutePrefixes = ["/login", "/mfa", "/activate", "/password-change", "/password-reset"];

const navigationItems = [
  { label: "Dashboard", href: "/", match: ["/"] },
  { label: "Leads", href: "/leads", match: ["/leads"] },
  { label: "CRM", href: "/crm", match: ["/crm"] },
  { label: "Equipe", href: "/team", match: ["/team"] },
  { label: "Compte", href: "/account", match: ["/account"] }
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
  return item?.label ?? "Espace courtier";
}

export function BrokerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";

  if (isAuthRoute(pathname)) {
    return (
      <div className="auth-shell" data-broker-auth-shell="simple">
        <div className="auth-shell__panel">{children}</div>
      </div>
    );
  }

  return (
    <div className="broker-shell" data-broker-shell="true">
      <aside className="broker-sidebar" aria-label="Navigation courtier principale">
        <div className="broker-brand">
          <span className="broker-brand__name">AssurMatch</span>
          <span className="broker-brand__scope">Back-office Courtier</span>
        </div>
        <nav className="broker-nav" aria-label="Espace courtier">
          {navigationItems.map((item) => {
            const active = isActive(pathname, item.match);
            return (
              <a key={item.href} className="broker-nav__link" href={item.href} aria-current={active ? "page" : undefined}>
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>
        <div className="broker-sidebar__footer">
          <div className="broker-user" aria-label="Utilisateur courtier connecte">
            <span className="broker-user__label">Session courtier</span>
            <span className="broker-user__role">Tenant verifie cote API</span>
          </div>
          <form action={logoutAction}>
            <button className="button button--secondary" type="submit">Deconnexion</button>
          </form>
        </div>
      </aside>
      <div className="broker-main">
        <header className="broker-topbar">
          <p className="broker-topbar__title">{titleForPath(pathname)}</p>
          <form action={logoutAction}>
            <button className="button button--secondary" type="submit">Deconnexion</button>
          </form>
        </header>
        <main className="broker-content" id="broker-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
