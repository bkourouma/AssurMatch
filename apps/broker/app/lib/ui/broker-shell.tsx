"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell, AuthShell, Notice } from "@assurmatch/ui/backoffice";
import type { AppShellUser, NavGroup, ThemeValue } from "@assurmatch/ui/backoffice";
import { logoutAction } from "../backoffice-session-actions";
import { BROKER_THEME_COOKIE } from "../theme-cookie";
import { PLATFORM_MENTION, brandAccentCss } from "../branding";
import type { BrokerBranding } from "../branding";

export type BrokerPlan = "starter" | "pro" | "enterprise";

export interface BrokerShellProps {
  children: ReactNode;
  user?: AppShellUser | undefined;
  plan?: BrokerPlan | undefined;
  /** Lot 3 (spec 069 FR-003): computed by the layout with `agenciesOverviewAccess` (Enterprise and a role seeing the whole cabinet). */
  showAgenciesOverview?: boolean | undefined;
  /** Spec 064 FR-009: Enterprise charte (label, validated colour) read by the layout; absent for other plans. */
  branding?: BrokerBranding | undefined;
  envBadge?: string | undefined;
  /** Spec 051 R12: persistent banner of a suspended partner (computed by the layout from the session). */
  suspendedBanner?: string | undefined;
  /** Current theme, read from the cookie by the layout. */
  theme?: ThemeValue | undefined;
}

/** Ecrans d'authentification: rendus hors du shell applicatif, sans navigation ni session. */
const authRoutePrefixes = ["/login", "/mfa", "/activate", "/password-change", "/password-reset"];

const SCOPE = "Back-office Courtier";
const PRO_BADGE = "Pro";
const PRO_HINT = "Disponible avec le plan Pro";
const ENTERPRISE_BADGE = "Enterprise";
const LOSS_ANALYSIS_LABEL = "Analyse des pertes";
const AGENCIES_OVERVIEW_LABEL = "Vue multi-agences";
const AGENCIES_OVERVIEW_HREF = "/enterprise/agencies";

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
function brokerNavigation(plan?: BrokerPlan | undefined, showAgenciesOverview = false): NavGroup[] {
  const starter = plan === "starter";
  const crmRestriction = starter
    ? { disabled: true, badge: PRO_BADGE, disabledHint: PRO_HINT }
    : { disabled: false, badge: undefined, disabledHint: undefined };
  const organisationBadge = plan && plan !== "enterprise" ? ENTERPRISE_BADGE : undefined;
  // Spec 064 FR-003: the loss analysis is an Enterprise option; Starter keeps the Pro restriction above.
  const lossAnalysisRestriction = starter
    ? crmRestriction
    : plan && plan !== "enterprise"
      ? { disabled: true, badge: ENTERPRISE_BADGE, disabledHint: "Disponible avec le plan Enterprise" }
      : { disabled: false, badge: undefined, disabledHint: undefined };

  return [
    {
      title: "Activité",
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
        { label: "Vue tableau", href: "/crm/leads", icon: "checklist", match: ["/crm/leads"], ...crmRestriction },
        // Spec 055 FR-010: the Kanban route existed without a screen.
        { label: "Vue Kanban", href: "/crm/kanban", icon: "crm", match: ["/crm/kanban"], ...crmRestriction },
        // Spec 064 FR-003: AI assistance on lost leads (Enterprise), validated by a human.
        { label: LOSS_ANALYSIS_LABEL, href: "/crm/loss-analysis", icon: "sparkles", match: ["/crm/loss-analysis"], ...lossAnalysisRestriction }
      ]
    },
    {
      title: "Organisation",
      items: [
        // Spec 053 (G-01..G-04): company profile, licences and team are open to every plan.
        { label: "Société", href: "/company", icon: "partners", match: ["/company"] },
        { label: "Licences", href: "/licenses", icon: "shield", match: ["/licenses"] },
        { label: "Équipe", href: "/team", icon: "team", match: ["/team"] },
        { label: "Entreprise", href: "/enterprise", icon: "building", match: ["/enterprise"], badge: organisationBadge },
        // Lot 3 (spec 069 FR-003): consolidated multi-agency view, linked only when the layout allows it (Enterprise plan and a role seeing the whole cabinet).
        ...(showAgenciesOverview ? [{ label: AGENCIES_OVERVIEW_LABEL, href: AGENCIES_OVERVIEW_HREF, icon: "gauge" as const, match: [AGENCIES_OVERVIEW_HREF] }] : [])
      ]
    },
    {
      title: "Compte",
      items: [
        { label: "Notifications", href: "/notifications", icon: "bell", match: ["/notifications"] },
        // Spec 060 G-05: facturation visible pour tous les plans, Starter compris.
        { label: "Facturation", href: "/billing", icon: "receipt", match: ["/billing"] },
        { label: "Compte", href: "/account", icon: "user", match: ["/account"] }
      ]
    }
  ];
}

/** Enveloppe mince autour du design system back-office partage: aucune logique de session ici. */
export function BrokerShell({ children, user, plan, showAgenciesOverview, branding, envBadge, suspendedBanner, theme }: BrokerShellProps) {
  const pathname = usePathname() || "/";
  // Spec 064 FR-009: the cabinet label sits next to the plan and the platform mention is always kept.
  // The colour only overrides the sidebar primary token, and only when it keeps a readable contrast.
  const accentCss = branding?.color ? brandAccentCss(branding.color) : "";
  const tenantLine = branding ? `${branding.label} · ${PLATFORM_MENTION}` : undefined;

  if (isAuthRoute(pathname)) {
    return (
      <AuthShell scope={SCOPE} dataAttributes={{ "data-broker-auth-shell": "simple" }}>
        {children}
      </AuthShell>
    );
  }

  return (
    <AppShell
      brand={{ scope: SCOPE, homeHref: "/", plan: planLabel(plan), tenant: tenantLine }}
      navigation={brokerNavigation(plan, showAgenciesOverview === true)}
      user={user}
      logoutAction={logoutAction}
      logoutLabel="Deconnexion"
      envBadge={envBadge}
      pathname={pathname}
      navLabel="Navigation courtier principale"
      menuOpenLabel="Ouvrir le menu courtier"
      menuCloseLabel="Fermer le menu courtier"
      userMenuLabel="Menu du compte courtier"
      themePicker={{ cookieName: BROKER_THEME_COOKIE, current: theme ?? "clair", label: "Theme" }}
      breadcrumbLabel="Fil d'Ariane"
      dataAttributes={{ "data-broker-shell": "true", ...(accentCss ? { "data-broker-brand": "custom" } : {}) }}
    >
      {accentCss ? <style>{accentCss}</style> : null}
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
