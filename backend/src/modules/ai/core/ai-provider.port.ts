import type { AiAssistTypeCatalog } from "../../../../../packages/shared/contracts/ai.contracts";
import { renderCompareExplainer, renderFormHelp, renderGuaranteeExplainer } from "./visitor-explainer-templates";

export interface AiGenerateRequest {
  assistType: AiAssistTypeCatalog;
  system: string;
  user: string;
  /** Ask for a JSON object answer (structured assist types). */
  json: boolean;
  maxOutputTokens: number;
  /** Minimised structured input, used by the deterministic provider to build its answer. */
  input: Record<string, unknown>;
  language: "fr" | "en";
}

export interface AiGenerateResult {
  text: string;
  model: string;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
}

export interface AiProviderPort {
  readonly name: string;
  generate(request: AiGenerateRequest): Promise<AiGenerateResult>;
}

function describe(value: unknown): string {
  if (value === null || value === undefined || value === "") return "non renseigné";
  if (Array.isArray(value)) return value.map(describe).join(", ");
  if (typeof value === "object") return Object.entries(value as Record<string, unknown>).map(([key, child]) => `${key}: ${describe(child)}`).join("; ");
  return String(value);
}

function entries(input: Record<string, unknown>, key: string): Array<[string, unknown]> {
  const value = input[key];
  return value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value as Record<string, unknown>) : [];
}

/**
 * Deterministic, offline provider. It is the default so every AI surface works and is testable
 * without a model key, and it is the fallback when the configured model provider fails. Its
 * wording is intentionally cautious and never advisory.
 */
export class TemplateAiProvider implements AiProviderPort {
  readonly name = "template";

