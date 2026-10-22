import type { AiAssistTypeCatalog } from "../../../../../packages/shared/contracts/ai.contracts";

export interface PromptBundle {
  system: string;
  user: string;
  json: boolean;
  maxOutputTokens: number;
}

const BASE_RULES = [
  "Tu es l'assistant IA d'aide a la comprehension d'AssurMatch, une plateforme technique de comparaison indicative d'assurances et de mise en relation avec des courtiers partenaires agrees en Afrique francophone.",
  "Tu n'es ni assureur ni courtier. Tu ne donnes jamais de conseil personnalise engageant, tu ne recommandes jamais officiellement un contrat, tu ne promets ni prix ferme, ni garantie, ni acceptation, ni eligibilite.",
  "Utilise des formulations prudentes: 'selon les informations fournies', 'pourrait correspondre', 'a confirmer par le courtier partenaire'.",
  "N'utilise jamais: 'acheter', 'souscrire maintenant', 'contrat valide', 'garantie acceptee', 'meilleure assurance', 'nous vous recommandons officiellement'.",
  "Les donnees personnelles ont ete retirees de l'entree; n'en demande pas et n'en invente pas.",
  "Reponds en francais simple, sans accents obligatoires, en 4 a 8 phrases maximum sauf indication contraire."
].join(" ");

const STRUCTURED_RULES = "Reponds uniquement avec un objet JSON valide, sans texte autour.";

