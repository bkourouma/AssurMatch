"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell, AuthShell } from "@assurmatch/ui/backoffice";
import type { NavGroup } from "@assurmatch/ui/backoffice";
import { logoutAction } from "../backoffice-session-actions";

export interface AdminShellUser {
  label: string;
  role?: string;
  initials?: string;
}

const authRoutePrefixes = ["/login", "/mfa", "/activate", "/password-change", "/password-reset"];

/**
 * Route table of the admin surface only. The shared package never carries it, so the two
 * back-offices stay separate applications that merely share a look.
 */
export const adminNavigation: NavGroup[] = [
  {
    title: "Pilotage",
    items: [
      { label: "Dashboard", href: "/", icon: "dashboard", match: ["/", "/dashboard"] },
      {
        label: "Operations",
        href: "/operations",
        icon: "operations",
        match: ["/operations", "/lead-assignments", "/prospects", "/quote-requests"],
        children: [
          { label: "Demandes de devis", href: "/quote-requests" },
          { label: "Assignations", href: "/lead-assignments" },
          { label: "Prospects", href: "/prospects" },
          { label: "Revue devis", href: "/operations/quote-review" },
          // Spec 056 (H-04): contact inbox.
          { label: "Messages de contact", href: "/operations/contact-messages" }
        ]
      },
      {
        label: "Conformite",
        href: "/compliance",
        icon: "shield",
        match: ["/compliance", "/dashboard/compliance-alerts"],
        children: [
          { label: "Alertes", href: "/dashboard/compliance-alerts" },
          // Spec 046: retention policies, anonymization batches and erasure requests.
          { label: "Conservation des donnees", href: "/compliance/retention" },
          // Spec 056 (H-05): audit-log search and restricted export.
          { label: "Journaux d'audit", href: "/compliance/audit-logs" }
        ]
      }
    ]
  },
  {
    title: "Catalogue",
    items: [
      { label: "Catalogue", href: "/catalog", icon: "catalog", match: ["/catalog", "/offers"] },
      // Spec 043: the screen existed but nothing linked to it, so no operator could reach it.
      { label: "Formulaires devis", href: "/quote-form-definitions", icon: "form", match: ["/quote-form-definitions"] },
      { label: "Scoring", href: "/scoring", icon: "gauge", match: ["/scoring"] },
      {
        label: "Routage",
        href: "/routing",
        icon: "route",
        match: ["/routing"],
        // Spec 056 (H-06): screens of the spec 049 anomaly routes and the decision history.
        children: [
          { label: "Regles", href: "/routing" },
          { label: "Anomalies", href: "/routing/anomalies" },
          { label: "Historique", href: "/routing/history" }
        ]
      }
    ]
  },
  {
    title: "Partenaires",
    items: [
      { label: "Partenaires", href: "/partners", icon: "partners", match: ["/partners"] },
      { label: "Integrations", href: "/partner-integrations", icon: "plug", match: ["/partner-integrations"] },
      { label: "Facturation", href: "/billing", icon: "receipt", match: ["/billing"] },
      { label: "Messagerie", href: "/messaging", icon: "message", match: ["/messaging"] }
    ]
  },
  {
    title: "Plateforme",
    items: [
      { label: "Utilisateurs", href: "/users", icon: "users", match: ["/users"] },
      { label: "Feature flags", href: "/feature-flags", icon: "flag", match: ["/feature-flags"] },
      { label: "Activation", href: "/activation-checklist", icon: "checklist", match: ["/activation-checklist"] },
      { label: "Assistance IA", href: "/ai-assistance", icon: "sparkles", match: ["/ai-assistance"] }
    ]
  }
];

function isAuthRoute(pathname: string): boolean {
  return authRoutePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function AdminShell({
  children,
  user,
  envBadge
}: {
  children: ReactNode;
  user?: AdminShellUser | undefined;
  envBadge?: string | undefined;
}) {
  const pathname = usePathname() || "/";
  const badge = envBadge ?? (process.env.NEXT_PUBLIC_APP_ENV === "local" ? "Local" : undefined);

  if (isAuthRoute(pathname)) {
    return (
      <AuthShell scope="Back-office Admin" dataAttributes={{ "data-admin-auth-shell": "simple" }}>
        {children}
      </AuthShell>
    );
  }

  return (
    <AppShell
      brand={{ scope: "Back-office Admin", homeHref: "/" }}
      navigation={adminNavigation}
      user={user}
      logoutAction={logoutAction}
      logoutLabel="Deconnexion"
      envBadge={badge}
      pathname={pathname}
      navLabel="Navigation admin principale"
      menuOpenLabel="Ouvrir la navigation admin"
      menuCloseLabel="Fermer la navigation admin"
      userMenuLabel="Utilisateur connecte"
      breadcrumbLabel="Fil d'Ariane admin"
      dataAttributes={{ "data-admin-shell": "true" }}
    >
      {children}
    </AppShell>
  );
}
