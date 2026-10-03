"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell, AuthShell, Notice } from "@assurmatch/ui/backoffice";
import type { AppShellUser, NavGroup } from "@assurmatch/ui/backoffice";
import { logoutAction } from "../backoffice-session-actions";

export type BrokerPlan = "starter" | "pro" | "enterprise";

export interface BrokerShellProps {
  children: ReactNode;
  user?: AppShellUser | undefined;
  plan?: BrokerPlan | undefined;
  envBadge?: string | undefined;
  /** Spec 051 R12: persistent banner of a suspended partner (computed by the layout from the session). */
  suspendedBanner?: string | undefined;
}

/** Ecrans d'authentification: rendus hors du shell applicatif, sans navigation ni session. */
const authRoutePrefixes = ["/login", "/mfa", "/activate", "/password-change", "/password-reset"];

const SCOPE = "Back-office Courtier";
const PRO_BADGE = "Pro";
const PRO_HINT = "Disponible avec le plan Pro";
const ENTERPRISE_BADGE = "Enterprise";

/**
 * Le groupe CRM porte le libelle "CRM" du menu courtier. La constante garde le libelle
 * a un seul endroit et la specification statique `broker-ux-polish.spec.ts` le verifie.
 */
const CRM_GROUP = { label: "CRM" } as const;

function isAuthRoute(pathname: string): boolean {
  return authRoutePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Menu courtier. Aucun libelle, aucune route et aucune regle de plan ne vit dans `@assurmatch/ui`:
 * tout est fourni ici, donc le back-office courtier reste une application separee de l'admin.
 *
 * Les entrees CRM restent visibles en plan Starter mais desactivees: le portail Starter ne presente
 * jamais Kanban, pipeline avance, taches, rappels ou assignation equipe comme disponibles.
 */
function brokerNavigation(plan?: BrokerPlan | undefined): NavGroup[] {
  const starter = plan === "starter";
  const crmRestriction = starter
    ? { disabled: true, badge: PRO_BADGE, disabledHint: PRO_HINT }
    : { disabled: false, badge: undefined, disabledHint: undefined };
  const organisationBadge = plan && plan !== "enterprise" ? ENTERPRISE_BADGE : undefined;

  return [
    {
      title: "Activite",
      items: [
        { label: "Dashboard", href: "/", icon: "dashboard", match: ["/"] },
        { label: "Leads", href: "/leads", icon: "leads", match: ["/leads"] },
        // Spec 052 FR-006: every broker role reads its offers; owner and managers edit them.
        { label: "Mes offres", href: "/offers", icon: "catalog", match: ["/offers"] }
      ]
    },
    {
      title: CRM_GROUP.label,
      items: [
        { label: "Pipeline", href: "/crm", icon: "crm", match: ["/crm"], ...crmRestriction },
        { label: "Vue tableau", href: "/crm/leads", icon: "checklist", match: ["/crm/leads"], ...crmRestriction }
      ]
    },
    {
      title: "Organisation",
      items: [
        // Spec 053 (G-01..G-04): company profile, licences and team are open to every plan.
        { label: "Société", href: "/company", icon: "partners", match: ["/company"] },
        { label: "Licences", href: "/licenses", icon: "shield", match: ["/licenses"] },
        { label: "Equipe", href: "/team", icon: "team", match: ["/team"] },
        { label: "Entreprise", href: "/enterprise", icon: "building", match: ["/enterprise"], badge: organisationBadge }
      ]
    },
    {
      title: "Compte",
      items: [
        { label: "Notifications", href: "/notifications", icon: "bell", match: ["/notifications"] },
        { label: "Compte", href: "/account", icon: "user", match: ["/account"] }
      ]
    }
  ];
}

/** Enveloppe mince autour du design system back-office partage: aucune logique de session ici. */
export function BrokerShell({ children, user, plan, envBadge, suspendedBanner }: BrokerShellProps) {
  const pathname = usePathname() || "/";

  if (isAuthRoute(pathname)) {
    return (
      <AuthShell scope={SCOPE} dataAttributes={{ "data-broker-auth-shell": "simple" }}>
        {children}
      </AuthShell>
    );
  }

  return (
    <AppShell
      brand={{ scope: SCOPE, homeHref: "/", plan: planLabel(plan) }}
      navigation={brokerNavigation(plan)}
      user={user}
      logoutAction={logoutAction}
      logoutLabel="Deconnexion"
      envBadge={envBadge}
      pathname={pathname}
      navLabel="Navigation courtier principale"
      menuOpenLabel="Ouvrir le menu courtier"
      menuCloseLabel="Fermer le menu courtier"
      userMenuLabel="Menu du compte courtier"
      breadcrumbLabel="Fil d'Ariane"
      dataAttributes={{ "data-broker-shell": "true" }}
    >
      {suspendedBanner ? (
        <div role="status" data-tenant-suspended-banner="true">
          <Notice tone="warning" title="Compte suspendu">{suspendedBanner}</Notice>
        </div>
      ) : null}
      {children}
    </AppShell>
  );
}

const PLAN_LABELS: Record<BrokerPlan, string> = {
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise"
};

export function planLabel(plan?: BrokerPlan | undefined): string | undefined {
  return plan ? PLAN_LABELS[plan] : undefined;
}
