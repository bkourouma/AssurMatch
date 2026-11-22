/**
 * Pure helpers of the Starter lead screens: elapsed time since reception, response delay and the
 * "what do I do next" sentence. Nothing here calls an API, reads a session or decides a permission:
 * the page passes the facts it already computed, and these helpers only word them.
 *
 * No service-level target is invented: only the real elapsed time is shown, never a threshold or a
 * "late" verdict (PRODUCT.md: no SLA figure is fabricated).
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** « moins d'1 h », « 5 h », « 3 j » : coarse on purpose, a broker reads it between two calls. */
export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "moins d'1 h";
  if (ms < HOUR) return "moins d'1 h";
  if (ms < 2 * DAY) return `${Math.floor(ms / HOUR)} h`;
  return `${Math.floor(ms / DAY)} j`;
}

function parse(value: string | undefined | null): number | undefined {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? undefined : time;
}

/** Milliseconds between two ISO dates, or undefined when one of them is missing or invalid. */
export function elapsedBetween(fromIso: string | undefined | null, toIso: string | undefined | null): number | undefined {
  const from = parse(fromIso);
  const to = parse(toIso);
  if (from === undefined || to === undefined) return undefined;
  return Math.max(0, to - from);
}

/** « Reçu il y a 5 h », or undefined when the reception date is unknown. */
export function receivedAgo(assignedAt: string | undefined | null, nowMs: number): string | undefined {
  const from = parse(assignedAt);
  if (from === undefined) return undefined;
  return `Reçu il y a ${formatElapsed(Math.max(0, nowMs - from))}`;
}

export interface LeadHistoryEventLike {
  eventType: string;
  occurredAt: string;
}

export interface LeadResponseDelay {
  /** `waiting`: no decision yet; `decided`: accepted or rejected after the reception. */
  state: "waiting" | "decided";
  label: string;
}

const WAITING_STATUSES = ["assigned", "broker_notified", "seen"];

/**
 * Response delay of a lead: how long it has been waiting for a decision, or how long the decision
 * took. Built from the reception date and the history that the page already reads.
 */
export function leadResponseDelay(input: {
  status: string;
  assignedAt: string | undefined | null;
  events: readonly LeadHistoryEventLike[];
  nowMs: number;
}): LeadResponseDelay | undefined {
  const { status, assignedAt, events, nowMs } = input;
  const decisions: Array<{ type: string; verb: string }> = [
    { type: "accepted", verb: "Accepté" },
    { type: "rejected", verb: "Rejeté" }
  ];
  for (const { type, verb } of decisions) {
    const times = events
      .filter((event) => event.eventType === type)
      .map((event) => parse(event.occurredAt))
      .filter((time): time is number => time !== undefined);
    const received = parse(assignedAt);
    if (times.length > 0 && received !== undefined) {
      return { state: "decided", label: `${verb} ${formatElapsed(Math.max(0, Math.min(...times) - received))} après réception` };
    }
  }
  const from = parse(assignedAt);
  if (WAITING_STATUSES.includes(status) && from !== undefined) {
    return { state: "waiting", label: `En attente de votre réponse depuis ${formatElapsed(Math.max(0, nowMs - from))}` };
  }
  return undefined;
}

export interface LeadNextStepInput {
  tenantReadOnly: boolean;
  isFinal: boolean;
  canMutate: boolean;
  canAccept: boolean;
  canClose: boolean;
  canDispute: boolean;
}

export interface LeadNextStep {
  tone: "info" | "neutral" | "warning";
  title: string;
  text: string;
  /** In-page anchors offered under the sentence. */
  links: Array<{ href: string; label: string }>;
}

/** The single sentence at the top of the lead: what the broker can do now, or why nothing. */
export function leadNextStep(input: LeadNextStepInput): LeadNextStep {
  if (input.tenantReadOnly) {
    return {
      tone: "warning",
      title: "Consultation seule",
      text: "Votre compte est suspendu : vous pouvez lire ce lead, mais aucune action n'est possible pour l'instant.",
      links: []
    };
  }
  if (input.isFinal) {
    return {
      tone: "neutral",
      title: "Dossier terminé",
      text: "Ce lead est terminé. Il reste consultable avec son historique et ses échanges.",
      links: [{ href: "#historique-lead", label: "Voir l'historique" }]
    };
  }
  if (!input.canMutate) {
    return {
      tone: "neutral",
      title: "Consultation seule",
      text: "Votre rôle ne permet pas d'agir sur ce lead. Demandez au propriétaire ou à un manager du cabinet de le traiter.",
      links: []
    };
  }
  if (input.canAccept) {
    return {
      tone: "info",
      title: "À faire : décider",
      text: "Acceptez ce lead pour joindre le visiteur et lui répondre, ou rejetez-le avec un motif.",
      links: [{ href: "#actions-lead", label: "Aller aux actions" }]
    };
  }
  if (input.canClose) {
    return {
      tone: "info",
      title: "À faire : suivre le visiteur",
      text: "Écrivez au visiteur ou envoyez-lui une proposition. Clôturez le lead, avec son issue, quand le suivi est terminé.",
      links: [
        { href: "#repondre-au-visiteur", label: "Aller à la proposition" },
        { href: "#conversation", label: "Aller à la messagerie" },
        { href: "#actions-lead", label: "Aller aux actions" }
      ]
    };
  }
  return {
    tone: "neutral",
    title: "Aucune action requise",
    text: input.canDispute
      ? "Ce lead n'attend rien de vous pour l'instant. Vous pouvez encore le contester dans la fenêtre prévue."
      : "Ce lead n'attend rien de vous pour l'instant. Suivez son statut dans l'historique.",
    links: input.canDispute ? [{ href: "#actions-lead", label: "Aller aux actions" }] : [{ href: "#historique-lead", label: "Voir l'historique" }]
  };
}
