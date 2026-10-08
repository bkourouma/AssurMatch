import type { ContentLocale, FaqItem } from "./types";

const fr: FaqItem[] = [
  {
    theme: "Le service",
    question: "AssurMatch vend-il de l'assurance ?",
    answer:
      "Non. AssurMatch est une plateforme technique de comparaison indicative et de mise en relation avec des courtiers partenaires autorisés. Elle ne vend pas d'assurance, n'émet aucun contrat ni attestation et ne collecte aucune prime."
  },
  {
    theme: "Le service",
    question: "AssurMatch me fait-il payer quelque chose ?",
    answer:
      "Non. Comparer des offres et demander un devis sont gratuits pour vous. Vous ne payez rien à AssurMatch : ce sont les courtiers partenaires qui paient un abonnement et les demandes qualifiées qu'ils reçoivent."
  },
  {
    theme: "Le service",
    question: "Le contenu généré par l'assistant de lecture remplace-t-il l'avis d'un professionnel ?",
    answer:
      "Non. Tout contenu généré automatiquement porte la mention « Réponse générée automatiquement par un outil d'IA. Aide à la lecture, pas un conseil. » Il aide à comprendre une offre ou un terme, sans donner de conseil personnalisé engageant. Le courtier partenaire autorisé reste seul responsable du devis et des conditions."
  },
  {
    theme: "Le service",
    question: "Que se passe-t-il si mon pays n'est pas encore disponible ?",
    answer:
      "Certains pays sont en phase pilote ou en liste d'attente. La page des pays indique leur statut ; vous pouvez être informé de l'ouverture publique d'un pays dès qu'elle a lieu."
  },
  {
    theme: "Les offres et le score",
    question: "Qui confirme le prix final ?",
    answer:
      "Le courtier partenaire responsable de votre pays et de votre produit. Chaque prix affiché sur AssurMatch est indicatif : il est confirmé, et ajusté si nécessaire, par ce courtier après étude de votre demande."
  },
  {
    theme: "Les offres et le score",
    question: "Pourquoi le prix final peut-il différer du prix indicatif ?",
    answer:
      "Parce que le prix affiché est calculé à partir des informations disponibles au moment de la comparaison, sans vérification individuelle du dossier. Le courtier partenaire peut ajuster ce prix après avoir vérifié votre situation exacte, votre historique ou des documents complémentaires."
  },
  {
    theme: "Les offres et le score",
    question: "Comment sont classées les offres affichées ?",
    answer:
      "Par défaut, selon un score indicatif décrit ci-dessous. Vous pouvez aussi trier par prix croissant, par niveau de garantie décroissant, par rapidité, par popularité ou par mise à jour récente."
  },
  {
    theme: "Les offres et le score",
    question: "Comment le score est-il calculé ?",
    answer:
      "Le score sur 100 affiché sur chaque offre tient compte du prix, du niveau de garantie, de la franchise, de la rapidité annoncée, de la souplesse de paiement, de la qualité de l'information fournie par le courtier et, lorsque vous l'avez indiquée, de votre préférence. Une offre sponsorisée suit le même calcul : le fait d'être sponsorisée ne modifie pas son score."
  },
  {
    theme: "Les offres et le score",
    question: "Qu'est-ce qu'une offre sponsorisée ?",
    answer:
      "Une offre dont le courtier partenaire a un partenariat commercial avec AssurMatch, signalée par un badge orange. Cela ne change ni son prix indicatif ni ses garanties, et elle ne peut jamais occuper la première position du classement du seul fait d'être sponsorisée."
  },
  {
    theme: "Les offres et le score",
    question: "Que veut dire « prix indicatif, à confirmer par le courtier partenaire » ?",
    answer:
      "Que le montant affiché est une estimation calculée à partir des informations disponibles au moment de la comparaison, sans valeur contractuelle. Le prix définitif est confirmé par le courtier partenaire après étude de votre demande."
  },
  {
    theme: "Ma demande et mes données",
    question: "Combien de temps pour être rappelé ?",
    answer:
      "Aucun délai n'est promis à ce jour : il dépend du courtier partenaire auquel votre demande est transmise. La page de suivi de votre demande indique son état ; un délai moyen observé sera affiché ici dès qu'il pourra être mesuré de façon fiable."
  },
  {
    theme: "Ma demande et mes données",
    question: "Mes données sont-elles transmises à un seul courtier ou à plusieurs ?",
    answer:
      "Par défaut, à un seul courtier partenaire responsable de votre pays et de votre produit. La demande peut être transmise à plusieurs courtiers uniquement si vous l'acceptez explicitement lors de la demande."
  },
  {
    theme: "Ma demande et mes données",
    question: "Puis-je demander un devis à plusieurs courtiers en même temps ?",
    answer:
      "Oui, si vous cochez la case prévue à cet effet à l'étape de vérification de votre demande. Sans cette case cochée, votre demande va à un seul courtier autorisé pour votre pays et votre produit."
  },
  {
    theme: "Ma demande et mes données",
    question: "Comment retirer mon consentement après une demande de devis ?",
    answer:
      "Depuis la page de suivi de votre demande, accessible par le lien reçu après l'envoi, une action permet de retirer votre consentement à tout moment. Sans ce lien, la page Contact permet d'en faire la demande."
  },
  {
    theme: "Ma demande et mes données",
    question: "Comment modifier ou supprimer mes données ?",
    answer:
      "Vous disposez d'un droit d'accès, de rectification et d'effacement de vos données. Pour une demande de devis déjà transmise, retirez votre consentement depuis la page de suivi liée à cette demande. Pour toute autre demande sur vos données, écrivez-nous via la page Contact."
  },
  {
    theme: "Les produits",
    question: "Quels produits d'assurance puis-je comparer sur AssurMatch ?",
    answer:
      "Les produits disponibles dépendent du pays choisi et sont activés progressivement. La page d'un pays affiche la liste des produits ouverts pour ce pays au moment où vous la consultez."
  },
  {
    theme: "Les produits",
    productKey: "auto",
    question: "Quels documents dois-je préparer pour une assurance auto ?",
    answer:
      "En général la carte grise du véhicule, le relevé d'information de l'assureur précédent si disponible, et le permis de conduire du conducteur principal. Le courtier partenaire précise les documents exacts nécessaires à votre dossier."
  },
  {
    theme: "Les produits",
    productKey: "voyage",
    question: "Une assurance voyage couvre-t-elle l'annulation du voyage ?",
    answer:
      "Selon l'offre, oui : l'annulation ou l'interruption de voyage fait partie des garanties courantes, aux côtés des frais médicaux et du rapatriement. Chaque offre indique précisément ses garanties et ses exclusions."
  }
];

