import type { BrokerLeadDisputeData } from "../broker-api";
import { DISPUTE_CREDIT_MODE_LABELS, disputeReasonLabel, disputeStatusLabel } from "../lead-vocabulary";
import { Badge, Card, DescriptionList, Notice } from "./broker-ui";
import { disputeStatusTone, formatDate, formatXof } from "./broker-view-models";

/** Spec 063 FR-B06: what the cabinet reads about the credit of an accepted dispute. */
export function DisputeCreditOutcome({ dispute }: { dispute: BrokerLeadDisputeData }) {
  if (dispute.status !== "accepted") return null;
  if (dispute.creditMode === "credit_note") {
    const label = `${DISPUTE_CREDIT_MODE_LABELS.credit_note}${dispute.creditNoteNumber ? ` ${dispute.creditNoteNumber}` : ""}${dispute.creditAmount !== undefined ? ` (${formatXof(dispute.creditAmount)} TTC)` : ""}`;
    return (
      <>
        {label}.{" "}
        <a href={dispute.creditNoteId ? `/billing/credit-notes/${dispute.creditNoteId}/pdf` : "/billing"}>
          {dispute.creditNoteId ? "Télécharger l'avoir (PDF)" : "Voir dans Facturation"}
        </a>
      </>
    );
  }
  if (dispute.creditMode === "draft_invoice") return <>{DISPUTE_CREDIT_MODE_LABELS.draft_invoice}.</>;
  if (dispute.creditMode === "none") return <>{DISPUTE_CREDIT_MODE_LABELS.none}.</>;
  return <>Crédit en cours de traitement.</>;
}

/**
 * Spec 063 FR-B09: status card of the dispute of a lead, for the Starter detail (one dispute) and the
 * CRM Pro detail (list). Shows the finance decision, its reason and the credit applied; nothing about
 * insurance premiums, which AssurMatch never collects.
 */
export function DisputeStatusCard({ disputes }: { disputes: BrokerLeadDisputeData[] }) {
  if (disputes.length === 0) return null;
  return (
    <>
      {disputes.map((dispute) => (
        <Card key={dispute.id} title="Contestation de ce lead">
          <DescriptionList
            items={[
              { term: "Statut", value: <Badge tone={disputeStatusTone(dispute.status)}>{disputeStatusLabel(dispute.status)}</Badge> },
              { term: "Motif", value: disputeReasonLabel(dispute.reason) },
              ...(dispute.comment ? [{ term: "Commentaire", value: dispute.comment }] : []),
              { term: "Déposée le", value: formatDate(dispute.createdAt) },
              ...(dispute.decidedAt ? [{ term: "Décidée le", value: formatDate(dispute.decidedAt) }] : []),
              ...(dispute.decisionReason ? [{ term: "Motif de la décision", value: dispute.decisionReason }] : [])
            ]}
          />
          {dispute.status === "opened" || dispute.status === "under_review" ? (
            <Notice tone="info">Votre contestation est en attente de la décision de la finance AssurMatch. Vous serez notifié dès qu'elle est prise.</Notice>
          ) : null}
          {dispute.status === "rejected" ? <Notice tone="warning">Contestation rejetée : le lead reste facturable.</Notice> : null}
          {dispute.status === "accepted" ? (
            <Notice tone="success" title="Contestation acceptée">
              <DisputeCreditOutcome dispute={dispute} />
            </Notice>
          ) : null}
        </Card>
      ))}
    </>
  );
}
