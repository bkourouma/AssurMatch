import type { ContentLocale, GlossaryEntry } from "./types";

const fr: GlossaryEntry[] = [
  {
    term: "Assistance",
    definition:
      "Un service d'aide en cas de panne, d'accident ou d'urgence pendant le trajet ou le séjour couvert (dépannage, remorquage, avance de frais). Exemple : une assistance voyage peut organiser une consultation médicale sur place.",
    seeAlso: ["Rapatriement"]
  },
  {
    term: "Assuré",
    definition:
      "La personne dont les biens, la santé ou la responsabilité sont couverts par un contrat d'assurance. Exemple : le conducteur principal d'un véhicule est l'assuré du contrat auto.",
    seeAlso: ["Assureur", "Souscripteur"]
  },
  {
    term: "Assureur",
    definition:
      "La société qui porte le risque et verse l'indemnisation en cas de sinistre couvert. À distinguer du courtier, qui met en relation sans porter le risque lui-même.",
    seeAlso: ["Courtier", "Sinistre"]
  },
  {
    term: "Attestation d'assurance",
    definition:
      "Le document délivré par l'assureur ou le courtier qui prouve qu'un contrat est en cours. AssurMatch n'émet jamais d'attestation : seul le courtier partenaire le fait, après souscription. Exemple : l'attestation d'assurance auto se présente en cas de contrôle routier.",
    seeAlso: ["Courtier", "Souscription"]
  },
  {
    term: "Avenant",
    definition:
      "Un document qui modifie un contrat d'assurance déjà en cours, par exemple pour ajouter une garantie ou changer une information. Exemple : un changement de véhicule donne lieu à un avenant, pas à un nouveau contrat.",
    seeAlso: ["Contrat d'assurance"]
  },
  {
    term: "Bénéficiaire",
    definition: "La personne qui reçoit l'indemnisation prévue par le contrat en cas de sinistre, lorsqu'elle est différente de l'assuré."
  },
  {
    term: "Bonus-malus",
    definition:
      "Un coefficient qui ajuste la prime selon l'historique de sinistres de l'assuré : il baisse sans sinistre responsable, il augmente après un sinistre responsable. Exemple : un conducteur sans sinistre responsable depuis plusieurs années paie en général une prime réduite.",
    seeAlso: ["Prime", "Sinistre"]
  },
  {
    term: "Carence (délai de)",
    definition:
      "La période suivant la souscription pendant laquelle une garantie n'est pas encore active, même si le contrat est en cours. Sa durée exacte dépend du contrat et du type de garantie."
  },
  {
    term: "Carte brune CEDEAO",
    definition:
      "L'attestation d'assurance responsabilité civile auto reconnue dans plusieurs pays de la Communauté économique des États de l'Afrique de l'Ouest. Exemple : un conducteur en déplacement routier vers un pays voisin peut présenter sa carte brune au lieu de souscrire une assurance à la frontière.",
    seeAlso: ["Responsabilité civile"]
  },
  {
    term: "Contrat d'assurance",
    definition:
      "L'accord entre l'assuré et l'assureur qui fixe les garanties, la prime et les conditions. AssurMatch ne fait pas partie du contrat : il est conclu entre vous et le courtier partenaire ou l'assureur.",
    seeAlso: ["Assureur", "Courtier"]
  },
  {
    term: "Courtage",
    definition: "L'activité du courtier : représenter les intérêts du client, comparer des offres et l'accompagner jusqu'à la souscription.",
    seeAlso: ["Courtier"]
  },
  {
    term: "Courtier",
    definition:
      "Le professionnel autorisé qui confirme le devis, ajuste les conditions si besoin et accompagne la souscription. C'est le courtier partenaire, et non AssurMatch, qui est responsable du contrat proposé.",
    seeAlso: ["Assureur", "Devis", "Courtier responsable"]
  },
  {
    term: "Courtier responsable",
    definition:
      "Le courtier partenaire identifié comme destinataire d'une demande de devis pour une offre donnée. Son nom et, lorsqu'il est disponible, son numéro d'agrément sont affichés avant que vous ne cochiez la case de consentement.",
    seeAlso: ["Courtier"]
  },
  {
    term: "Délai de traitement",
    definition: "Le temps annoncé pour qu'un courtier partenaire étudie une demande de devis. Ce n'est pas un délai de remboursement en cas de sinistre."
  },
  {
    term: "Devis",
    definition:
      "Une proposition chiffrée transmise par un courtier partenaire après étude d'une demande. Un prix affiché sur AssurMatch avant ce devis reste indicatif.",
    seeAlso: ["Prix indicatif", "Courtier"]
  },
  {
    term: "Exclusion",
    definition:
      "Une situation ou un événement explicitement non couvert par une garantie, même si elle appartient à la même catégorie de risque. Exemple : une activité sportive à risque non déclarée peut être exclue d'une assurance voyage.",
    seeAlso: ["Garantie"]
  },
  {
    term: "Franchise",
    definition:
      "La part d'un sinistre qui reste à la charge de l'assuré, avant que l'indemnisation de l'assureur ne s'applique. Exemple : pour un sinistre de 200 000 FCFA et une franchise de 30 000 FCFA, l'assureur verse 170 000 FCFA.",
    seeAlso: ["Sinistre", "Indemnisation"]
  },
  {
    term: "Garantie",
    definition:
      "Un engagement de l'assureur à couvrir un risque précis (par exemple le vol, l'incendie ou les frais médicaux), en échange du paiement de la prime.",
    seeAlso: ["Exclusion", "Plafond de garantie", "Tous risques"]
  },
  {
    term: "Indemnisation",
    definition:
      "La somme versée par l'assureur à l'assuré ou au bénéficiaire pour compenser un sinistre couvert, dans la limite du plafond de garantie et après déduction de la franchise.",
    seeAlso: ["Franchise", "Plafond de garantie"]
  },
  {
    term: "Lead qualifié",
    definition:
      "Une demande de devis qui remplit les critères techniques nécessaires (coordonnées valides, pays et produit actifs, consentement recueilli, demande non dupliquée, courtier assigné, informations minimales complètes) pour être facturée au courtier partenaire."
  },
  {
    term: "Offre indicative",
    definition:
      "Une offre affichée sur AssurMatch avant confirmation par le courtier partenaire : son prix, ses garanties et ses conditions peuvent encore être ajustés.",
    seeAlso: ["Prix indicatif"]
  },
  {
    term: "Offre sponsorisée",
    definition:
      "Une offre dont le courtier partenaire a un partenariat commercial avec AssurMatch, signalée par un badge orange. Cela ne modifie ni son prix indicatif ni ses garanties, et elle ne peut jamais occuper la première position d'un classement du seul fait d'être sponsorisée.",
    seeAlso: ["Score indicatif"]
  },
  {
    term: "Période de validité",
    definition:
      "La durée pendant laquelle une offre affichée sur AssurMatch reste valable avant d'être retirée ou mise à jour. À ne pas confondre avec la durée du contrat d'assurance lui-même.",
    seeAlso: ["Prise d'effet"]
  },
  {
    term: "Plafond de garantie",
    definition: "Le montant maximal que l'assureur rembourse pour un sinistre couvert par une garantie donnée.",
    seeAlso: ["Garantie", "Indemnisation"]
  },
  {
    term: "Prime",
    definition: "Le montant payé par l'assuré à l'assureur, généralement chaque mois ou chaque année, en échange des garanties du contrat.",
    seeAlso: ["Surprime"]
  },
  {
    term: "Prise d'effet",
    definition: "La date à partir de laquelle les garanties d'un contrat s'appliquent réellement.",
    seeAlso: ["Période de validité"]
  },
  {
    term: "Prix indicatif",
    definition:
      "Un prix estimé à partir des informations disponibles au moment de la comparaison, sans valeur contractuelle. Il est systématiquement confirmé par le courtier partenaire.",
    seeAlso: ["Devis"]
  },
  {
    term: "Rapatriement",
    definition:
      "Le retour organisé et pris en charge de l'assuré vers son pays de résidence, en cas de problème médical grave pendant un déplacement couvert par une assurance voyage.",
    seeAlso: ["Assistance"]
  },
  {
    term: "Renouvellement",
    definition: "La reconduction d'un contrat d'assurance à l'échéance, avec ou sans changement des conditions."
  },
  {
    term: "Résiliation",
    definition: "La fin, anticipée ou à échéance, d'un contrat d'assurance, à l'initiative de l'assuré ou de l'assureur selon les conditions prévues."
  },
  {
    term: "Responsabilité civile",
    definition:
      "La garantie, souvent obligatoire, qui couvre les dommages causés par l'assuré à un tiers. Exemple : un accrochage causé à un autre véhicule relève de la responsabilité civile auto.",
    seeAlso: ["Tiers", "Tous risques"]
  },
  {
    term: "Score indicatif",
    definition:
      "Une note calculée à partir de plusieurs critères (prix, niveau de garantie, franchise, rapidité, souplesse de paiement, qualité de l'information) pour aider à comparer des offres. Une offre sponsorisée ne peut jamais occuper la première position d'un classement basé sur ce score du seul fait d'être sponsorisée.",
    seeAlso: ["Offre sponsorisée"]
  },
  {
    term: "Sinistre",
    definition: "Un événement couvert par une garantie (accident, vol, incendie...) qui déclenche une demande d'indemnisation auprès de l'assureur.",
    seeAlso: ["Indemnisation", "Franchise"]
  },
  {
    term: "Souscription",
    definition:
      "L'acte par lequel l'assuré accepte définitivement un contrat d'assurance auprès d'un courtier ou d'un assureur. AssurMatch n'intervient jamais dans la souscription elle-même.",
    seeAlso: ["Courtier", "Contrat d'assurance"]
  },
  {
    term: "Souscripteur",
    definition: "La personne qui signe le contrat d'assurance et s'engage à payer la prime ; elle est souvent, mais pas toujours, la même personne que l'assuré."
  },
  {
    term: "Surprime",
    definition: "Un supplément ajouté à la prime de base, généralement lié à un risque aggravé (par exemple un historique de sinistres).",
    seeAlso: ["Prime", "Bonus-malus"]
  },
  {
    term: "Tiers",
    definition: "Toute personne autre que l'assuré et l'assureur, par exemple une victime d'un accident causé par l'assuré.",
    seeAlso: ["Responsabilité civile"]
  },
  {
    term: "Tiers étendu / Tiers plus",
    definition:
      "Un niveau de garantie intermédiaire entre le tiers simple et le tous risques : il ajoute des garanties choisies (vol, incendie, bris de glace) à la responsabilité civile de base, sans couvrir tous les dommages au véhicule en cas de responsabilité.",
    seeAlso: ["Garantie", "Tous risques"]
  },
  {
    term: "Tous risques",
    definition:
      "Le niveau de garantie le plus complet pour une assurance auto : il couvre les dommages causés à autrui et les dommages au véhicule assuré, y compris lorsque le conducteur est responsable. Exemple : un choc contre un poteau sans tiers impliqué peut être couvert en tous risques, pas en tiers simple.",
    seeAlso: ["Tiers étendu / Tiers plus", "Responsabilité civile"]
  },
  {
    term: "Valeur à neuf / valeur vénale",
    definition:
      "Deux façons de calculer l'indemnisation d'un bien endommagé ou volé : la valeur à neuf correspond au prix d'un bien équivalent neuf, la valeur vénale à son prix de revente au moment du sinistre, généralement plus faible. Exemple : un véhicule de cinq ans volé est le plus souvent indemnisé à sa valeur vénale, sauf offre incluant une garantie valeur à neuf.",
    seeAlso: ["Indemnisation"]
  }
];

