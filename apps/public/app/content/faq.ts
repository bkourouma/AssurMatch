import type { ContentLocale, FaqItem } from "./types";

const fr: FaqItem[] = [
  {
    question: "AssurMatch vend-il de l'assurance ?",
    answer:
      "Non. AssurMatch est une plateforme technique de comparaison indicative et de mise en relation avec des courtiers partenaires autorisés. AssurMatch ne vend pas d'assurance, n'émet aucun contrat ni attestation et ne collecte aucune prime."
  },
  {
    question: "Qui confirme le prix final ?",
    answer:
      "Le courtier partenaire responsable de votre pays et de votre produit. Chaque prix affiché sur AssurMatch est indicatif : il est confirmé, et ajusté si nécessaire, par ce courtier après étude de votre demande."
  },
  {
    question: "AssurMatch me fait-il payer quelque chose ?",
    answer:
      "Non, jamais. Comparer des offres et demander un devis sont gratuits pour le visiteur. AssurMatch est rémunéré par les courtiers partenaires (frais de mise en service, abonnement et frais par demande qualifiée), jamais par le visiteur."
  },
  {
    question: "Comment sont classées les offres affichées ?",
    answer:
      "Par défaut, les offres sont triées selon un score indicatif qui tient compte du prix, du niveau de garantie, de la franchise et du délai de traitement annoncé. Une offre sponsorisée ne peut jamais occuper la première position de ce classement."
  },
  {
    question: "Qu'est-ce qu'une offre sponsorisée ?",
    answer:
      "Une offre pour laquelle un courtier partenaire a un partenariat commercial avec AssurMatch, signalée par un badge orange. Cela ne change ni son prix indicatif ni ses garanties, et elle ne peut jamais apparaître en première position."
  },
  {
    question: "Mes données sont-elles transmises à un seul courtier ou à plusieurs ?",
    answer:
      "Par défaut, à un seul courtier partenaire responsable de votre pays et de votre produit. La demande de devis peut être transmise à plusieurs courtiers uniquement si vous l'acceptez explicitement lors de la demande."
  },
  {
    question: "Comment retirer mon consentement après une demande de devis ?",
    answer:
      "Depuis la page de suivi de votre demande, accessible par le lien reçu après l'envoi, une action permet de retirer votre consentement à tout moment. Sans ce lien, la page Contact permet d'en faire la demande."
  },
  {
    question: "Que veut dire « prix indicatif, à confirmer par le courtier partenaire » ?",
    answer:
      "Que le montant affiché est une estimation calculée à partir des informations disponibles au moment de la comparaison, sans valeur contractuelle. Le prix définitif est confirmé par le courtier partenaire après étude de votre demande."
  },
  {
    question: "Quels documents dois-je préparer pour une assurance auto ?",
    productKey: "auto",
    answer:
      "En général la carte grise du véhicule, le relevé d'information de l'assureur précédent si disponible, et le permis de conduire du conducteur principal. Le courtier partenaire précise les documents exacts nécessaires à votre dossier."
  },
  {
    question: "Une assurance voyage couvre-t-elle l'annulation du voyage ?",
    productKey: "voyage",
    answer:
      "Selon l'offre, oui : l'annulation ou l'interruption de voyage fait partie des garanties courantes, aux côtés des frais médicaux et du rapatriement. Chaque offre indique précisément ses garanties et ses exclusions."
  },
  {
    question: "Un contenu généré par IA sur AssurMatch remplace-t-il l'avis d'un professionnel ?",
    answer:
      "Non. Tout contenu généré par IA est signalé comme tel et reste une aide indicative à la compréhension, sans conseil personnalisé engageant. Le courtier partenaire autorisé reste seul responsable du devis et des conditions."
  },
  {
    question: "Que se passe-t-il si mon pays n'est pas encore disponible ?",
    answer:
      "Certains pays sont en phase pilote ou en liste d'attente. La page des pays indique leur statut ; il est possible d'être informé de l'ouverture publique d'un pays dès qu'elle a lieu."
  }
];

const en: FaqItem[] = [
  {
    question: "Does AssurMatch sell insurance?",
    answer:
      "No. AssurMatch is a technical platform for indicative comparison and introduction to authorised partner brokers. AssurMatch does not sell insurance, does not issue a contract or a certificate, and does not collect a premium."
  },
  {
    question: "Who confirms the final price?",
    answer:
      "The partner broker responsible for your country and product. Every price shown on AssurMatch is indicative: it is confirmed, and adjusted if needed, by that broker after reviewing your request."
  },
  {
    question: "Does AssurMatch charge me anything?",
    answer:
      "No, never. Comparing offers and requesting a quote are free for the visitor. AssurMatch is paid by partner brokers (a setup fee, a subscription and a fee per qualified lead), never by the visitor."
  },
  {
    question: "How are the offers shown ranked?",
    answer:
      "By default, offers are sorted by an indicative score that factors in price, guarantee level, deductible and the announced processing time. A sponsored offer can never hold the first position of that ranking."
  },
  {
    question: "What is a sponsored offer?",
    answer:
      "An offer whose partner broker has a commercial partnership with AssurMatch, marked with an orange badge. It changes neither its indicative price nor its guarantees, and it can never appear in the first position."
  },
  {
    question: "Is my data sent to a single broker or to several?",
    answer:
      "By default, to a single partner broker responsible for your country and product. A quote request can be sent to several brokers only if you explicitly accept it when requesting."
  },
  {
    question: "How do I withdraw my consent after a quote request?",
    answer:
      "From your request's tracking page, reachable through the link received after sending, an action lets you withdraw your consent at any time. Without that link, the Contact page lets you ask for it."
  },
  {
    question: "What does \"indicative price, to be confirmed by the partner broker\" mean?",
    answer:
      "That the amount shown is an estimate computed from the information available at comparison time, with no contractual value. The final price is confirmed by the partner broker after reviewing your request."
  },
  {
    question: "What documents should I prepare for car insurance?",
    productKey: "auto",
    answer:
      "Usually the vehicle's registration document, the previous insurer's claims history statement if available, and the main driver's licence. The partner broker specifies the exact documents your file needs."
  },
  {
    question: "Does travel insurance cover trip cancellation?",
    productKey: "voyage",
    answer:
      "Depending on the offer, yes: trip cancellation or interruption is a common guarantee, alongside medical costs and repatriation. Every offer states its guarantees and exclusions precisely."
  },
  {
    question: "Does AI-generated content on AssurMatch replace a professional's advice?",
    answer:
      "No. Any AI-generated content is labelled as such and remains indicative help understanding, never a binding personal recommendation. The authorised partner broker alone remains responsible for the quote and its conditions."
  },
  {
    question: "What happens if my country is not available yet?",
    answer:
      "Some countries are in a pilot phase or on a waiting list. The countries page shows their status; it is possible to be notified when a country opens publicly."
  }
];

export function listFaq(locale: ContentLocale): FaqItem[] {
  return locale === "en" ? en : fr;
}
