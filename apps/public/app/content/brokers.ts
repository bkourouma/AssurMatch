import type { AppLocale } from "../../i18n/routing";

/**
 * Editorial content for the broker acquisition pages (spec 050, content/05-espace-courtiers.md).
 *
 * Every figure a broker cares about (the actual monthly subscription, the per-lead price, the setup
 * fee) is business-to-business pricing and comes from `GET /partners/plans` through
 * `listPartnerPlans`, never from here. This module only holds what the charter states in plain words:
 * the name, positioning, audience, feature list and exclusions of each plan, the seven criteria that
 * make a lead billable, the shape of the revenue model, what the platform expects from a partner and
 * two FAQ lists. Nothing here is invented: every AI-touching line carries the D2 transparency label
 * (« généré par IA, à relire par votre équipe ») and never uses "IA" as a marketing prefix; every
 * `[à confirmer]`-only answer of the source content file is left out rather than shown empty.
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
  /** What this plan does not include, stated so a broker never assumes it. */
  notIncluded: readonly string[];
  /** The plan whose features this plan includes in full, before its own additions. */
  includesPlan?: BrokerPlanKey;
}

export interface BillableLeadCriterion {
  /** Matches `billableLeadCriteriaSchema` (packages/shared/contracts/billing.contracts.ts). Pinned by
   * `apps/public/tests/public-brokers.spec.ts`: never rename these ids. */
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

export interface BrokerFaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface BrokerContent {
  plans: readonly BrokerPlanContent[];
  /** What no plan includes, whatever the tier (constitution I/III: no payment, no e-signature, no
   * policy issuance on this site). */
  neverIncluded: readonly string[];
  billableLeadCriteria: readonly BillableLeadCriterion[];
  revenueModel: BrokerRevenueModelContent;
  /** What the platform expects from a partner broker, stated plainly on /brokers. */
  partnerExpectations: readonly string[];
  /** "Questions fréquentes des courtiers" on /brokers. */
  partnerFaq: readonly BrokerFaqItem[];
  /** "Questions fréquentes sur la facturation" on /brokers/pricing. */
  billingFaq: readonly BrokerFaqItem[];
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
        "Tableau de bord basique"
      ],
      notIncluded: [
        "Pas de CRM",
        "Pas de gestion de tâches ni de rappels",
        "Pas d'attribution des leads à une équipe",
        "Pas de fonction générée par IA"
      ]
    },
    {
      key: "pro",
      name: "Pro",
      positioning: "Pour piloter les leads avec un CRM et des outils d'aide à la qualification.",
      audience: "Cabinets de courtage avec une équipe commerciale et un besoin de suivi structuré.",
      includesPlan: "starter",
      features: [
        "CRM en tableau Kanban",
        "Pipeline commercial",
        "Notes internes",
        "Tâches et rappels",
        "Attribution des leads à un agent",
        "Dépôt de documents",
        "Devis joints ou saisis dans le dossier",
        "Tableau de bord courtier",
        "Tri automatique des leads reçus (généré par IA, à relire par votre équipe)",
        "Résumé automatique de la demande (généré par IA, à relire par votre équipe)",
        "Suggestions de relance (généré par IA, à relire par votre équipe)",
        "Détection automatique des doublons (généré par IA, à relire par votre équipe)",
        "Export avancé"
      ],
      notIncluded: ["Pas de multi-agence", "Pas d'API partenaire ni de webhooks", "Pas de marque blanche"]
    },
    {
      key: "enterprise",
      name: "Enterprise",
      positioning: "Pour les réseaux multi-agences avec des besoins d'intégration et de reporting avancés.",
      audience: "Groupes de courtage multi-agences ou réseaux avec des exigences techniques avancées.",
      includesPlan: "pro",
      features: [
        "Multi-agence",
        "Gestion multi-utilisateur avec rôles personnalisés",
        "API partenaire",
        "Webhooks",
        "Reporting avancé",
        "SLA prioritaire",
        "Intégrations avec des CRM externes",
        "Fonctions avancées supplémentaires (généré par IA, à relire par votre équipe)",
        "Tableaux de bord consolidés",
        "Marque blanche et domaine personnalisé, en option"
      ],
      notIncluded: []
    }
  ],
  neverIncluded: [
    "Encaissement de prime : non disponible.",
    "Commission sur une prime : non disponible.",
    "Signature électronique de contrat : non disponible dans cette version.",
    "Émission de police ou d'attestation : non disponible dans cette version."
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
    "Détenir une licence valide pour exercer l'activité de courtage dans le pays concerné.",
    "Répondre aux demandes transmises avec discipline, dans un délai raisonnable.",
    "Confirmer des prix honnêtes : le prix affiché au visiteur reste indicatif jusqu'à votre confirmation, sans majoration cachée au moment de conclure.",
    "Respecter le consentement du visiteur, y compris lorsqu'il le retire."
  ],
  partnerFaq: [
    {
      id: "qui-peut-candidater",
      question: "Qui peut candidater ?",
      answer:
        "Tout courtier détenant une licence valide pour exercer dans un pays ouvert peut déposer une candidature. Les pays annoncés avec une liste d'attente ne reçoivent pas encore de demandes. Chaque dossier est étudié individuellement par notre équipe conformité."
    },
    {
      id: "licence-verifiee",
      question: "Comment ma licence est-elle vérifiée ?",
      answer:
        "Notre équipe conformité vérifie le numéro et la date d'expiration indiqués dans votre dossier auprès de l'autorité de tutelle que vous mentionnez, avant toute activation."
    },
    {
      id: "facturation",
      question: "Qu'est-ce qui est facturé ?",
      answer:
        "Des frais de mise en place à l'activation, un abonnement mensuel selon votre formule, et un prix par lead qualifié qui remplit les sept critères de facturation. Le détail est sur la page Formules et tarifs. AssurMatch n'encaisse jamais de prime et ne prend aucune commission sur une prime."
    },
    {
      id: "proprietaire-donnees",
      question: "À qui appartiennent les données d'un lead transmis ?",
      answer:
        "Le lead reste attaché au consentement donné par le visiteur : vous le recevez pour le traiter et devez respecter ce consentement, y compris s'il est retiré après transmission."
    },
    {
      id: "attribution",
      question: "Comment mes leads me sont-ils attribués ?",
      answer:
        "Un moteur de règles déterministes décide : pays actif, produit actif, licence valide, quota disponible, exclusions. L'IA peut proposer un score ou un ordre de priorité, mais elle ne décide jamais seule qui reçoit une demande."
    },
    {
      id: "outils",
      question: "Dois-je changer mes outils actuels pour commencer ?",
      answer:
        "Non. En formule Starter, vous recevez les leads par e-mail, WhatsApp ou SMS sans rien changer à vos outils. Les formules Pro et Enterprise ajoutent un CRM en option."
    }
  ],
  billingFaq: [
    {
      id: "taxe",
      question: "Les tarifs affichés incluent-ils la taxe ?",
      answer: "Non, tous les tarifs affichés sont hors taxes."
    },
    {
      id: "tarif-absent",
      question: "Que se passe-t-il si aucun tarif n'est publié pour mon pays ?",
      answer: "La mention « Sur devis » s'affiche à la place d'un montant. Contactez notre équipe pour obtenir une proposition."
    },
    {
      id: "calcul-prix",
      question: "Comment est calculé le prix par lead qualifié ?",
      answer: "Un montant fixe par lead qui remplit les sept critères ci-dessus, propre à votre pays et à votre formule."
    }
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
        "Basic dashboard"
      ],
      notIncluded: ["No CRM", "No task management or reminders", "No lead assignment to a team", "No AI-generated function"]
    },
    {
      key: "pro",
      name: "Pro",
      positioning: "To manage leads with a CRM and qualification support tools.",
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
        "Automatic sorting of received leads (AI-generated, for your team to review)",
        "Automatic summary of the request (AI-generated, for your team to review)",
        "Follow-up suggestions (AI-generated, for your team to review)",
        "Automatic duplicate detection (AI-generated, for your team to review)",
        "Advanced export"
      ],
      notIncluded: ["No multi-agency", "No partner API or webhooks", "No white label"]
    },
    {
      key: "enterprise",
      name: "Enterprise",
      positioning: "For multi-agency networks with advanced integration and reporting needs.",
      audience: "Multi-agency brokerage groups or networks with advanced technical requirements.",
      includesPlan: "pro",
      features: [
        "Multi-agency",
        "Multi-user management with custom roles",
        "Partner API",
        "Webhooks",
        "Advanced reporting",
        "Priority SLA",
        "Integrations with external CRMs",
        "Additional advanced functions (AI-generated, for your team to review)",
        "Consolidated dashboards",
        "White label and custom domain, optional"
      ],
      notIncluded: []
    }
  ],
  neverIncluded: [
    "Premium collection: not available.",
    "Commission on a premium: not available.",
    "Electronic contract signature: not available in this version.",
    "Policy or certificate issuance: not available in this version."
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
    "Hold a valid licence to carry out brokerage activity in the country concerned.",
    "Respond to transmitted requests with discipline, within a reasonable time.",
    "Confirm honest prices: the price shown to the visitor stays indicative until your confirmation, with no hidden increase when the deal is closed.",
    "Respect the visitor's consent, including when it is withdrawn."
  ],
  partnerFaq: [
    {
      id: "qui-peut-candidater",
      question: "Who can apply?",
      answer:
        "Any broker holding a valid licence to operate in an open country can submit an application. Countries announced with a waiting list do not receive applications yet. Each file is reviewed individually by our compliance team."
    },
    {
      id: "licence-verifiee",
      question: "How is my licence checked?",
      answer: "Our compliance team checks the number and expiry date given in your file with the authority you name, before any activation."
    },
    {
      id: "facturation",
      question: "What is billed?",
      answer:
        "A setup fee at activation, a monthly subscription based on your plan, and a price per qualified lead that meets the seven billing criteria. Details are on the Plans and pricing page. AssurMatch never collects a premium and takes no commission on a premium."
    },
    {
      id: "proprietaire-donnees",
      question: "Who owns the data of a transmitted lead?",
      answer:
        "The lead stays tied to the consent given by the visitor: you receive it to handle it and must respect that consent, including if it is withdrawn after transmission."
    },
    {
      id: "attribution",
      question: "How are leads assigned to me?",
      answer:
        "A deterministic rules engine decides: active country, active product, valid licence, available quota, exclusions. AI may suggest a score or a priority order, but it never alone decides who receives a request."
    },
    {
      id: "outils",
      question: "Do I need to change my current tools to start?",
      answer:
        "No. On the Starter plan, you receive leads by e-mail, WhatsApp or SMS without changing anything in your tools. The Pro and Enterprise plans add an optional CRM."
    }
  ],
  billingFaq: [
    {
      id: "taxe",
      question: "Do the prices shown include tax?",
      answer: "No, all prices shown are before tax."
    },
    {
      id: "tarif-absent",
      question: "What happens if no price is published for my country?",
      answer: "The wording \"On request\" shows instead of an amount. Contact our team to get a proposal."
    },
    {
      id: "calcul-prix",
      question: "How is the price per qualified lead calculated?",
      answer: "A fixed amount per lead that meets the seven criteria above, specific to your country and your plan."
    }
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

export function neverIncludedFeatures(locale: AppLocale): readonly string[] {
  return catalogue[locale].neverIncluded;
}

export function partnerFaq(locale: AppLocale): readonly BrokerFaqItem[] {
  return catalogue[locale].partnerFaq;
}

export function billingFaq(locale: AppLocale): readonly BrokerFaqItem[] {
  return catalogue[locale].billingFaq;
}
