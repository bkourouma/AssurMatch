import type { CountryLegalOverride } from "../shared-types";

/**
 * Example per-country override: Côte d'Ivoire (ISO "CI"). It replaces the "activité" section of the
 * legal notice with a country-scoped sentence and sharpens the "autorité de contrôle" section of the
 * privacy policy, without inventing a supervisory authority name the repository does not hold.
 *
 * `getLegalPage` in `app/content/legal/index.ts` merges this on top of the global page, section by
 * section, matching on `ContentSection.id`.
 */
export const ciLegalOverride: CountryLegalOverride = {
  "legal-notice": {
    fr: {
      sections: [
        {
          id: "activite",
          heading: "Nature de l'activité en Côte d'Ivoire",
          body: [
            "En Côte d'Ivoire, AssurMatch met en relation les visiteurs avec les courtiers partenaires autorisés référencés pour ce pays.",
            "AssurMatch ne vend pas d'assurance, n'émet aucun contrat ni attestation, ne collecte aucune prime et ne délivre aucun conseil personnalisé engageant. Le courtier partenaire responsable confirme le devis et les conditions applicables."
          ]
        }
      ]
    },
    en: {
      sections: [
        {
          id: "activite",
          heading: "Nature of the activity in Côte d'Ivoire",
          body: [
            "In Côte d'Ivoire, AssurMatch introduces visitors to the authorised partner brokers referenced for this country.",
            "AssurMatch does not sell insurance, does not issue a contract or a certificate, does not collect a premium and does not give binding personal advice. The responsible partner broker confirms the quote and the applicable conditions."
          ]
        }
      ]
    }
  },
  privacy: {
    fr: {
      sections: [
        {
          id: "autorite-controle",
          heading: "Autorité de contrôle compétente en Côte d'Ivoire",
          body: [
            "Le visiteur résidant en Côte d'Ivoire dispose du droit d'introduire une réclamation auprès de l'autorité ivoirienne de protection des données personnelles compétente. Le nom exact et les coordonnées de cette autorité sont listés dans la section « À compléter avant mise en ligne »."
          ]
        }
      ]
    },
    en: {
      sections: [
        {
          id: "autorite-controle",
          heading: "Supervisory authority competent for Côte d'Ivoire",
          body: [
            "A visitor residing in Côte d'Ivoire may lodge a complaint with the competent Ivorian personal data protection authority. Its exact name and contact details are listed in the \"To be completed before launch\" section."
          ]
        }
      ]
    }
  }
};