const en: GlossaryEntry[] = [
  {
    term: "Assistance",
    definition:
      "A help service for a breakdown, an accident or an emergency during the covered trip or stay (roadside assistance, towing, advance of costs). Example: travel assistance can arrange an on-site medical consultation.",
    seeAlso: ["Repatriation"]
  },
  {
    term: "Insured party",
    definition:
      "The person whose property, health or liability is covered by an insurance contract. Example: the main driver of a vehicle is the insured party of the car contract.",
    seeAlso: ["Insurer", "Policyholder"]
  },
  {
    term: "Insurer",
    definition: "The company that carries the risk and pays the compensation for a covered claim. Different from the broker, who introduces the parties without carrying the risk.",
    seeAlso: ["Broker", "Claim"]
  },
  {
    term: "Insurance certificate",
    definition:
      "The document issued by the insurer or broker that proves a contract is in force. AssurMatch never issues a certificate: only the partner broker does, after subscription. Example: a car insurance certificate is shown at a roadside check.",
    seeAlso: ["Broker", "Subscription"]
  },
  {
    term: "Endorsement",
    definition:
      "A document that amends an insurance contract already in force, for example to add a guarantee or change a piece of information. Example: changing vehicles leads to an endorsement, not a new contract.",
    seeAlso: ["Insurance contract"]
  },
  {
    term: "Beneficiary",
    definition: "The person who receives the compensation provided by the contract in the event of a claim, when different from the insured party."
  },
  {
    term: "No-claims bonus/malus",
    definition:
      "A factor that adjusts the premium based on the insured party's claims history: it goes down without an at-fault claim, and up after one. Example: a driver with no at-fault claim for several years usually pays a reduced premium.",
    seeAlso: ["Premium", "Claim"]
  },
  {
    term: "Waiting period",
    definition:
      "The period after subscribing during which a guarantee is not yet active, even though the contract is already in force. Its exact length depends on the contract and the type of guarantee."
  },
  {
    term: "ECOWAS brown card",
    definition:
      "The car third-party liability insurance certificate recognised in several countries of the Economic Community of West African States. Example: a driver on a road trip to a neighbouring country can present their brown card instead of taking out insurance at the border.",
    seeAlso: ["Third-party liability"]
  },
  {
    term: "Insurance contract",
    definition:
      "The agreement between the insured party and the insurer that sets the guarantees, the premium and the conditions. AssurMatch is not a party to the contract: it is concluded between you and the partner broker or insurer.",
    seeAlso: ["Insurer", "Broker"]
  },
  {
    term: "Brokerage",
    definition: "The broker's activity: representing the client's interests, comparing offers and supporting them through to subscription.",
    seeAlso: ["Broker"]
  },
  {
    term: "Broker",
    definition:
      "The authorised professional who confirms the quote, adjusts the conditions if needed, and supports the subscription. It is the partner broker, not AssurMatch, who is responsible for the proposed contract.",
    seeAlso: ["Insurer", "Quote", "Responsible broker"]
  },
  {
    term: "Responsible broker",
    definition:
      "The partner broker identified as the recipient of a quote request for a given offer. Their name and, when available, their licence number are shown before you tick the consent box.",
    seeAlso: ["Broker"]
  },
  {
    term: "Processing time",
    definition: "The time announced for a partner broker to review a quote request. It is not a claim reimbursement time."
  },
  {
    term: "Quote",
    definition: "A priced proposal transmitted by a partner broker after reviewing a request. A price shown on AssurMatch before that quote remains indicative.",
    seeAlso: ["Indicative price", "Broker"]
  },
  {
    term: "Exclusion",
    definition:
      "A situation or event explicitly not covered by a guarantee, even when it belongs to the same risk category. Example: an undeclared risky sporting activity can be excluded from travel insurance.",
    seeAlso: ["Guarantee"]
  },
  {
    term: "Deductible",
    definition:
      "The part of a claim left to the insured party, before the insurer's compensation applies. Example: for a 200,000 FCFA claim and a 30,000 FCFA deductible, the insurer pays 170,000 FCFA.",
    seeAlso: ["Claim", "Compensation"]
  },
  {
    term: "Guarantee",
    definition: "A commitment by the insurer to cover a specific risk (for example theft, fire or medical costs), in exchange for the premium.",
    seeAlso: ["Exclusion", "Coverage cap", "Comprehensive cover"]
  },
  {
    term: "Compensation",
    definition: "The amount paid by the insurer to the insured party or beneficiary to offset a covered claim, within the coverage cap and after the deductible.",
    seeAlso: ["Deductible", "Coverage cap"]
  },
  {
    term: "Qualified lead",
    definition:
      "A quote request that meets the necessary technical criteria (valid contact details, active country and product, consent collected, not a duplicate, broker assigned, minimum information complete) to be billed to the partner broker."
  },
  {
    term: "Indicative offer",
    definition: "An offer shown on AssurMatch before confirmation by the partner broker: its price, guarantees and conditions can still be adjusted.",
    seeAlso: ["Indicative price"]
  },
  {
    term: "Sponsored offer",
    definition:
      "An offer whose partner broker has a commercial partnership with AssurMatch, marked with an orange badge. It changes neither its indicative price nor its guarantees, and it can never hold the first position of a ranking simply for being sponsored.",
    seeAlso: ["Indicative score"]
  },
  {
    term: "Validity period",
    definition:
      "The length of time an offer shown on AssurMatch stays valid before being withdrawn or updated. Not to be confused with the duration of the insurance contract itself.",
    seeAlso: ["Effective date"]
  },
  {
    term: "Coverage cap",
    definition: "The maximum amount the insurer reimburses for a claim covered by a given guarantee.",
    seeAlso: ["Guarantee", "Compensation"]
  },
  {
    term: "Premium",
    definition: "The amount paid by the insured party to the insurer, usually monthly or yearly, in exchange for the contract's guarantees.",
    seeAlso: ["Surcharge"]
  },
  {
    term: "Effective date",
    definition: "The date from which a contract's guarantees actually apply.",
    seeAlso: ["Validity period"]
  },
  {
    term: "Indicative price",
    definition: "A price estimated from the information available at comparison time, with no contractual value. It is always confirmed by the partner broker.",
    seeAlso: ["Quote"]
  },
  {
    term: "Repatriation",
    definition:
      "The organised, paid-for return of the insured party to their country of residence, in the event of a serious medical problem during a trip covered by travel insurance.",
    seeAlso: ["Assistance"]
  },
  {
    term: "Renewal",
    definition: "The continuation of an insurance contract at its due date, with or without a change in conditions."
  },
  {
    term: "Cancellation",
    definition: "The end, early or at term, of an insurance contract, at the initiative of the insured party or the insurer, under the agreed conditions."
  },
  {
    term: "Third-party liability",
    definition:
      "The guarantee, often mandatory, that covers damage caused by the insured party to a third party. Example: a collision with another vehicle falls under car third-party liability.",
    seeAlso: ["Third party", "Comprehensive cover"]
  },
  {
    term: "Indicative score",
    definition:
      "A rating computed from several criteria (price, guarantee level, deductible, speed, payment flexibility, quality of information) to help compare offers. A sponsored offer can never hold the first position of a ranking based on this score simply for being sponsored.",
    seeAlso: ["Sponsored offer"]
  },
  {
    term: "Claim",
    definition: "An event covered by a guarantee (accident, theft, fire...) that triggers a compensation request to the insurer.",
    seeAlso: ["Compensation", "Deductible"]
  },
  {
    term: "Subscription",
    definition:
      "The act by which the insured party finally accepts an insurance contract with a broker or insurer. AssurMatch is never involved in the subscription itself.",
    seeAlso: ["Broker", "Insurance contract"]
  },
  {
    term: "Policyholder",
    definition: "The person who signs the insurance contract and commits to paying the premium; often, but not always, the same person as the insured party."
  },
  {
    term: "Surcharge",
    definition: "An addition to the base premium, usually linked to an aggravated risk (for example a claims history).",
    seeAlso: ["Premium", "No-claims bonus/malus"]
  },
  {
    term: "Third party",
    definition: "Anyone other than the insured party and the insurer, for example a victim of an accident caused by the insured party.",
    seeAlso: ["Third-party liability"]
  },
  {
    term: "Extended third-party / third-party plus",
    definition:
      "A guarantee level between basic third-party and comprehensive cover: it adds chosen guarantees (theft, fire, windscreen damage) to the base third-party liability, without covering all damage to the vehicle when at fault.",
    seeAlso: ["Guarantee", "Comprehensive cover"]
  },
  {
    term: "Comprehensive cover",
    definition:
      "The most complete guarantee level for car insurance: it covers damage caused to others and damage to the insured vehicle, including when the driver is at fault. Example: hitting a post with no third party involved can be covered under comprehensive cover, not under basic third-party.",
    seeAlso: ["Extended third-party / third-party plus", "Third-party liability"]
  },
  {
    term: "Replacement value / market value",
    definition:
      "Two ways to calculate compensation for damaged or stolen property: replacement value is the price of an equivalent new item, market value is its resale price at the time of the claim, usually lower. Example: a five-year-old stolen vehicle is most often compensated at its market value, unless the offer includes a replacement-value guarantee.",
    seeAlso: ["Compensation"]
  }
];

function sorted(entries: GlossaryEntry[]): GlossaryEntry[] {
  return [...entries].sort((a, b) => a.term.localeCompare(b.term, "fr", { sensitivity: "base" }));
}

export function listGlossary(locale: ContentLocale): GlossaryEntry[] {
  return sorted(locale === "en" ? en : fr);
}