const en: FaqItem[] = [
  {
    theme: "The service",
    question: "Does AssurMatch sell insurance?",
    answer:
      "No. AssurMatch is a technical platform for indicative comparison and introduction to authorised partner brokers. It does not sell insurance, does not issue a contract or a certificate, and does not collect a premium."
  },
  {
    theme: "The service",
    question: "Does AssurMatch charge me anything?",
    answer:
      "No. Comparing offers and requesting a quote are free for you. You pay nothing to AssurMatch: partner brokers pay a subscription and a fee for the qualified requests they receive."
  },
  {
    theme: "The service",
    question: "Does content generated by the reading assistant replace a professional's advice?",
    answer:
      "No. Any automatically generated content carries the label \"Reply generated automatically by an AI tool. Helps you read, not advice.\" It helps you understand an offer or a term, without giving binding personal advice. The authorised partner broker alone remains responsible for the quote and its conditions."
  },
  {
    theme: "The service",
    question: "What happens if my country is not available yet?",
    answer:
      "Some countries are in a pilot phase or on a waiting list. The countries page shows their status; you can be notified when a country opens publicly."
  },
  {
    theme: "Offers and the score",
    question: "Who confirms the final price?",
    answer:
      "The partner broker responsible for your country and product. Every price shown on AssurMatch is indicative: it is confirmed, and adjusted if needed, by that broker after reviewing your request."
  },
  {
    theme: "Offers and the score",
    question: "Why can the final price differ from the indicative price?",
    answer:
      "Because the price shown is computed from the information available at comparison time, without an individual review of the file. The partner broker can adjust this price after checking your exact situation, your history or additional documents."
  },
  {
    theme: "Offers and the score",
    question: "How are the offers shown ranked?",
    answer:
      "By default, by an indicative score described below. You can also sort by lowest price, by highest guarantee level, by speed, by popularity or by most recently updated."
  },
  {
    theme: "Offers and the score",
    question: "How is the score calculated?",
    answer:
      "The score out of 100 shown on each offer factors in price, guarantee level, deductible, announced speed, payment flexibility, the quality of the information provided by the broker and, when you stated it, your preference. A sponsored offer follows the same calculation: being sponsored does not change its score."
  },
  {
    theme: "Offers and the score",
    question: "What is a sponsored offer?",
    answer:
      "An offer whose partner broker has a commercial partnership with AssurMatch, marked with an orange badge. It changes neither its indicative price nor its guarantees, and it can never hold the first position of the ranking simply for being sponsored."
  },
  {
    theme: "Offers and the score",
    question: "What does \"indicative price, to be confirmed by the partner broker\" mean?",
    answer:
      "That the amount shown is an estimate computed from the information available at comparison time, with no contractual value. The final price is confirmed by the partner broker after reviewing your request."
  },
  {
    theme: "My request and my data",
    question: "How long before I am called back?",
    answer:
      "No delay is promised at this time: it depends on the partner broker your request is sent to. Your request's tracking page shows its status; an observed average delay will be shown here once it can be measured reliably."
  },
  {
    theme: "My request and my data",
    question: "Is my data sent to a single broker or to several?",
    answer:
      "By default, to a single partner broker responsible for your country and product. The request can be sent to several brokers only if you explicitly accept it when requesting."
  },
  {
    theme: "My request and my data",
    question: "Can I request a quote from several brokers at the same time?",
    answer:
      "Yes, if you tick the box provided for this at the review step of your request. Without that box ticked, your request goes to a single broker authorised for your country and product."
  },
  {
    theme: "My request and my data",
    question: "How do I withdraw my consent after a quote request?",
    answer:
      "From your request's tracking page, reachable through the link received after sending, an action lets you withdraw your consent at any time. Without that link, the Contact page lets you ask for it."
  },
  {
    theme: "My request and my data",
    question: "How do I change or delete my data?",
    answer:
      "You have a right of access, rectification and erasure of your data. For a quote request already sent, withdraw your consent from that request's tracking page. For any other request about your data, write to us via the Contact page."
  },
  {
    theme: "Products",
    question: "Which insurance products can I compare on AssurMatch?",
    answer:
      "The products available depend on the country chosen and are activated progressively. A country's page shows the list of products open for that country at the time you view it."
  },
  {
    theme: "Products",
    productKey: "auto",
    question: "What documents should I prepare for car insurance?",
    answer:
      "Usually the vehicle's registration document, the previous insurer's claims history statement if available, and the main driver's licence. The partner broker specifies the exact documents your file needs."
  },
  {
    theme: "Products",
    productKey: "voyage",
    question: "Does travel insurance cover trip cancellation?",
    answer:
      "Depending on the offer, yes: trip cancellation or interruption is a common guarantee, alongside medical costs and repatriation. Every offer states its guarantees and exclusions precisely."
  }
];

export function listFaq(locale: ContentLocale): FaqItem[] {
  return locale === "en" ? en : fr;
}
