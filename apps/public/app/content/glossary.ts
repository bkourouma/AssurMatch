import type { ContentLocale, GlossaryEntry } from "./types";

const fr: GlossaryEntry[] = [
  { term: "Assuré", definition: "La personne dont les biens, la santé ou la responsabilité sont couverts par un contrat d'assurance.", seeAlso: ["Assureur", "Souscripteur"] },
  { term: "Assureur", definition: "La société qui porte le risque et verse l'indemnisation en cas de sinistre couvert. Différent du courtier, qui met en relation.", seeAlso: ["Courtier", "Sinistre"] },
  { term: "Attestation d'assurance", definition: "Le document délivré par l'assureur ou le courtier qui prouve qu'un contrat est en cours. AssurMatch n'émet jamais d'attestation : seul le courtier partenaire le fait, après souscription.", seeAlso: ["Courtier", "Souscription"] },
  { term: "Avenant", definition: "Un document qui modifie un contrat d'assurance déjà en cours, par exemple pour ajouter une garantie ou changer une information.", seeAlso: ["Contrat d'assurance"] },
  { term: "Bénéficiaire", definition: "La personne qui reçoit l'indemnisation prévue par le contrat en cas de sinistre, lorsqu'elle est différente de l'assuré." },
  { term: "Bonus-malus", definition: "Un coefficient qui ajuste la prime selon l'historique de sinistres de l'assuré : il baisse sans sinistre responsable, il augmente après un sinistre responsable.", seeAlso: ["Prime", "Sinistre"] },
  { term: "Carence (délai de)", definition: "La période suivant la souscription pendant laquelle une garantie n'est pas encore active, même si le contrat est en cours." },
  { term: "Contrat d'assurance", definition: "L'accord entre l'assuré et l'assureur qui fixe les garanties, la prime et les conditions. AssurMatch ne fait pas partie du contrat : il est conclu entre le visiteur et le courtier partenaire ou l'assureur.", seeAlso: ["Assureur", "Courtier"] },
  { term: "Courtage", definition: "L'activité du courtier : représenter les intérêts du client, comparer des offres et l'accompagner jusqu'à la souscription.", seeAlso: ["Courtier"] },
  { term: "Courtier", definition: "Le professionnel autorisé qui confirme le devis, ajuste les conditions si besoin et accompagne la souscription. C'est le courtier partenaire, et non AssurMatch, qui est responsable du contrat proposé.", seeAlso: ["Assureur", "Devis"] },
  { term: "Délai de traitement", definition: "Le temps annoncé pour qu'un courtier partenaire étudie une demande de devis. Ce n'est pas un délai de remboursement en cas de sinistre." },
  { term: "Devis", definition: "Une proposition chiffrée transmise par un courtier partenaire après étude d'une demande. Un prix affiché sur AssurMatch avant ce devis reste indicatif.", seeAlso: ["Prix indicatif", "Courtier"] },
  { term: "Exclusion", definition: "Une situation ou un événement explicitement non couvert par une garantie, même si elle appartient à la même catégorie de risque.", seeAlso: ["Garantie"] },
  { term: "Franchise", definition: "La part d'un sinistre qui reste à la charge de l'assuré, avant que l'indemnisation de l'assureur ne s'applique.", seeAlso: ["Sinistre", "Indemnisation"] },
  { term: "Garantie", definition: "Un engagement de l'assureur à couvrir un risque précis (par exemple le vol, l'incendie ou les frais médicaux), en échange du paiement de la prime.", seeAlso: ["Exclusion", "Plafond de garantie"] },
  { term: "Indemnisation", definition: "La somme versée par l'assureur à l'assuré ou au bénéficiaire pour compenser un sinistre couvert, dans la limite du plafond de garantie et après déduction de la franchise.", seeAlso: ["Franchise", "Plafond de garantie"] },
  { term: "Lead qualifié", definition: "Une demande de devis qui remplit les critères techniques nécessaires (coordonnées valides, pays et produit actifs, consentement recueilli, demande non dupliquée, courtier assigné, informations minimales complètes) pour être facturée au courtier partenaire." },
  { term: "Offre indicative", definition: "Une offre affichée sur AssurMatch avant confirmation par le courtier partenaire : son prix, ses garanties et ses conditions peuvent encore être ajustés." },
  { term: "Plafond de garantie", definition: "Le montant maximal que l'assureur rembourse pour un sinistre couvert par une garantie donnée.", seeAlso: ["Garantie", "Indemnisation"] },
  { term: "Prime", definition: "Le montant payé par l'assuré à l'assureur, généralement chaque mois ou chaque année, en échange des garanties du contrat.", seeAlso: ["Surprime"] },
  { term: "Prise d'effet", definition: "La date à partir de laquelle les garanties d'un contrat s'appliquent réellement." },
  { term: "Prix indicatif", definition: "Un prix estimé à partir des informations disponibles au moment de la comparaison, sans valeur contractuelle. Il est systématiquement confirmé par le courtier partenaire.", seeAlso: ["Devis"] },
  { term: "Renouvellement", definition: "La reconduction d'un contrat d'assurance à l'échéance, avec ou sans changement des conditions." },
  { term: "Résiliation", definition: "La fin, anticipée ou à échéance, d'un contrat d'assurance, à l'initiative de l'assuré ou de l'assureur selon les conditions prévues." },
  { term: "Responsabilité civile", definition: "La garantie, souvent obligatoire, qui couvre les dommages causés par l'assuré à un tiers." },
  { term: "Score indicatif", definition: "Une note calculée à partir de plusieurs critères (prix, niveau de garantie, franchise, délai de traitement) pour aider à comparer des offres. Une offre sponsorisée ne peut jamais occuper la première position d'un classement basé sur ce score." },
  { term: "Sinistre", definition: "Un événement couvert par une garantie (accident, vol, incendie...) qui déclenche une demande d'indemnisation auprès de l'assureur.", seeAlso: ["Indemnisation", "Franchise"] },
  { term: "Souscription", definition: "L'acte par lequel l'assuré accepte définitivement un contrat d'assurance auprès d'un courtier ou d'un assureur. AssurMatch n'intervient jamais dans la souscription elle-même.", seeAlso: ["Courtier", "Contrat d'assurance"] },
  { term: "Souscripteur", definition: "La personne qui signe le contrat d'assurance et s'engage à payer la prime ; elle est souvent, mais pas toujours, la même personne que l'assuré." },
  { term: "Surprime", definition: "Un supplément ajouté à la prime de base, généralement lié à un risque aggravé (par exemple un historique de sinistres).", seeAlso: ["Prime", "Bonus-malus"] },
  { term: "Tiers", definition: "Toute personne autre que l'assuré et l'assureur, par exemple une victime d'un accident causé par l'assuré." }
];