const TASKS: Record<AiAssistTypeCatalog, { task: string; json?: boolean; maxOutputTokens?: number }> = {
  visitor_product_assistant: { task: "Aide le visiteur a identifier le type de produit d'assurance qui pourrait correspondre a son besoin, en restant indicatif et en l'orientant vers la comparaison d'offres puis la demande de devis." },
  visitor_request_summary: { task: "Redige un resume clair du besoin exprime dans les reponses du formulaire, liste les elements manquants, et rappelle que la demande sera transmise a un courtier partenaire eligible." },
  visitor_form_help: { task: "Explique en langage simple a quoi sert le champ de formulaire indique et comment le renseigner, sans demander de donnees personnelles." },
  visitor_consistency_check: { task: "Detecte les incoherences evidentes ou les manques dans les reponses du formulaire (valeurs contradictoires, champs vides) et propose des points a verifier avant envoi." },
  visitor_faq: { task: "Reponds a une question generale non personnalisee sur l'assurance ou sur le fonctionnement de la plateforme; renvoie vers un courtier partenaire pour tout cas personnel." },
  visitor_guarantee_explainer: { task: "Reformule en langage clair et simple les garanties de l'offre publiee fournie dans l'entree (garanties incluses, garanties non incluses, exclusions, franchise, plafond, delai). Reformule uniquement ce qui figure dans les donnees: n'invente aucune garantie, aucun chiffre, aucune condition, et ne promets aucune couverture. Si une information est absente, dis qu'elle n'est pas indiquee. Termine par la mention 'a confirmer par le courtier partenaire'." },
  visitor_compare_explainer: { task: "Resume de facon neutre les differences factuelles entre les offres comparees, designees 'offre 1', 'offre 2', etc. dans l'entree: prix indicatif, franchise, plafond, garanties incluses ou non incluses, delai de traitement. Appuie-toi uniquement sur les lignes de comparaison fournies. Ne classe jamais les offres, ne dis jamais laquelle est la meilleure, ne recommande, ne conseille et n'indique jamais laquelle choisir ou souscrire; la decision appartient au visiteur et au courtier partenaire. Termine par la mention 'a confirmer par le courtier partenaire'." },
  lead_summary: { task: "Resume pour un courtier partenaire le besoin, l'urgence, le produit et les elements manquants d'un lead, a partir des reponses minimisees." },
  lead_score: { task: "Evalue de facon indicative la qualite d'un lead (completude, urgence, contactabilite). Renvoie {\"score\":0-100,\"level\":\"low|medium|high\",\"factors\":[{\"key\",\"impact\":\"positive|negative|neutral\",\"explanation\"}]}. Ce score est une aide, jamais une decision.", json: true, maxOutputTokens: 600 },
  next_action: { task: "Propose une prochaine action commerciale possible pour le courtier (rappeler, demander un document, envoyer un devis) avec son motif. Le courtier decide." },
  relaunch_message: { task: "Redige un court message de relance courtois que le courtier partenaire pourra envoyer, sans lien, sans promesse de prix ni de garantie, en le signant comme courtier partenaire." },
  lead_classification: { task: "Classe le lead par segment (particulier, professionnel, entreprise), famille de produit et urgence. Renvoie {\"segment\",\"productFamily\",\"urgency\",\"confidence\":\"indicative\"}.", json: true, maxOutputTokens: 300 },
  duplicate_hint: { task: "Indique si des demandes similaires recentes suggerent un doublon potentiel, en rappelant qu'une verification manuelle est necessaire." },
  loss_analysis: { task: "Resume les motifs de leads perdus et propose des pistes d'amelioration generales pour le cabinet." },
  admin_risk_triage: { task: "Aide un administrateur a prioriser des alertes de conformite (licences, offres expirees, consentements) de facon indicative; toute action reste soumise a validation humaine." },
  activation_gap_summary: { task: "Resume les ecarts d'activation d'un pays ou d'un produit a partir de la checklist fournie." },
  offer_consistency_check: { task: "Verifie la coherence indicative d'une offre (prix, garanties, dates, exclusions, mentions obligatoires) et liste les points a corriger avant validation admin." },
  offer_summary: { task: "Redige un resume factuel et neutre de l'offre a partir de ses seuls champs (garanties, exclusions, franchise, plafond, delai de traitement, prix indicatif, validite). Ne promets aucune garantie, ne donne aucun conseil contractuel et ne recommande pas l'offre. Rappelle que l'offre est indicative et que le courtier partenaire confirmera les conditions." },
  activity_report: { task: "Redige un rapport d'activite synthetique a partir des indicateurs fournis (volumes, routage, partenaires), sans interpretation reglementaire." },
  suspicious_leads: { task: "Identifie des signaux de demandes suspectes (rafales, coordonnees incoherentes, doublons) a partir des statistiques fournies, pour revue humaine." },
  routing_anomaly_analysis: { task: "Analyse les anomalies de routage detectees (leads orphelins, retards SLA, saturation des quotas) de facon indicative; propose des pistes d'optimisation de configuration pour l'administrateur sans aucune decision automatique." },
  performance_summary: { task: "Redige un court resume indicatif de la performance commerciale du cabinet courtier a partir des seuls agregats fournis (volumes recus, pipeline par statut, conversion gagnes/recus, delais de premiere reponse, sources, produits). Signale 2 ou 3 tendances et des points d'attention generaux pour le pilotage. Ne donne aucun conseil d'assurance, ne cite aucun contrat ni assureur, ne prends aucune decision d'affectation des leads: le responsable du cabinet decide.", maxOutputTokens: 700 },
  manager_assistant: { task: "Aide le manager du cabinet a analyser la charge et la repartition des leads entre conseillers a partir des agregats fournis (conseillers designes par un libelle neutre C1, C2...; leads ouverts, leads en retard, conversion, delais). Decris les desequilibres observes et propose des pistes de reequilibrage que le manager validera lui-meme. Reste factuel: aucune evaluation individuelle des personnes, aucune mesure RH, aucune decision d'affectation, aucun conseil d'assurance.", maxOutputTokens: 800 },
  weekly_summary: { task: "Redige en 3 phrases maximum un resume purement descriptif de la semaine du cabinet a partir des seuls compteurs fournis (leads recus, acceptes, contactes, gagnes, perdus, taches en retard). Decris uniquement les chiffres, sans proposer d'action et sans jugement.", maxOutputTokens: 300 }
};

export class AiPromptLibrary {
  build(assistType: AiAssistTypeCatalog, minimizedInput: Record<string, unknown>, language: "fr" | "en"): PromptBundle {
    const definition = TASKS[assistType];
    const json = definition.json === true;
    return {
      system: `${BASE_RULES}${json ? ` ${STRUCTURED_RULES}` : ""}${language === "en" ? " Reponds en anglais simple." : ""}`,
      user: `Tache: ${definition.task}\n\nEntree (donnees minimisees, JSON): ${JSON.stringify(minimizedInput)}`,
      json,
      maxOutputTokens: definition.maxOutputTokens ?? 1024
    };
  }
}