  async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
    return { text: this.render(request), model: "template-v1" };
  }

  private render(request: AiGenerateRequest): string {
    const input = request.input;
    const product = describe(input.productKey ?? input.product);
    const country = describe(input.countryCode ?? input.country);
    switch (request.assistType) {
      case "visitor_product_assistant":
        return `Selon les informations fournies (${describe(input.need)}), un produit d'assurance de type ${product === "non renseigné" ? "à déterminer avec le courtier partenaire" : product} pourrait correspondre à votre besoin en ${country}. Comparez les offres indicatives puis demandez un devis: le courtier partenaire confirmera les garanties adaptées.`;
      case "visitor_request_summary": {
        const answers = entries(input, "answers");
        const provided = answers.filter(([, value]) => value !== null && value !== undefined && value !== "");
        const missing = answers.filter(([, value]) => value === null || value === undefined || value === "").map(([key]) => key);
        return `Résumé de votre besoin (${product}, ${country}): ${provided.length > 0 ? provided.map(([key, value]) => `${key}: ${describe(value)}`).join("; ") : "aucun élément détaillé"}.${missing.length > 0 ? ` Éléments à compléter: ${missing.join(", ")}.` : ""} Cette demande sera transmise à un courtier partenaire éligible qui confirmera le devis.`;
      }
      case "visitor_form_help":
        return renderFormHelp(input, request.language) ?? `Le champ "${describe(input.fieldLabel)}" sert au courtier partenaire pour préparer un devis ${product} adapté. Indiquez une valeur exacte ou approximative; elle pourra être précisée avec le courtier.`;
      case "visitor_guarantee_explainer":
        return renderGuaranteeExplainer(input, request.language);
      case "visitor_compare_explainer":
        return renderCompareExplainer(input, request.language);
      case "visitor_consistency_check": {
        const answers = entries(input, "answers");
        const empty = answers.filter(([, value]) => value === null || value === undefined || value === "").map(([key]) => key);
        return empty.length === 0
          ? `Aucune incohérence évidente détectée dans les ${answers.length} réponses fournies pour ${product}. Le courtier partenaire vérifiera les détails.`
          : `Points à vérifier avant envoi: ${empty.join(", ")} (non renseignés). Le courtier partenaire pourra compléter avec vous.`;
      }
      case "visitor_faq":
        return `Question: ${describe(input.question)}. AssurMatch est une plateforme technique de comparaison indicative et de mise en relation: elle ne vend pas d'assurance et ne donne pas de conseil personnalisé. Pour une réponse adaptée à votre situation, demandez un devis et un courtier partenaire agréé vous répondra.`;
      case "lead_summary":
        return `Résumé du lead (${product}, ${country}): statut ${describe(input.status)}, urgence ${describe(input.urgency)}, reçu le ${describe(input.assignedAt)}. Réponses clés: ${entries(input, "answers").slice(0, 8).map(([key, value]) => `${key}: ${describe(value)}`).join("; ") || "aucune"}. Éléments manquants: ${describe(input.missing)}.`;
      case "lead_score": {
        const answers = entries(input, "answers");
        const completeness = answers.length === 0 ? 0 : answers.filter(([, value]) => value !== "" && value !== null && value !== undefined).length / answers.length;
        const contactable = input.hasEmail === true || input.hasPhone === true;
        const score = Math.round(completeness * 60 + (contactable ? 30 : 0) + (input.urgency === "urgent" || input.urgency === "high" ? 10 : 0));
        return JSON.stringify({
          score,
          level: score >= 70 ? "high" : score >= 40 ? "medium" : "low",
          factors: [
            { key: "completeness", impact: completeness >= 0.6 ? "positive" : "negative", explanation: `Formulaire renseigné à ${Math.round(completeness * 100)}%` },
            { key: "contactability", impact: contactable ? "positive" : "negative", explanation: contactable ? "Coordonnées de contact présentes" : "Coordonnées incomplètes" },
            { key: "urgency", impact: input.urgency === "urgent" || input.urgency === "high" ? "positive" : "neutral", explanation: `Urgence déclarée: ${describe(input.urgency)}` }
          ]
        });
      }
      case "next_action":
        return `Suggestion (à valider par vous): ${input.status === "nouveau" || input.status === "accepte" ? "contacter le prospect pour confirmer le besoin" : input.status === "documents_demandes" ? "relancer pour obtenir les documents manquants" : "planifier la prochaine étape adaptée au statut " + describe(input.status)}. Motif: statut ${describe(input.status)}, dernière activité ${describe(input.lastActivityAt)}.`;
      case "relaunch_message":
        return `Bonjour, je suis votre courtier partenaire pour votre demande ${product}. Je reste disponible pour préciser ensemble votre besoin et vous proposer un devis adapté. À quel moment puis-je vous rappeler ? Bien cordialement.`;
      case "lead_classification":
        return JSON.stringify({ segment: describe(input.segment ?? "particulier"), productFamily: product, urgency: describe(input.urgency), confidence: "indicative" });
      case "duplicate_hint":
        return `Indice de doublon: ${describe(input.similarCount)} demande(s) similaire(s) sur la période (même produit, même pays). À vérifier manuellement avant toute contestation.`;
      case "loss_analysis":
        return `Analyse indicative des pertes: ${describe(input.lostCount)} lead(s) perdus, motifs principaux: ${describe(input.reasons)}. Piste: vérifier le délai de premier contact et la clarté des devis.`;
      case "admin_risk_triage":
        return `Triage indicatif: ${describe(input.alerts)} alerte(s) de conformité ouvertes, ${describe(input.expiringLicenses)} licence(s) proche(s) d'expiration, ${describe(input.expiredOffers)} offre(s) expirée(s) encore référencées. Priorité suggérée: licences puis offres. Validation humaine requise.`;
      case "activation_gap_summary":
        return `Écarts d'activation: ${describe(input.blocked)} section(s) bloquée(s), ${describe(input.warning)} avertissement(s). Principaux manques: ${describe(input.reasons)}.`;
      case "offer_consistency_check":
        return `Vérification indicative de l'offre "${describe(input.name)}": ${describe(input.issues)}. Ces points sont à confirmer par un admin avant publication.`;
      case "offer_summary":
        return `Résumé indicatif de l'offre "${describe(input.offerKey)}": garanties ${describe(input.guarantees)}; exclusions ${describe(input.exclusions)}; franchise ${describe(input.deductible)}; plafond ${describe(input.ceiling)}; délai de traitement ${describe(input.processingDelayDays)} jour(s); prix indicatif ${describe(input.indicativePrice)}; validité ${describe(input.validity)}. Offre indicative, conditions à confirmer par le courtier partenaire.`;
      case "activity_report":
        return `Rapport d'activité (${describe(input.window)}): ${describe(input.received)} demandes reçues, ${describe(input.transmitted)} transmises, ${describe(input.refused)} refusées, ${describe(input.nonRouted)} non routées. Partenaires actifs: ${describe(input.activePartners)}.`;
      case "suspicious_leads":
        return `Leads suspects (indicatif): ${describe(input.flaggedCount)} demande(s) présentant des signaux (doublons, coordonnées incohérentes, rafales). À revoir manuellement.`;
      case "routing_anomaly_analysis":
        return `Analyse indicative du routage: ${describe(input.totalAnomalies)} anomalie(s) détectée(s) dont ${describe(input.criticalCount)} critique(s). Piste: vérifier la capacité des courtiers et les quotas configures.`;
      case "performance_summary":
        return `Résumé indicatif de performance sur ${describe(input.windowDays)} jours : ${describe(input.received)} lead(s) reçu(s), ${describe(input.won)} gagné(s), ${describe(input.lost)} perdu(s), ${describe(input.open)} encore ouvert(s) dont ${describe(input.overdueOpen)} sans activité récente. Taux de conversion gagnés/reçus : ${input.conversionRate === null || input.conversionRate === undefined ? "non mesurable" : `${describe(input.conversionRate)} %`}. Délai moyen de première réponse visible : ${input.averageFirstReplyMinutes === null || input.averageFirstReplyMinutes === undefined ? "non mesuré" : `${describe(input.averageFirstReplyMinutes)} min`}. Point d'attention : les leads ouverts sans activité récente, à examiner par le responsable du cabinet.`;
      case "manager_assistant": {
        const advisors = Array.isArray(input.advisors) ? (input.advisors as Array<Record<string, unknown>>) : [];
        const byLoad = [...advisors].sort((left, right) => Number(right.openLeads ?? 0) - Number(left.openLeads ?? 0));
        const busiest = byLoad[0];
        const lightest = byLoad.at(-1);
        const balance = busiest && lightest && busiest !== lightest
          ? ` Charge la plus élevée : ${describe(busiest.label)} (${describe(busiest.openLeads)} lead(s) ouvert(s), ${describe(busiest.overdueOpen)} en retard) ; la plus faible : ${describe(lightest.label)} (${describe(lightest.openLeads)} lead(s) ouvert(s)). Piste à valider par le manager : examiner la répartition des nouveaux leads entre ces conseillers.`
          : "";
        return `Analyse indicative de la charge sur ${describe(input.windowDays)} jours : ${advisors.length} conseiller(s) avec des leads, ${describe(input.unassignedOpen)} lead(s) ouvert(s) non attribué(s).${balance} Le manager reste seul juge de toute affectation.`;
      }
      case "weekly_summary":
        return `Cette semaine : ${describe(input.received)} lead(s) reçu(s), ${describe(input.accepted)} accepté(s), ${describe(input.contactedCount)} contacté(s), ${describe(input.won)} gagné(s) et ${describe(input.lost)} perdu(s). ${describe(input.overdueTasks)} tâche(s) CRM en retard.`;
      default:
        return `Assistance indicative générée pour ${request.assistType}.`;
    }
  }
}
