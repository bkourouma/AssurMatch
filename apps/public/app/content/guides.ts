import type { ContentLocale, Guide } from "./types";

/**
 * Reading time shown on the guides index and on a guide's own header. It is always derived from the
 * word count of `sections` (paragraphs and bullets), at the standard 200 silent-reading words per
 * minute, and rounded up to at least one minute. It is never a typed field on `Guide`, so a guide can
 * never ship a reading time that does not match its actual length.
 */
export function guideReadingTimeMinutes(guide: Guide): number {
  const words = guide.sections
    .flatMap((section) => [...section.body, ...(section.bullets ?? [])])
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

const fr: Guide[] = [
  {
    slug: "assurance-auto",
    title: "Comprendre l'assurance auto",
    description:
      "Les garanties, la franchise et les documents utiles pour comparer des offres d'assurance auto en Côte d'Ivoire.",
    updatedAt: "2026-09-25",
    productKey: "auto",
    keyPoints: [
      "La responsabilité civile est la garantie de base d'une assurance auto.",
      "Le niveau choisi (tiers, tiers étendu, tous risques) change fortement le prix indicatif.",
      "La franchise et le plafond comptent autant que le prix affiché.",
      "La carte brune CEDEAO facilite les déplacements routiers dans la sous-région.",
      "Les documents du véhicule et du conducteur principal accélèrent l'étude de la demande."
    ],
    sections: [
      {
        id: "garanties-principales",
        heading: "Les garanties principales",
        body: [
          "Une assurance auto combine plusieurs garanties. La responsabilité civile couvre les dommages que vous causez à un tiers avec votre véhicule ; elle est obligatoire dans la plupart des pays de la sous-région. Au-dessus de cette base, des garanties complémentaires peuvent être ajoutées selon le niveau choisi : vol, incendie, bris de glace, ou dommages au véhicule assuré lui-même."
        ],
        bullets: [
          "Responsabilité civile : les dommages causés à un tiers, la garantie de base.",
          "Vol et incendie : le véhicule assuré lui-même, en cas de vol ou d'incendie.",
          "Bris de glace : le pare-brise et les vitres.",
          "Dommages tous accidents : les dommages au véhicule assuré, même en cas de responsabilité."
        ]
      },
      {
        id: "niveaux-de-garantie",
        heading: "Tiers, tiers étendu, tous risques : les niveaux de garantie",
        body: [
          "Les offres d'assurance auto se répartissent en général en trois niveaux. Le tiers simple se limite à la responsabilité civile. Le tiers étendu, parfois appelé tiers plus, y ajoute quelques garanties choisies comme le vol ou l'incendie. Le tous risques couvre en plus les dommages au véhicule assuré, y compris lorsque le conducteur est responsable de l'accident. Le niveau choisi pèse davantage sur le prix indicatif que la plupart des autres critères."
        ]
      },
      {
        id: "franchise-et-plafond",
        heading: "Franchise et plafond de garantie",
        body: [
          "La franchise est la part d'un sinistre qui reste à votre charge ; le plafond de garantie est le montant maximal remboursé pour un sinistre. Deux offres au même prix indicatif peuvent proposer une franchise ou un plafond très différents. Ce sont des critères de comparaison aussi importants que le prix affiché, surtout pour un véhicule récent ou de valeur."
        ]
      },
      {
        id: "carte-brune-cedeao",
        heading: "La carte brune CEDEAO, pour circuler dans la sous-région",
        body: [
          "La carte brune CEDEAO est une attestation d'assurance responsabilité civile reconnue dans plusieurs pays de la Communauté économique des États de l'Afrique de l'Ouest. Elle permet de circuler en véhicule d'un pays membre à un autre sans souscrire une nouvelle assurance à chaque frontière. Les conditions d'émission, sa durée de validité et les pays couverts exactement dépendent de l'assureur et de la réglementation en vigueur. Si vous prévoyez un déplacement routier vers un pays voisin, vérifiez avant de partir si votre offre l'inclut ou si elle doit être demandée séparément."
        ]
      },
      {
        id: "documents-utiles",
        heading: "Documents utiles pour une demande de devis",
        body: ["Avant de demander un devis, il est utile de préparer :"],
        bullets: [
          "la carte grise du véhicule ;",
          "le relevé d'information de l'assureur précédent, si disponible ;",
          "le permis de conduire du conducteur principal ;",
          "un justificatif de bonus-malus, lorsque l'assureur précédent en délivre un."
        ]
      },
      {
        id: "comparer-et-demander",
        heading: "Comparer puis demander un devis",
        body: [
          "Une fois les garanties comprises, la comparaison des offres indicatives permet de repérer les niveaux de garantie et les franchises proposés par les courtiers partenaires pour ce produit dans le pays choisi. Le prix définitif, la carte brune si elle est incluse, et les conditions exactes sont confirmés par le courtier partenaire après étude de la demande."
        ]
      }
    ],
    mistakes: [
      "Comparer uniquement le prix sans regarder le niveau de garantie retenu.",
      "Partir en déplacement sous-régional sans vérifier la validité de la carte brune CEDEAO.",
      "Ignorer la franchise annoncée, qui reste à votre charge en cas de sinistre.",
      "Donner des informations approximatives sur le véhicule ou le conducteur, ce qui peut modifier le prix confirmé par le courtier.",
      "Attendre l'expiration du contrat en cours pour commencer à comparer."
    ],
    compareCta: "Comparez les offres d'assurance auto disponibles pour votre pays."
  },
  {
    slug: "assurance-voyage",
    title: "Comprendre l'assurance voyage",
    description:
      "Ce que couvre une assurance voyage, ce qu'elle ne couvre pas, et ce qu'il faut vérifier avant un déplacement vers l'espace Schengen ou ailleurs.",
    updatedAt: "2026-09-25",
    productKey: "voyage",
    keyPoints: [
      "Frais médicaux, rapatriement, annulation et bagages : l'étendue exacte dépend de chaque offre.",
      "Un visa Schengen impose une couverture minimale et une durée qui couvre tout le séjour.",
      "Le délai de traitement affiché est celui de l'étude de la demande, pas un délai de remboursement.",
      "Les exclusions courantes méritent d'être lues avant de comparer sur le seul prix."
    ],
    sections: [
      {
        id: "ce-que-couvre-lassurance-voyage",
        heading: "Ce que couvre une assurance voyage",
        body: [
          "Une assurance voyage couvre généralement les frais médicaux et l'hospitalisation à l'étranger, le rapatriement, l'annulation ou l'interruption du voyage, et parfois la perte, le vol ou le retard de bagages. L'étendue exacte, les plafonds de remboursement et les exclusions dépendent de chaque offre."
        ],
        bullets: [
          "Frais médicaux et hospitalisation à l'étranger.",
          "Rapatriement sanitaire.",
          "Annulation ou interruption de voyage.",
          "Bagages perdus, volés ou retardés, selon l'offre."
        ]
      },
      {
        id: "visa-schengen",
        heading: "Le cas particulier du visa Schengen",
        body: [
          "Un visa Schengen exige en général une assurance voyage avec un montant minimal de couverture médicale et de rapatriement, souvent autour de 30 000 euros, valable pour toute la durée du séjour prévu dans l'espace Schengen. Une couverture insuffisante ou une date de fin antérieure à la date de retour peut entraîner un refus de visa ou un problème à l'entrée du territoire. Vérifiez ce montant et cette durée avant de choisir une offre, en particulier lorsque la date de départ est proche."
        ]
      },
      {
        id: "delai-de-traitement",
        heading: "Le délai de traitement affiché",
        body: [
          "Le délai de traitement indiqué sur une offre correspond au temps annoncé pour l'étude de la demande par le courtier partenaire, pas à un délai de remboursement en cas de sinistre. Il vaut la peine de comparer ce délai lorsque le voyage est proche."
        ]
      },
      {
        id: "exclusions-courantes",
        heading: "Exclusions courantes",
        body: [
          "Les activités à risque non déclarées, les zones déconseillées par les autorités, ou une pathologie préexistante non signalée figurent parmi les exclusions les plus fréquentes. Chaque offre affiche ses propres exclusions : elles méritent d'être lues avant de comparer sur le seul critère du prix."
        ]
      },
      {
        id: "comparer-et-demander",
        heading: "Comparer puis demander un devis",
        body: [
          "La comparaison des offres indicatives pour ce produit permet de repérer rapidement les garanties couvertes et le délai de traitement annoncé. Le courtier partenaire confirme ensuite le prix et les conditions exactes."
        ]
      }
    ],
    mistakes: [
      "Souscrire une couverture dont le montant est inférieur au minimum exigé pour le visa.",
      "Choisir une date de fin de couverture antérieure à la date de retour prévue.",
      "Ne pas déclarer une activité à risque ou une zone déconseillée par les autorités.",
      "Comparer uniquement le prix sans vérifier le plafond de remboursement médical.",
      "Demander un devis la veille du départ, sans laisser de temps à l'étude du dossier."
    ],
    compareCta: "Comparez les offres d'assurance voyage disponibles pour votre pays."
  },
  {
    slug: "lire-un-prix-indicatif",
    title: "Lire un prix indicatif",
    description: "Pourquoi le prix affiché n'est pas définitif, et comment le score aide à comparer au-delà du seul prix.",
    updatedAt: "2026-09-25",
    keyPoints: [
      "Le prix affiché est une estimation, sans valeur contractuelle.",
      "Le prix définitif dépend d'informations vérifiées par le courtier partenaire après étude du dossier.",
      "Plusieurs éléments (garanties retenues, franchise, documents) peuvent faire varier le prix confirmé.",
      "Le score sur 100 aide à comparer plusieurs critères à la fois, pas seulement le prix."
    ],
    sections: [
      {
        id: "pourquoi-indicatif",
        heading: "Pourquoi un prix est indicatif",
        body: [
          "Le prix affiché à côté d'une offre est calculé à partir des informations disponibles au moment de la comparaison. Il n'a pas de valeur contractuelle : c'est une estimation, jamais un engagement de prix final.",
          "Le prix définitif dépend d'informations que seul le courtier partenaire vérifie précisément (situation exacte, historique, documents fournis) et qu'il confirme après étude de la demande."
        ]
      },
      {
        id: "ce-qui-peut-le-faire-varier",
        heading: "Ce qui peut faire varier le prix définitif",
        body: ["Plusieurs éléments, propres à chaque produit, peuvent modifier le prix confirmé par le courtier :"],
        bullets: [
          "des informations complémentaires demandées lors de l'étude du dossier ;",
          "le niveau de garantie finalement retenu ;",
          "la franchise choisie ;",
          "des documents justificatifs à fournir."
        ]
      },
      {
        id: "score-indicatif",
        heading: "Score indicatif, un repère au-delà du prix",
        body: [
          "Chaque offre affiche aussi un score sur 100, calculé à partir de plusieurs critères : le prix, le niveau de garantie, la franchise, la rapidité annoncée et la souplesse de paiement. Un prix bas avec un score faible signale en général une offre moins complète sur les autres critères. Le score aide à comparer plusieurs offres d'un coup d'œil, sans remplacer la lecture du détail de chacune."
        ]
      },
      {
        id: "comparer-utilement",
        heading: "Comparer utilement plusieurs offres",
        body: [
          "Comparer uniquement le prix indicatif le plus bas peut être trompeur : deux offres au même prix peuvent proposer des garanties, une franchise ou un délai de traitement très différents. Le score affiché sur chaque offre tient compte de plusieurs de ces critères, pas seulement du prix."
        ]
      }
    ],
    mistakes: [
      "Choisir une offre uniquement parce que son prix indicatif est le plus bas.",
      "Oublier que le prix affiché peut changer une fois le dossier étudié par le courtier.",
      "Comparer deux offres sans vérifier leur niveau de garantie ni leur franchise.",
      "Ignorer le score au profit du seul prix affiché."
    ],
    compareCta: "Comparez les offres indicatives disponibles pour votre pays et votre produit."
  },
  {
    slug: "choisir-un-courtier",
    title: "Choisir un courtier partenaire",
    description: "Ce que fait un courtier partenaire autorisé, et comment savoir à qui votre demande sera transmise.",
    updatedAt: "2026-09-25",
    keyPoints: [
      "Le courtier partenaire confirme le devis et engage sa responsabilité professionnelle, pas AssurMatch.",
      "Seuls des courtiers autorisés pour le pays et le produit concernés reçoivent une demande.",
      "Le numéro de licence d'un courtier, lorsqu'il est disponible, est affiché sur sa fiche.",
      "Une demande peut être transmise à plusieurs courtiers si vous l'acceptez explicitement."
    ],
    sections: [
      {
        id: "role-du-courtier",
        heading: "Le rôle du courtier partenaire",
        body: [
          "Le courtier partenaire est l'interlocuteur qui confirme le devis, ajuste les conditions si nécessaire et accompagne la souscription. C'est lui, et non AssurMatch, qui répond des engagements pris avec vous."
        ]
      },
      {
        id: "courtiers-autorises",
        heading: "Des courtiers autorisés uniquement",
        body: [
          "AssurMatch met en relation le visiteur uniquement avec des courtiers partenaires autorisés pour le pays et le produit concernés. Le numéro de licence et l'autorité de délivrance d'un courtier, lorsqu'ils sont disponibles, sont affichés sur sa fiche."
        ]
      },
      {
        id: "un-seul-ou-plusieurs-courtiers",
        heading: "Un seul courtier, ou plusieurs si vous l'acceptez",
        body: [
          "Par défaut, une demande de devis est transmise à un seul courtier partenaire, responsable du pays et du produit concernés. Si vous cochez la case prévue à cet effet lors de la demande, elle peut être transmise à plusieurs courtiers autorisés, dans la limite prévue, pour comparer leurs réponses."
        ]
      },
      {
        id: "comment-orienter-son-choix",
        heading: "Comment orienter son choix",
        body: [
          "Au-delà du prix indicatif, le niveau de garantie, la franchise et le délai de traitement annoncés par chaque offre donnent une première indication. Le nom du courtier responsable d'une offre, et son numéro d'agrément lorsqu'il est affiché, s'affichent avant la case de consentement, pour que vous sachiez à qui votre demande sera transmise."
        ]
      }
    ],
    mistakes: [
      "Confirmer une demande sans avoir lu le nom du courtier responsable et, si affiché, son numéro d'agrément.",
      "Croire qu'AssurMatch confirme elle-même le devis ou le contrat.",
      "Ne comparer que le prix indicatif sans regarder le délai de traitement annoncé par le courtier.",
      "Oublier que le contrat final se signe avec le courtier ou l'assureur, jamais avec AssurMatch."
    ],
    compareCta: "Comparez les offres et voyez le courtier responsable de chacune."
  },
  {
    slug: "comprendre-la-franchise",
    title: "Comprendre la franchise",
    description:
      "Ce que veut dire une franchise, comment elle est appliquée en cas de sinistre, et pourquoi elle change le montant que vous recevez.",
    updatedAt: "2026-09-25",
    keyPoints: [
      "La franchise reste à votre charge, avant que l'indemnisation de l'assureur ne s'applique.",
      "Elle peut être fixe ou proportionnelle, et parfois différente selon le type de sinistre.",
      "Une franchise basse va en général avec une prime plus élevée.",
      "Deux offres au même prix indicatif peuvent avoir des franchises très différentes."
    ],
    sections: [
      {
        id: "ce-quest-une-franchise",
        heading: "Ce qu'est une franchise",
        body: [
          "La franchise est la part d'un sinistre qui reste à votre charge, avant que l'indemnisation de l'assureur ne s'applique. Si un sinistre est évalué, par exemple, à 200 000 FCFA et que la franchise du contrat est de 30 000 FCFA, l'assureur verse 170 000 FCFA et les 30 000 FCFA restants restent à votre charge."
        ]
      },
      {
        id: "franchise-fixe-ou-proportionnelle",
        heading: "Franchise fixe ou franchise proportionnelle",
        body: [
          "Une franchise peut être fixe, un montant identique quel que soit le sinistre, ou proportionnelle, un pourcentage du montant du sinistre, parfois avec un plancher et un plafond. Certains contrats appliquent aussi une franchise différente selon le type de sinistre, par exemple un montant plus bas pour un bris de glace que pour un accident. La façon exacte dont une franchise est calculée est précisée dans les conditions de chaque offre."
        ]
      },
      {
        id: "comment-elle-sapplique",
        heading: "Comment elle s'applique lors d'un sinistre",
        body: [
          "Au moment de l'indemnisation, l'assureur évalue d'abord le montant du sinistre, puis en déduit la franchise prévue par le contrat avant de verser le reste. Si le montant du sinistre est inférieur à la franchise, aucune indemnisation n'est versée : c'est pourquoi il est utile de connaître ce seuil avant de choisir une offre, pas seulement au moment de déclarer un sinistre."
        ]
      },
      {
        id: "franchise-basse-pas-toujours-adaptee",
        heading: "Une franchise basse n'est pas toujours le bon choix",
        body: [
          "Une franchise plus basse va en général avec une prime plus élevée : l'assureur couvre une part plus grande du risque et le fait payer en amont. À l'inverse, une franchise plus haute réduit souvent le prix indicatif, au prix d'un reste à charge plus important en cas de sinistre. Le bon niveau dépend de votre capacité à absorber ce reste à charge le jour où un sinistre survient, pas seulement du prix affiché aujourd'hui."
        ]
      },
      {
        id: "comparer-les-franchises",
        heading: "Comparer les franchises entre offres",
        body: [
          "Deux offres au même prix indicatif peuvent afficher des franchises très différentes. Le comparateur affiche la franchise de chaque offre à côté du prix et du niveau de garantie, pour permettre cette lecture avant de demander un devis."
        ]
      }
    ],
    mistakes: [
      "Choisir une offre uniquement sur le prix, sans regarder la franchise annoncée.",
      "Confondre la franchise avec le plafond de garantie.",
      "Ne pas vérifier si la franchise change selon le type de sinistre.",
      "Apprendre le montant de la franchise seulement au moment de déclarer un sinistre."
    ],
    compareCta: "Comparez le niveau de garantie et la franchise, pas seulement le prix."
  },
  {
    slug: "responsabilite-civile",
    title: "La responsabilité civile, simplement",
    description:
      "La garantie qui couvre les dommages causés à autrui : ce qu'elle couvre, ce qu'elle ne couvre pas, et pourquoi elle est souvent obligatoire.",
    updatedAt: "2026-09-25",
    keyPoints: [
      "La RC couvre les dommages causés à un tiers, pas les dommages que vous subissez vous-même.",
      "Elle est souvent obligatoire pour circuler en véhicule, encadrée par le code CIMA.",
      "Elle se retrouve dans plusieurs produits (auto, habitation, activité professionnelle), avec des règles propres à chacun.",
      "Une garantie complémentaire est nécessaire pour couvrir vos propres dommages."
    ],
    sections: [
      {
        id: "ce-que-couvre-la-rc",
        heading: "Ce que couvre la responsabilité civile",
        body: [
          "La responsabilité civile couvre les dommages que vous causez à un tiers, c'est-à-dire à toute personne autre que vous-même et l'assureur : un piéton blessé, un véhicule endommagé, un logement voisin dégradé. Elle indemnise la victime, dans la limite du plafond prévu par le contrat, pas vous-même pour vos propres dommages."
        ]
      },
      {
        id: "pourquoi-souvent-obligatoire",
        heading: "Pourquoi elle est souvent obligatoire",
        body: [
          "Dans plusieurs pays de la sous-région, la responsabilité civile automobile est une garantie obligatoire avant de circuler avec un véhicule, encadrée par le code CIMA et les réglementations nationales. Rouler sans cette garantie expose à des sanctions et laisse l'ensemble des dommages causés à un tiers à votre charge."
        ]
      },
      {
        id: "ce-quelle-ne-couvre-pas",
        heading: "Ce qu'elle ne couvre pas",
        body: [
          "La responsabilité civile ne couvre pas vos propres dommages : ni votre véhicule, ni votre logement, ni vos blessures si vous êtes seul en cause. Pour ces situations, il faut une garantie complémentaire, comme le tous risques pour un véhicule ou une garantie dommages aux biens pour un logement."
        ]
      },
      {
        id: "rc-dans-plusieurs-produits",
        heading: "La responsabilité civile dans plusieurs produits",
        body: [
          "La responsabilité civile ne concerne pas que l'automobile. Une assurance habitation inclut le plus souvent une responsabilité civile pour les dommages causés par le logement à un voisin ou un tiers, par exemple un dégât des eaux. Une activité professionnelle peut nécessiter sa propre responsabilité civile, distincte de celle du particulier. Chaque produit a ses règles propres, précisées dans les conditions de l'offre."
        ]
      },
      {
        id: "comparer-les-offres-avec-rc",
        heading: "Comparer les offres qui incluent la responsabilité civile",
        body: [
          "Sur AssurMatch, la responsabilité civile figure parmi les garanties affichées pour chaque offre du produit concerné. Elle est présente dans la quasi-totalité des offres auto ; pour les autres produits, vérifiez-la au cas par cas avant de comparer."
        ]
      }
    ],
    mistakes: [
      "Confondre responsabilité civile et assurance tous risques : la RC ne couvre pas votre propre véhicule.",
      "Rouler avec une attestation RC expirée.",
      "Croire que la RC d'un produit couvre automatiquement un autre produit.",
      "Penser que la RC indemnise vos propres blessures ou vos propres biens."
    ],
    compareCta: "Comparez les offres qui incluent la responsabilité civile pour votre produit."
  },
  {
    slug: "declarer-un-sinistre",
    title: "Déclarer un sinistre : les bons réflexes",
    description:
      "Les étapes et les délais à connaître pour déclarer un sinistre à son assureur ou son courtier, sans compromettre l'indemnisation.",
    updatedAt: "2026-09-25",
    keyPoints: [
      "Le contrat fixe un délai de déclaration : le dépasser peut réduire l'indemnisation.",
      "Un dossier complet (constat, justificatifs, photos) accélère l'étude par l'assureur.",
      "Le courtier partenaire accompagne la déclaration, mais ne décide pas seul de l'indemnisation."
    ],
    sections: [
      {
        id: "premiers-reflexes",
        heading: "Les premiers réflexes après un sinistre",
        body: [
          "Après un accident, un vol ou un incendie, la priorité est la sécurité des personnes. Vient ensuite la collecte de preuves : photos des dommages, coordonnées des témoins, et, pour un accident de la route, le constat amiable rempli et signé sur place avec l'autre conducteur lorsque c'est possible. Ces éléments accompagnent la déclaration transmise à l'assureur ou au courtier partenaire."
        ]
      },
      {
        id: "delai-de-declaration",
        heading: "Le délai de déclaration fixé par le contrat",
        body: [
          "Chaque contrat d'assurance fixe un délai pour déclarer un sinistre à l'assureur, en général compté en jours ouvrés à partir de l'événement ou de sa découverte. Dépasser ce délai peut réduire l'indemnisation, voire la remettre en cause selon les conditions du contrat. En cas de doute sur le délai applicable, le plus sûr est de prévenir le courtier partenaire dès que possible, sans attendre d'avoir réuni tous les documents."
        ]
      },
      {
        id: "documents-a-reunir",
        heading: "Les documents à réunir selon le sinistre",
        body: [
          "Les pièces attendues dépendent du type de sinistre. Pour un accident de véhicule : le constat amiable, et un procès-verbal de police si nécessaire. Pour un sinistre lié à un voyage : les justificatifs médicaux, les factures et, en cas d'annulation, la preuve de l'événement qui l'a motivée. Pour un dégât dans un logement : des photos datées et les factures des biens endommagés. Le courtier partenaire précise la liste exacte selon le contrat concerné."
        ]
      },
      {
        id: "versement-de-lindemnisation",
        heading: "Le versement de l'indemnisation",
        body: [
          "Une fois le dossier étudié et validé par l'assureur, l'indemnisation est versée selon les moyens de paiement proposés par l'assureur. Le délai de versement dépend du dossier et n'est pas le même que le délai de traitement affiché sur une offre au moment de la comparaison, qui concerne l'étude initiale de la demande de devis."
        ]
      },
      {
        id: "ce-qui-peut-retarder",
        heading: "Ce qui peut retarder ou compromettre l'indemnisation",
        body: [
          "Un dossier incomplet, une déclaration tardive ou des informations inexactes retardent l'étude du sinistre et peuvent réduire le montant versé. Une fausse déclaration, même partielle, expose à un refus d'indemnisation et à d'autres conséquences prévues par le contrat. Relire les exclusions de son contrat avant de déclarer permet d'éviter de mauvaises surprises sur ce qui est réellement couvert."
        ]
      }
    ],
    mistakes: [
      "Attendre plusieurs semaines avant de prévenir l'assureur ou le courtier.",
      "Ne pas remplir ou signer le constat amiable sur place lors d'un accident.",
      "Ne pas conserver les factures ou justificatifs originaux.",
      "Modifier ou arranger les faits déclarés, ce qui peut être considéré comme une fausse déclaration.",
      "Ne pas relire les exclusions de son contrat avant de déclarer."
    ],
    compareCta: "Comparez les offres avant un déplacement ou un renouvellement, pour connaître les conditions annoncées."
  }
];

const en: Guide[] = [
  {
    slug: "assurance-auto",
    title: "Understanding car insurance",
    description:
      "Guarantees, the deductible and useful documents for comparing car insurance offers in Côte d'Ivoire.",
    updatedAt: "2026-09-25",
    productKey: "auto",
    keyPoints: [
      "Third-party liability is the base guarantee of car insurance.",
      "The level chosen (third-party, extended third-party, comprehensive) strongly changes the indicative price.",
      "The deductible and the coverage cap matter as much as the price shown.",
      "The ECOWAS brown card makes road travel across the sub-region easier.",
      "The vehicle's and the main driver's documents speed up the review of the request."
    ],
    sections: [
      {
        id: "garanties-principales",
        heading: "The main guarantees",
        body: [
          "Car insurance combines several guarantees. Third-party liability covers damage you cause to another party with your vehicle; it is mandatory in most countries of the sub-region. On top of this base, additional guarantees can be added depending on the level chosen: theft, fire, windscreen damage, or damage to the insured vehicle itself."
        ],
        bullets: [
          "Third-party liability: damage caused to another party, the base guarantee.",
          "Theft and fire: the insured vehicle itself, in case of theft or fire.",
          "Windscreen damage: the windscreen and windows.",
          "All-accidents cover: damage to the insured vehicle, even when at fault."
        ]
      },
      {
        id: "niveaux-de-garantie",
        heading: "Third-party, extended third-party, comprehensive: the guarantee levels",
        body: [
          "Car insurance offers are generally split into three levels. Basic third-party is limited to third-party liability. Extended third-party, sometimes called third-party plus, adds a few chosen guarantees such as theft or fire. Comprehensive additionally covers damage to the insured vehicle, including when the driver is at fault. The level chosen weighs more on the indicative price than most other criteria."
        ]
      },
      {
        id: "franchise-et-plafond",
        heading: "Deductible and coverage cap",
        body: [
          "The deductible is the part of a claim left to you; the coverage cap is the maximum amount reimbursed for a claim. Two offers at the same indicative price can have a very different deductible or cap. These are comparison criteria just as important as the price shown, especially for a recent or valuable vehicle."
        ]
      },
      {
        id: "carte-brune-cedeao",
        heading: "The ECOWAS brown card, for travelling across the sub-region",
        body: [
          "The ECOWAS brown card is a third-party liability insurance certificate recognised in several countries of the Economic Community of West African States. It allows a vehicle to travel from one member country to another without taking out a new insurance policy at every border. The exact issuing conditions, its validity period and the countries covered depend on the insurer and the regulations in force. If you are planning a road trip to a neighbouring country, check before leaving whether your offer includes it or whether it must be requested separately."
        ]
      },
      {
        id: "documents-utiles",
        heading: "Useful documents for a quote request",
        body: ["Before requesting a quote, it helps to prepare:"],
        bullets: [
          "the vehicle's registration document;",
          "the previous insurer's claims history statement, if available;",
          "the main driver's licence;",
          "a no-claims proof, when the previous insurer issues one."
        ]
      },
      {
        id: "comparer-et-demander",
        heading: "Compare, then request a quote",
        body: [
          "Once the guarantees are clear, comparing indicative offers helps spot the guarantee levels and deductibles offered by partner brokers for this product in the chosen country. The final price, the brown card if it is included, and the exact conditions are confirmed by the partner broker after reviewing the request."
        ]
      }
    ],
    mistakes: [
      "Comparing only the price without looking at the guarantee level chosen.",
      "Travelling across the sub-region without checking the ECOWAS brown card's validity.",
      "Ignoring the deductible shown, which stays with you in the event of a claim.",
      "Giving approximate information about the vehicle or the driver, which can change the price the broker confirms.",
      "Waiting for the current contract to expire before starting to compare."
    ],
    compareCta: "Compare the car insurance offers available for your country."
  },
  {
    slug: "assurance-voyage",
    title: "Understanding travel insurance",
    description:
      "What travel insurance covers, what it does not cover, and what to check before a trip to the Schengen area or elsewhere.",
    updatedAt: "2026-09-25",
    productKey: "voyage",
    keyPoints: [
      "Medical costs, repatriation, cancellation and baggage: the exact scope depends on each offer.",
      "A Schengen visa requires a minimum level of cover and a duration that covers the whole trip.",
      "The processing time shown is for reviewing the request, not a reimbursement time.",
      "Common exclusions are worth reading before comparing on price alone."
    ],
    sections: [
      {
        id: "ce-que-couvre-lassurance-voyage",
        heading: "What travel insurance covers",
        body: [
          "Travel insurance usually covers medical costs and hospitalisation abroad, repatriation, trip cancellation or interruption, and sometimes lost, stolen or delayed baggage. The exact scope, the reimbursement caps and the exclusions depend on each offer."
        ],
        bullets: [
          "Medical costs and hospitalisation abroad.",
          "Medical repatriation.",
          "Trip cancellation or interruption.",
          "Lost, stolen or delayed baggage, depending on the offer."
        ]
      },
      {
        id: "visa-schengen",
        heading: "The particular case of the Schengen visa",
        body: [
          "A Schengen visa generally requires travel insurance with a minimum amount of medical and repatriation cover, often around 30,000 euros, valid for the whole duration of the planned stay in the Schengen area. Insufficient cover or an end date earlier than the return date can lead to a visa refusal or a problem entering the territory. Check this amount and this duration before choosing an offer, particularly when the departure date is close."
        ]
      },
      {
        id: "delai-de-traitement",
        heading: "The processing time shown",
        body: [
          "The processing time shown on an offer is the announced time for the partner broker to review the request, not a claim reimbursement time. It is worth comparing this delay when the trip is close."
        ]
      },
      {
        id: "exclusions-courantes",
        heading: "Common exclusions",
        body: [
          "Undeclared risky activities, areas advised against by the authorities, or an undisclosed pre-existing condition are among the most frequent exclusions. Every offer lists its own exclusions: they are worth reading before comparing on price alone."
        ]
      },
      {
        id: "comparer-et-demander",
        heading: "Compare, then request a quote",
        body: [
          "Comparing indicative offers for this product quickly shows the covered guarantees and the announced processing time. The partner broker then confirms the exact price and conditions."
        ]
      }
    ],
    mistakes: [
      "Taking out cover with an amount below the minimum required for the visa.",
      "Choosing a cover end date earlier than the planned return date.",
      "Not declaring a risky activity or an area advised against by the authorities.",
      "Comparing only the price without checking the medical reimbursement cap.",
      "Requesting a quote the day before departure, leaving no time to review the file."
    ],
    compareCta: "Compare the travel insurance offers available for your country."
  },
  {
    slug: "lire-un-prix-indicatif",
    title: "Reading an indicative price",
    description: "Why the price shown is not final, and how the score helps compare beyond price alone.",
    updatedAt: "2026-09-25",
    keyPoints: [
      "The price shown is an estimate, with no contractual value.",
      "The final price depends on information the partner broker verifies after reviewing the file.",
      "Several elements (guarantees chosen, deductible, documents) can change the confirmed price.",
      "The score out of 100 helps compare several criteria at once, not only the price."
    ],
    sections: [
      {
        id: "pourquoi-indicatif",
        heading: "Why a price is indicative",
        body: [
          "The price shown next to an offer is computed from the information available at comparison time. It has no contractual value: it is an estimate, never a final price commitment.",
          "The final price depends on information only the partner broker checks precisely (exact situation, history, documents provided) and confirms after reviewing the request."
        ]
      },
      {
        id: "ce-qui-peut-le-faire-varier",
        heading: "What can change the final price",
        body: ["Several elements, specific to each product, can change the price the broker confirms:"],
        bullets: [
          "additional information requested while reviewing the file;",
          "the guarantee level finally chosen;",
          "the chosen deductible;",
          "supporting documents to provide."
        ]
      },
      {
        id: "score-indicatif",
        heading: "Indicative score, a reference point beyond price",
        body: [
          "Every offer also shows a score out of 100, computed from several criteria: price, guarantee level, deductible, announced speed and payment flexibility. A low price with a low score generally signals an offer that is less complete on the other criteria. The score helps compare several offers at a glance, without replacing a close reading of each one."
        ]
      },
      {
        id: "comparer-utilement",
        heading: "Usefully comparing several offers",
        body: [
          "Comparing only the lowest indicative price can be misleading: two offers at the same price can have very different guarantees, a different deductible or a different processing time. The score shown on each offer factors in several of these criteria, not only the price."
        ]
      }
    ],
    mistakes: [
      "Choosing an offer only because its indicative price is the lowest.",
      "Forgetting that the price shown can change once the file is reviewed by the broker.",
      "Comparing two offers without checking their guarantee level or their deductible.",
      "Ignoring the score in favour of the price alone."
    ],
    compareCta: "Compare the indicative offers available for your country and your product."
  },
  {
    slug: "choisir-un-courtier",
    title: "Choosing a partner broker",
    description: "What an authorised partner broker does, and how to know who your request will be sent to.",
    updatedAt: "2026-09-25",
    keyPoints: [
      "The partner broker confirms the quote and carries professional liability for it, not AssurMatch.",
      "Only brokers authorised for the relevant country and product receive a request.",
      "A broker's licence number, when available, is shown on their profile.",
      "A request can be sent to several brokers if you explicitly accept it."
    ],
    sections: [
      {
        id: "role-du-courtier",
        heading: "The partner broker's role",
        body: [
          "The partner broker is the contact who confirms the quote, adjusts the conditions if needed, and supports the subscription. They, not AssurMatch, are accountable for the commitments made with you."
        ]
      },
      {
        id: "courtiers-autorises",
        heading: "Authorised brokers only",
        body: [
          "AssurMatch only introduces visitors to partner brokers authorised for the relevant country and product. A broker's licence number and issuing authority, when available, are shown on their profile."
        ]
      },
      {
        id: "un-seul-ou-plusieurs-courtiers",
        heading: "A single broker, or several if you accept it",
        body: [
          "By default, a quote request is sent to a single partner broker, responsible for the relevant country and product. If you tick the box provided for this purpose when requesting, it can be sent to several authorised brokers, within the set limit, so you can compare their answers."
        ]
      },
      {
        id: "comment-orienter-son-choix",
        heading: "What to weigh in the choice",
        body: [
          "Beyond the indicative price, the guarantee level, the deductible and the processing time announced by each offer give a first indication. The name of the broker responsible for an offer, and their licence number when shown, appear before the consent box, so you know who your request will be sent to."
        ]
      }
    ],
    mistakes: [
      "Confirming a request without having read the responsible broker's name and, when shown, their licence number.",
      "Believing that AssurMatch itself confirms the quote or the contract.",
      "Comparing only the indicative price without looking at the processing time announced by the broker.",
      "Forgetting that the final contract is signed with the broker or the insurer, never with AssurMatch."
    ],
    compareCta: "Compare the offers and see the broker responsible for each one."
  },
  {
    slug: "comprendre-la-franchise",
    title: "Understanding the deductible",
    description:
      "What a deductible means, how it applies when a claim is settled, and why it changes the amount you receive.",
    updatedAt: "2026-09-25",
    keyPoints: [
      "The deductible stays with you, before the insurer's compensation applies.",
      "It can be fixed or proportional, and sometimes different depending on the type of claim.",
      "A low deductible usually comes with a higher premium.",
      "Two offers at the same indicative price can have very different deductibles."
    ],
    sections: [
      {
        id: "ce-quest-une-franchise",
        heading: "What a deductible is",
        body: [
          "The deductible is the part of a claim that stays with you, before the insurer's compensation applies. If a claim is valued, for example, at 200,000 FCFA and the contract's deductible is 30,000 FCFA, the insurer pays 170,000 FCFA and the remaining 30,000 FCFA stays with you."
        ]
      },
      {
        id: "franchise-fixe-ou-proportionnelle",
        heading: "Fixed deductible or proportional deductible",
        body: [
          "A deductible can be fixed, an identical amount whatever the claim, or proportional, a percentage of the claim amount, sometimes with a floor and a cap. Some contracts also apply a different deductible depending on the type of claim, for example a lower amount for windscreen damage than for an accident. The exact way a deductible is calculated is stated in the conditions of each offer."
        ]
      },
      {
        id: "comment-elle-sapplique",
        heading: "How it applies when a claim is settled",
        body: [
          "When compensating a claim, the insurer first assesses the claim amount, then deducts the deductible set by the contract before paying the rest. If the claim amount is below the deductible, no compensation is paid: that is why it is useful to know this threshold before choosing an offer, not only when reporting a claim."
        ]
      },
      {
        id: "franchise-basse-pas-toujours-adaptee",
        heading: "A low deductible is not always the right choice",
        body: [
          "A lower deductible usually comes with a higher premium: the insurer covers a larger share of the risk and charges for it upfront. Conversely, a higher deductible often reduces the indicative price, at the cost of a larger amount left to you in the event of a claim. The right level depends on your ability to absorb that amount on the day a claim happens, not only on the price shown today."
        ]
      },
      {
        id: "comparer-les-franchises",
        heading: "Comparing deductibles between offers",
        body: [
          "Two offers at the same indicative price can show very different deductibles. The comparator shows the deductible of each offer next to the price and the guarantee level, so this can be read before requesting a quote."
        ]
      }
    ],
    mistakes: [
      "Choosing an offer only on price, without looking at the deductible shown.",
      "Confusing the deductible with the coverage cap.",
      "Not checking whether the deductible changes depending on the type of claim.",
      "Only learning the deductible amount when reporting a claim."
    ],
    compareCta: "Compare the guarantee level and the deductible, not only the price."
  },
  {
    slug: "responsabilite-civile",
    title: "Third-party liability, simply explained",
    description:
      "The guarantee that covers damage caused to others: what it covers, what it does not cover, and why it is often mandatory.",
    updatedAt: "2026-09-25",
    keyPoints: [
      "Third-party liability covers damage caused to another party, not damage you suffer yourself.",
      "It is often mandatory for driving a vehicle, governed by the CIMA code.",
      "It appears in several products (car, home, professional activity), each with its own rules.",
      "A separate guarantee is needed to cover your own damage."
    ],
    sections: [
      {
        id: "ce-que-couvre-la-rc",
        heading: "What third-party liability covers",
        body: [
          "Third-party liability covers damage you cause to another party, meaning anyone other than yourself and the insurer: an injured pedestrian, a damaged vehicle, a damaged neighbouring home. It compensates the victim, within the cap set by the contract, not you for your own damage."
        ]
      },
      {
        id: "pourquoi-souvent-obligatoire",
        heading: "Why it is often mandatory",
        body: [
          "In several countries of the sub-region, car third-party liability is a mandatory guarantee before driving a vehicle, governed by the CIMA code and national regulations. Driving without this guarantee exposes you to penalties and leaves all damage caused to a third party as your own responsibility."
        ]
      },
      {
        id: "ce-quelle-ne-couvre-pas",
        heading: "What it does not cover",
        body: [
          "Third-party liability does not cover your own damage: not your vehicle, not your home, not your injuries if you are the only party involved. For these situations, a separate guarantee is needed, such as comprehensive cover for a vehicle or a property damage guarantee for a home."
        ]
      },
      {
        id: "rc-dans-plusieurs-produits",
        heading: "Third-party liability across several products",
        body: [
          "Third-party liability is not limited to cars. Home insurance most often includes third-party liability for damage caused by the home to a neighbour or a third party, for example a water leak. A professional activity may need its own third-party liability, separate from an individual's. Each product has its own rules, stated in the offer's conditions."
        ]
      },
      {
        id: "comparer-les-offres-avec-rc",
        heading: "Comparing offers that include third-party liability",
        body: [
          "On AssurMatch, third-party liability appears among the guarantees shown for each offer of the relevant product. It is present in almost all car offers; for other products, check it case by case before comparing."
        ]
      }
    ],
    mistakes: [
      "Confusing third-party liability with comprehensive cover: third-party liability does not cover your own vehicle.",
      "Driving with an expired third-party liability certificate.",
      "Believing one product's third-party liability automatically covers another product.",
      "Thinking third-party liability compensates your own injuries or your own property."
    ],
    compareCta: "Compare the offers that include third-party liability for your product."
  },
  {
    slug: "declarer-un-sinistre",
    title: "Reporting a claim: the right reflexes",
    description:
      "The steps and deadlines to know when reporting a claim to your insurer or broker, without jeopardising compensation.",
    updatedAt: "2026-09-25",
    keyPoints: [
      "The contract sets a deadline to report a claim: missing it can reduce the compensation.",
      "A complete file (accident report, supporting documents, photos) speeds up the insurer's review.",
      "The partner broker supports the reporting process but does not decide compensation alone."
    ],
    sections: [
      {
        id: "premiers-reflexes",
        heading: "The first reflexes after a claim",
        body: [
          "After an accident, a theft or a fire, the priority is people's safety. Next comes gathering evidence: photos of the damage, witnesses' contact details, and, for a road accident, the joint accident report filled in and signed on the spot with the other driver when possible. These elements accompany the report sent to the insurer or the partner broker."
        ]
      },
      {
        id: "delai-de-declaration",
        heading: "The reporting deadline set by the contract",
        body: [
          "Every insurance contract sets a deadline for reporting a claim to the insurer, usually counted in working days from the event or its discovery. Missing this deadline can reduce the compensation, or even void it, depending on the contract's conditions. If in doubt about the applicable deadline, the safest approach is to notify the partner broker promptly, without waiting to gather every document."
        ]
      },
      {
        id: "documents-a-reunir",
        heading: "Documents to gather depending on the claim",
        body: [
          "The documents expected depend on the type of claim. For a vehicle accident: the joint accident report, and a police report if needed. For a travel-related claim: medical documents, invoices and, in the event of a cancellation, proof of the event that caused it. For damage to a home: dated photos and invoices for the damaged property. The partner broker states the exact list for the relevant contract."
        ]
      },
      {
        id: "versement-de-lindemnisation",
        heading: "Paying the compensation",
        body: [
          "Once the file has been reviewed and approved by the insurer, the compensation is paid using the payment methods offered by the insurer. The payment time depends on the file and is not the same as the processing time shown on an offer at comparison time, which concerns the initial review of the quote request."
        ]
      },
      {
        id: "ce-qui-peut-retarder",
        heading: "What can delay or jeopardise compensation",
        body: [
          "An incomplete file, a late report or inaccurate information delay the claim's review and can reduce the amount paid. A false statement, even a partial one, exposes you to a refusal of compensation and to other consequences set out in the contract. Rereading your contract's exclusions before reporting a claim helps avoid unpleasant surprises about what is actually covered."
        ]
      }
    ],
    mistakes: [
      "Waiting several weeks before notifying the insurer or the broker.",
      "Not filling in or signing the joint accident report on the spot after an accident.",
      "Not keeping the original invoices or supporting documents.",
      "Altering or arranging the facts reported, which can be considered a false statement.",
      "Not rereading your contract's exclusions before reporting a claim."
    ],
    compareCta: "Compare the offers before a trip or a renewal, to know the announced conditions."
  }
];

export function listGuides(locale: ContentLocale): Guide[] {
  return locale === "en" ? en : fr;
}

export function getGuide(locale: ContentLocale, slug: string): Guide | null {
  return listGuides(locale).find((guide) => guide.slug === slug) ?? null;
}

export function guideSlugs(): string[] {
  return fr.map((guide) => guide.slug);
}
