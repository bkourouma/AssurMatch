import type { AppLocale } from "../../i18n/routing";

/**
 * Editorial content for the broker acquisition pages (SITE-408 to SITE-411).
 *
 * Every figure a broker cares about (the actual monthly subscription, the per-lead price, the setup
 * fee) is business-to-business pricing and comes from `GET /partners/plans` through
 * `listPartnerPlans`, never from here. This module only holds what the PRD states in plain words: the
 * name, positioning, audience and feature list of each plan (PRD section on broker plans), the seven
 * criteria that make a lead billable (PRD section 24), and the shape of the revenue model. Nothing
 * here is invented: every string traces back to the PRD backlog brief for specs 031-044.
 */

export type BrokerPlanKey = "starter" | "pro" | "enterprise";

export interface BrokerPlanContent {
  key: BrokerPlanKey;
  name: string;
  /** One line: what the plan is for. */
  positioning: string;
  /** Who the plan targets. */
  audience: string;
  /** The plan's own features. For pro/enterprise, `includesPlan` says which plan they build on. */
  features: readonly string[];
  /** The plan whose features this plan includes in full, before its own additions. */
  includesPlan?: BrokerPlanKey;
}

export interface BillableLeadCriterion {
  /** Matches `billableLeadCriteriaSchema` (packages/shared/contracts/billing.contracts.ts). */
  id:
    | "contact_reachable"
    | "country_active"
    | "product_active"
    | "consent_collected"
    | "not_duplicate"
    | "broker_assigned"
    | "minimum_information_complete";
  label: string;
}

export interface BrokerRevenueModelContent {
  intro: string;
  items: readonly string[];
  disabled: readonly string[];
}

export interface BrokerContent {
  plans: readonly BrokerPlanContent[];
  billableLeadCriteria: readonly BillableLeadCriterion[];
  revenueModel: BrokerRevenueModelContent;
  /** What the platform expects from a partner broker, stated plainly on /brokers. */
  partnerExpectations: readonly string[];
}

const fr: BrokerContent = {
  plans: [
    {
      key: "starter",
      name: "Starter",
      positioning: "Pour démarrer la réception de leads qualifiés sans changer vos outils.",
      audience: "Courtiers indépendants ou petites structures qui démarrent avec AssurMatch.",
      features: [
        "Leads qualifiés reçus par e-mail, WhatsApp ou SMS",
        "Portail courtier simplifié",
        "Accepter ou refuser un lead",
        "Historique minimal des leads reçus",
        "Tableau de bord basique",
        "Pas de CRM, pas de gestion de tâches, pas d'attribution d'équipe"
      ]
    },
    {
      key: "pro",
      name: "Pro",
      positioning: "Pour piloter les leads avec un CRM et une assistance IA à la qualification.",
      audience: "Cabinets de courtage avec une équipe commerciale et un besoin de suivi structuré.",
      includesPlan: "starter",
      features: [
        "CRM Kanban",
        "Pipeline commercial",
        "Notes internes",
        "Tâches et rappels",
        "Attribution des leads à un agent",
        "Dépôt de documents",
        "Devis joints ou saisis dans le dossier",
        "Tableau de bord courtier",
        "Score IA des leads (généré par IA)",
        "Résumé IA de la demande (généré par IA)",
        "Suggestions IA de relance (généré par IA)",
        "Détection IA des doublons (généré par IA)",
        "Export avancé"
      ]
    },
    {
      key: "enterprise",
      name: "Enterprise",
      positioning: "Pour les réseaux multi-agences avec des besoins d'intégration et de reporting avancés.",
      audience: "Groupes de courtage multi-agences ou réseaux avec des exigences techniques avancées.",
      includesPlan: "pro",
      features: [
        "Multi-agence",
        "Gestion multi-utilisateur avancée",
        "Rôles personnalisés",
        "API partenaire",
        "Webhooks",
        "Reporting avancé",
        "SLA prioritaire",
        "Intégrations avec des CRM externes",
        "IA avancée",
        "Tableaux de bord consolidés",
        "Marque blanche et domaine personnalisé, en option"
      ]
    }
  ],
  billableLeadCriteria: [
    { id: "contact_reachable", label: "Téléphone ou e-mail valide" },
    { id: "country_active", label: "Pays actif sur AssurMatch" },
    { id: "product_active", label: "Produit actif sur AssurMatch" },
    { id: "consent_collected", label: "Consentement du visiteur recueilli" },
    { id: "not_duplicate", label: "Demande non dupliquée" },
    { id: "broker_assigned", label: "Courtier assigné à la demande" },
    { id: "minimum_information_complete", label: "Informations minimales complètes" }
  ],
  revenueModel: {
    intro: "Le modèle de revenu d'AssurMatch envers ses courtiers partenaires repose sur trois éléments :",
    items: [
      "Des frais de mise en place à l'activation",
      "Un abonnement mensuel selon la formule choisie",
      "Une facturation au lead qualifié, selon les sept critères ci-dessous"
    ],
    disabled: ["Commission sur prime : désactivée", "Encaissement de prime : désactivé"]
  },
  partnerExpectations: [
    "Détenir une licence valide pour exercer l'activité de courtage dans le pays concerné",
    "Disposer de la capacité de répondre aux leads transmis dans un délai raisonnable",
    "Respecter le consentement du visiteur, y compris son retrait"
  ]
};