const en: GlossaryEntry[] = [
  { term: "Insured party", definition: "The person whose property, health or liability is covered by an insurance contract.", seeAlso: ["Insurer", "Policyholder"] },
  { term: "Insurer", definition: "The company that carries the risk and pays the compensation for a covered claim. Different from the broker, who introduces the parties.", seeAlso: ["Broker", "Claim"] },
  { term: "Insurance certificate", definition: "The document issued by the insurer or broker that proves a contract is in force. AssurMatch never issues a certificate: only the partner broker does, after subscription.", seeAlso: ["Broker", "Subscription"] },
  { term: "Endorsement", definition: "A document that amends an insurance contract already in force, for example to add a guarantee or change a piece of information.", seeAlso: ["Insurance contract"] },
  { term: "Beneficiary", definition: "The person who receives the compensation provided by the contract in the event of a claim, when different from the insured party." },
  { term: "No-claims bonus/malus", definition: "A factor that adjusts the premium based on the insured party's claims history: it goes down without an at-fault claim, and up after one.", seeAlso: ["Premium", "Claim"] },
  { term: "Waiting period", definition: "The period after subscribing during which a guarantee is not yet active, even though the contract is already in force." },
  { term: "Insurance contract", definition: "The agreement between the insured party and the insurer that sets the guarantees, the premium and the conditions. AssurMatch is not a party to the contract: it is concluded between the visitor and the partner broker or insurer.", seeAlso: ["Insurer", "Broker"] },
  { term: "Brokerage", definition: "The broker's activity: representing the client's interests, comparing offers and supporting them through to subscription.", seeAlso: ["Broker"] },
  { term: "Broker", definition: "The authorised professional who confirms the quote, adjusts the conditions if needed, and supports the subscription. It is the partner broker, not AssurMatch, who is responsible for the proposed contract.", seeAlso: ["Insurer", "Quote"] },
  { term: "Processing time", definition: "The time announced for a partner broker to review a quote request. It is not a claim reimbursement time." },
  { term: "Quote", definition: "A priced proposal transmitted by a partner broker after reviewing a request. A price shown on AssurMatch before that quote remains indicative.", seeAlso: ["Indicative price", "Broker"] },
  { term: "Exclusion", definition: "A situation or event explicitly not covered by a guarantee, even when it belongs to the same risk category.", seeAlso: ["Guarantee"] },
  { term: "Deductible", definition: "The part of a claim left to the insured party, before the insurer's compensation applies.", seeAlso: ["Claim", "Compensation"] },
  { term: "Guarantee", definition: "A commitment by the insurer to cover a specific risk (for example theft, fire or medical costs), in exchange for the premium.", seeAlso: ["Exclusion", "Coverage cap"] },
  { term: "Compensation", definition: "The amount paid by the insurer to the insured party or beneficiary to offset a covered claim, within the coverage cap and after the deductible.", seeAlso: ["Deductible", "Coverage cap"] },
  { term: "Qualified lead", definition: "A quote request that meets the necessary technical criteria (valid contact details, active country and product, consent collected, not a duplicate, broker assigned, minimum information complete) to be billed to the partner broker." },
  { term: "Indicative offer", definition: "An offer shown on AssurMatch before confirmation by the partner broker: its price, guarantees and conditions can still be adjusted." },
  { term: "Coverage cap", definition: "The maximum amount the insurer reimburses for a claim covered by a given guarantee.", seeAlso: ["Guarantee", "Compensation"] },
  { term: "Premium", definition: "The amount paid by the insured party to the insurer, usually monthly or yearly, in exchange for the contract's guarantees.", seeAlso: ["Surcharge"] },
  { term: "Effective date", definition: "The date from which a contract's guarantees actually apply." },
  { term: "Indicative price", definition: "A price estimated from the information available at comparison time, with no contractual value. It is always confirmed by the partner broker.", seeAlso: ["Quote"] },
  { term: "Renewal", definition: "The continuation of an insurance contract at its due date, with or without a change in conditions." },
  { term: "Cancellation", definition: "The end, early or at term, of an insurance contract, at the initiative of the insured party or the insurer, under the agreed conditions." },
  { term: "Third-party liability", definition: "The guarantee, often mandatory, that covers damage caused by the insured party to a third party." },
  { term: "Indicative score", definition: "A rating computed from several criteria (price, guarantee level, deductible, processing time) to help compare offers. A sponsored offer can never hold the first position of a ranking based on this score." },
  { term: "Claim", definition: "An event covered by a guarantee (accident, theft, fire...) that triggers a compensation request to the insurer.", seeAlso: ["Compensation", "Deductible"] },
  { term: "Subscription", definition: "The act by which the insured party finally accepts an insurance contract with a broker or insurer. AssurMatch is never involved in the subscription itself.", seeAlso: ["Broker", "Insurance contract"] },
  { term: "Policyholder", definition: "The person who signs the insurance contract and commits to paying the premium; often, but not always, the same person as the insured party." },
  { term: "Surcharge", definition: "An addition to the base premium, usually linked to an aggravated risk (for example a claims history).", seeAlso: ["Premium", "No-claims bonus/malus"] },
  { term: "Third party", definition: "Anyone other than the insured party and the insurer, for example a victim of an accident caused by the insured party." }
];

function sorted(entries: GlossaryEntry[]): GlossaryEntry[] {
  return [...entries].sort((a, b) => a.term.localeCompare(b.term, "fr", { sensitivity: "base" }));
}

export function listGlossary(locale: ContentLocale): GlossaryEntry[] {
  return sorted(locale === "en" ? en : fr);
}
