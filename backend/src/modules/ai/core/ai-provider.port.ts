import type { AiAssistTypeCatalog } from "../../../../../packages/shared/contracts/ai.contracts";

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
  if (value === null || value === undefined || value === "") return "non renseigne";
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
        return `Selon les informations fournies (${describe(input.need)}), un produit d'assurance de type ${product === "non renseigne" ? "a determiner avec le courtier partenaire" : product} pourrait correspondre a votre besoin en ${country}. Comparez les offres indicatives puis demandez un devis: le courtier partenaire confirmera les garanties adaptees.`;
      case "visitor_request_summary": {
        const answers = entries(input, "answers");
        const provided = answers.filter(([, value]) => value !== null && value !== undefined && value !== "");
        const missing = answers.filter(([, value]) => value === null || value === undefined || value === "").map(([key]) => key);
        return `Resume de votre besoin (${product}, ${country}): ${provided.length > 0 ? provided.map(([key, value]) => `${key}: ${describe(value)}`).join("; ") : "aucun element detaille"}.${missing.length > 0 ? ` Elements a completer: ${missing.join(", ")}.` : ""} Cette demande sera transmise a un courtier partenaire eligible qui confirmera le devis.`;
      }
      case "visitor_form_help":
        return `Le champ "${describe(input.fieldLabel)}" sert au courtier partenaire pour preparer un devis ${product} adapte. Indiquez une valeur exacte ou approximative; elle pourra etre precisee avec le courtier.`;
      case "visitor_consistency_check": {
        const answers = entries(input, "answers");
        const empty = answers.filter(([, value]) => value === null || value === undefined || value === "").map(([key]) => key);
        return empty.length === 0
          ? `Aucune incoherence evidente detectee dans les ${answers.length} reponses fournies pour ${product}. Le courtier partenaire verifiera les details.`
          : `Points a verifier avant envoi: ${empty.join(", ")} (non renseignes). Le courtier partenaire pourra completer avec vous.`;
      }
      case "visitor_faq":
        return `Question: ${describe(input.question)}. AssurMatch est une plateforme technique de comparaison indicative et de mise en relation: elle ne vend pas d'assurance et ne donne pas de conseil personnalise. Pour une reponse adaptee a votre situation, demandez un devis et un courtier partenaire agree vous repondra.`;
      case "lead_summary":
        return `Resume du lead (${product}, ${country}): statut ${describe(input.status)}, urgence ${describe(input.urgency)}, recu le ${describe(input.assignedAt)}. Reponses cles: ${entries(input, "answers").slice(0, 8).map(([key, value]) => `${key}: ${describe(value)}`).join("; ") || "aucune"}. Elements manquants: ${describe(input.missing)}.`;
      case "lead_score": {
        const answers = entries(input, "answers");
        const completeness = answers.length === 0 ? 0 : answers.filter(([, value]) => value !== "" && value !== null && value !== undefined).length / answers.length;
        const contactable = input.hasEmail === true || input.hasPhone === true;
        const score = Math.round(completeness * 60 + (contactable ? 30 : 0) + (input.urgency === "urgent" || input.urgency === "high" ? 10 : 0));
        return JSON.stringify({
          score,
          level: score >= 70 ? "high" : score >= 40 ? "medium" : "low",
          factors: [
            { key: "completeness", impact: completeness >= 0.6 ? "positive" : "negative", explanation: `Formulaire renseigne a ${Math.round(completeness * 100)}%` },
            { key: "contactability", impact: contactable ? "positive" : "negative", explanation: contactable ? "Coordonnees de contact presentes" : "Coordonnees incompletes" },
            { key: "urgency", impact: input.urgency === "urgent" || input.urgency === "high" ? "positive" : "neutral", explanation: `Urgence declaree: ${describe(input.urgency)}` }
          ]
        });
      }
      case "next_action":
        return `Suggestion (a valider par vous): ${input.status === "nouveau" || input.status === "accepte" ? "contacter le prospect pour confirmer le besoin" : input.status === "documents_demandes" ? "relancer pour obtenir les documents manquants" : "planifier la prochaine etape adaptee au statut " + describe(input.status)}. Motif: statut ${describe(input.status)}, derniere activite ${describe(input.lastActivityAt)}.`;
      case "relaunch_message":
        return `Bonjour, je suis votre courtier partenaire pour votre demande ${product}. Je reste disponible pour preciser ensemble votre besoin et vous proposer un devis adapte. A quel moment puis-je vous rappeler ? Bien cordialement.`;
      case "lead_classification":
        return JSON.stringify({ segment: describe(input.segment ?? "particulier"), productFamily: product, urgency: describe(input.urgency), confidence: "indicative" });
      case "duplicate_hint":
        return `Indice de doublon: ${describe(input.similarCount)} demande(s) similaire(s) sur la periode (meme produit, meme pays). A verifier manuellement avant toute contestation.`;
      case "loss_analysis":
        return `Analyse indicative des pertes: ${describe(input.lostCount)} lead(s) perdus, motifs principaux: ${describe(input.reasons)}. Piste: verifier le delai de premier contact et la clarte des devis.`;
      case "admin_risk_triage":
        return `Triage indicatif: ${describe(input.alerts)} alerte(s) de conformite ouvertes, ${describe(input.expiringLicenses)} licence(s) proche(s) d'expiration, ${describe(input.expiredOffers)} offre(s) expiree(s) encore referencees. Priorite suggeree: licences puis offres. Validation humaine requise.`;
      case "activation_gap_summary":
        return `Ecarts d'activation: ${describe(input.blocked)} section(s) bloquee(s), ${describe(input.warning)} avertissement(s). Principaux manques: ${describe(input.reasons)}.`;
      case "offer_consistency_check":
        return `Verification indicative de l'offre "${describe(input.name)}": ${describe(input.issues)}. Ces points sont a confirmer par un admin avant publication.`;
      case "activity_report":
        return `Rapport d'activite (${describe(input.window)}): ${describe(input.received)} demandes recues, ${describe(input.transmitted)} transmises, ${describe(input.refused)} refusees, ${describe(input.nonRouted)} non routees. Partenaires actifs: ${describe(input.activePartners)}.`;
      case "suspicious_leads":
        return `Leads suspects (indicatif): ${describe(input.flaggedCount)} demande(s) presentant des signaux (doublons, coordonnees incoherentes, rafales). A revoir manuellement.`;
      default:
        return `Assistance indicative generee pour ${request.assistType}.`;
    }
  }
}