const en: BrokerContent = {
  plans: [
    {
      key: "starter",
      name: "Starter",
      positioning: "To start receiving qualified leads without changing your tools.",
      audience: "Independent brokers or small firms starting out with AssurMatch.",
      features: [
        "Qualified leads received by e-mail, WhatsApp or SMS",
        "Simplified broker portal",
        "Accept or reject a lead",
        "Minimal history of received leads",
        "Basic dashboard",
        "No CRM, no task management, no team assignment"
      ]
    },
    {
      key: "pro",
      name: "Pro",
      positioning: "To manage leads with a CRM and AI assistance for qualification.",
      audience: "Brokerage firms with a sales team and a need for structured follow-up.",
      includesPlan: "starter",
      features: [
        "Kanban CRM",
        "Sales pipeline",
        "Internal notes",
        "Tasks and reminders",
        "Lead assignment to an agent",
        "Document upload",
        "Quotes attached or entered in the file",
        "Broker dashboard",
        "AI lead scoring (AI-generated)",
        "AI request summary (AI-generated)",
        "AI follow-up suggestions (AI-generated)",
        "AI duplicate detection (AI-generated)",
        "Advanced export"
      ]
    },
    {
      key: "enterprise",
      name: "Enterprise",
      positioning: "For multi-agency networks with advanced integration and reporting needs.",
      audience: "Multi-agency brokerage groups or networks with advanced technical requirements.",
      includesPlan: "pro",
      features: [
        "Multi-agency",
        "Advanced multi-user management",
        "Custom roles",
        "Partner API",
        "Webhooks",
        "Advanced reporting",
        "Priority SLA",
        "External CRM integrations",
        "Advanced AI",
        "Consolidated dashboards",
        "White label and custom domain, optional"
      ]
    }
  ],
  billableLeadCriteria: [
    { id: "contact_reachable", label: "Valid phone or e-mail" },
    { id: "country_active", label: "Country active on AssurMatch" },
    { id: "product_active", label: "Product active on AssurMatch" },
    { id: "consent_collected", label: "Visitor consent collected" },
    { id: "not_duplicate", label: "Request not a duplicate" },
    { id: "broker_assigned", label: "Broker assigned to the request" },
    { id: "minimum_information_complete", label: "Minimum information complete" }
  ],
  revenueModel: {
    intro: "AssurMatch's revenue model with its partner brokers rests on three elements:",
    items: [
      "A setup fee at activation",
      "A monthly subscription based on the chosen plan",
      "Billing per qualified lead, based on the seven criteria below"
    ],
    disabled: ["Commission on premium: disabled", "Premium collection: disabled"]
  },
  partnerExpectations: [
    "Hold a valid licence to carry out brokerage activity in the country concerned",
    "Have the capacity to respond to transmitted leads within a reasonable time",
    "Respect the visitor's consent, including its withdrawal"
  ]
};

const catalogue: Record<AppLocale, BrokerContent> = { fr, en };

export function brokerContent(locale: AppLocale): BrokerContent {
  return catalogue[locale];
}

export function brokerPlans(locale: AppLocale): readonly BrokerPlanContent[] {
  return catalogue[locale].plans;
}

export function brokerPlan(locale: AppLocale, key: BrokerPlanKey): BrokerPlanContent | undefined {
  return catalogue[locale].plans.find((plan) => plan.key === key);
}

export function billableLeadCriteria(locale: AppLocale): readonly BillableLeadCriterion[] {
  return catalogue[locale].billableLeadCriteria;
}
