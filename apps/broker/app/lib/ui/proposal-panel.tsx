import type { BrokerProposalData, BrokerProposalListData } from "../broker-api";
import { withdrawProposalAction } from "../proposal-actions";
import {
  DECLINE_REASON_LABELS,
  PROPOSAL_BLOCKER_LABELS,
  PROPOSAL_CURRENCIES,
  PROPOSAL_GUARANTEES_MAX,
  PROPOSAL_MESSAGE_MAX,
  PROPOSAL_NON_CONTRACTUAL_NOTICE,
  PROPOSAL_STATUS_LABELS,
  VISITOR_RESPONSE_LABELS,
  formatPremium
} from "../proposal-vocabulary";
import { Badge, Button, ConfirmDialog, DescriptionList, Field, FormActions, FormRow, Input, Notice, Select, Stack, Textarea, TenantWriteGuard } from "./broker-ui";
import { formatDate } from "./broker-view-models";
import styles from "./broker-screens.module.css";

const STATUS_TONES: Record<string, "info" | "success" | "warning" | "neutral" | "disabled"> = {
  sent: "info",
  viewed: "info",
  responded: "success",
  withdrawn: "disabled",
  expired: "neutral"
};

export interface ProposalPanelProps {
  channel: "starter" | "crm";
  leadAssignmentId: string;
  data: BrokerProposalListData;
  /** False for a read-only role, a suspended partner or an unavailable list. */
  canMutate: boolean;
  tenantReadOnly: boolean;
  /** Suggested CRM status label (FR-007), CRM only. */
  suggestedStatusLabel?: string | undefined;
}

function documentHref(channel: "starter" | "crm", leadAssignmentId: string, proposalId: string): string {
  return channel === "crm"
    ? `/crm/leads/${leadAssignmentId}/proposals/${proposalId}/document`
    : `/leads/${leadAssignmentId}/proposals/${proposalId}/document`;
}

/** One sent proposal: an entry of the panel list, never a card nested in the panel card. */
function ProposalItem({ proposal, channel, leadAssignmentId, canWithdraw }: { proposal: BrokerProposalData; channel: "starter" | "crm"; leadAssignmentId: string; canWithdraw: boolean }) {
  return (
    <article className={styles.entry} aria-label={`Proposition du ${formatDate(proposal.sentAt)}`}>
      <div className={styles.entryHead}>
        <h3 className={styles.entryTitle}>{`Proposition du ${formatDate(proposal.sentAt)}`}</h3>
        <Badge tone={STATUS_TONES[proposal.status] ?? "neutral"}>{PROPOSAL_STATUS_LABELS[proposal.status] ?? proposal.status}</Badge>
      </div>
      <p className={styles.message}>{proposal.message}</p>
      <DescriptionList
        columns={2}
        items={[
          { term: "Prime indicative", value: formatPremium(proposal.priceMin, proposal.priceMax, proposal.currency) },
          { term: "Valable jusqu'au", value: formatDate(proposal.validUntil) },
          { term: "Garanties principales", value: proposal.guarantees.length > 0 ? proposal.guarantees.join(", ") : "Non précisées" },
          {
            term: "Document",
            value: proposal.document
              ? <a href={documentHref(channel, leadAssignmentId, proposal.id)}>{proposal.document.fileName}</a>
              : "Aucun"
          },
          ...(proposal.viewedAt ? [{ term: "Vue par le visiteur", value: formatDate(proposal.viewedAt) }] : []),
          ...(proposal.withdrawnAt ? [{ term: "Retirée le", value: `${formatDate(proposal.withdrawnAt)}${proposal.withdrawReason ? ` - ${proposal.withdrawReason}` : ""}` }] : [])
        ]}
      />
      <p className={styles.muted}>{proposal.nonContractualNotice}</p>
      {proposal.responses.length > 0 ? (
        <div className={styles.entry}>
          <h4 className={styles.entryTitle}>Réponses du visiteur</h4>
          <ol className="bo-list">
            {proposal.responses.map((response) => (
              <li key={response.id}>
                <span className="bo-ref">{formatDate(response.createdAt)}</span> - {VISITOR_RESPONSE_LABELS[response.type] ?? response.type}
                {response.callbackSlot ? ` (créneau : ${response.callbackSlot})` : ""}
                {response.declineReason ? ` (motif : ${DECLINE_REASON_LABELS[response.declineReason] ?? response.declineReason})` : ""}
                {response.question ? ` : « ${response.question} »` : ""}
              </li>
            ))}
          </ol>
          <p className={styles.muted}>La dernière réponse fait foi. Répondez par une nouvelle proposition ou hors plateforme.</p>
        </div>
      ) : null}
      {canWithdraw && proposal.status !== "withdrawn" ? (
        <div>
          <ConfirmDialog
            triggerLabel="Retirer cette proposition"
            title="Retirer la proposition"
            description="Une proposition envoyée n'est jamais modifiée. Retirez-la puis envoyez-en une nouvelle si besoin. Le visiteur ne la verra plus."
            confirmLabel="Retirer"
            cancelLabel="Annuler"
            tone="danger"
            formAction={withdrawProposalAction}
          >
            <input type="hidden" name="leadAssignmentId" value={leadAssignmentId} />
            <input type="hidden" name="proposalId" value={proposal.id} />
            <input type="hidden" name="channel" value={channel} />
            <Field id={`withdraw-reason-${proposal.id}`} label="Motif interne">
              <Input id={`withdraw-reason-${proposal.id}`} name="reason" maxLength={500} placeholder="Optionnel" aria-label="Motif du retrait" />
            </Field>
          </ConfirmDialog>
        </div>
      ) : null}
    </article>
  );
}

/**
 * Spec 055: "Repondre au visiteur" (Starter) et propositions CRM. Composeur (message, prime ou
 * fourchette, devise, garanties, validite, PDF facultatif), liste des propositions envoyees et
 * reponses du visiteur. L'envoi passe par un route handler serveur (jamais de jeton cote client).
 */
export function ProposalPanel({ channel, leadAssignmentId, data, canMutate, tenantReadOnly, suggestedStatusLabel }: ProposalPanelProps) {
  const action = channel === "crm" ? `/crm/leads/${leadAssignmentId}/proposals` : `/leads/${leadAssignmentId}/proposals`;
  const minDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  return (
    <Stack>
      <Notice tone="info" title="Proposition non contractuelle">
        {PROPOSAL_NON_CONTRACTUAL_NOTICE}. AssurMatch ne compare, ne classe ni ne recommande les propositions ; aucune signature ni aucun paiement.
      </Notice>
      {suggestedStatusLabel ? (
        <Notice tone="info" title="Statut suggéré">
          Le visiteur a répondu. Statut suivant suggéré : {suggestedStatusLabel}. Le statut CRM n'est jamais modifié automatiquement.
        </Notice>
      ) : null}
      {data.blockers.map((blocker) => (
        <Notice key={blocker} tone="warning">{PROPOSAL_BLOCKER_LABELS[blocker] ?? blocker}</Notice>
      ))}
      <div className={styles.entryHead}>
        <h3 className={styles.entryTitle}>Propositions envoyées</h3>
        <Badge tone={data.activeCount >= data.maxActive ? "warning" : "neutral"}>{`Propositions actives : ${data.activeCount} / ${data.maxActive}`}</Badge>
      </div>
      {data.items.length > 0 ? (
        <ul className="bo-list">
          {data.items.map((proposal) => (
            <li key={proposal.id}>
              <ProposalItem proposal={proposal} channel={channel} leadAssignmentId={leadAssignmentId} canWithdraw={canMutate} />
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>Aucune proposition envoyée pour ce lead. Le visiteur la retrouve dans son espace de suivi dès l&apos;envoi.</p>
      )}
      {canMutate || tenantReadOnly ? (
        <TenantWriteGuard readOnly={tenantReadOnly || !data.canSend}>
          <form action={action} method="post" encType="multipart/form-data" className={`bo-form bo-form--two ${styles.subsection}`} aria-label="Nouvelle proposition au visiteur">
            <FormRow full>
              <h3 className={styles.entryTitle}>Nouvelle proposition</h3>
            </FormRow>
            <FormRow full>
              <Field id={`${channel}-proposal-message`} label="Message au visiteur" required requiredLabel="obligatoire" hint={`${PROPOSAL_MESSAGE_MAX} caractères au maximum. Aucune promesse de souscription.`}>
                <Textarea id={`${channel}-proposal-message`} name="message" required maxLength={PROPOSAL_MESSAGE_MAX} rows={5} aria-label="Message de la proposition" />
              </Field>
            </FormRow>
            <Field id={`${channel}-proposal-min`} label="Prime indicative (ou minimum)">
              <Input id={`${channel}-proposal-min`} name="priceMin" type="number" min={0} step="any" inputMode="decimal" aria-label="Prime indicative minimum" />
            </Field>
            <Field id={`${channel}-proposal-max`} label="Maximum de la fourchette">
              <Input id={`${channel}-proposal-max`} name="priceMax" type="number" min={0} step="any" inputMode="decimal" aria-label="Prime indicative maximum" />
            </Field>
            <Field id={`${channel}-proposal-currency`} label="Devise" required requiredLabel="obligatoire">
              <Select id={`${channel}-proposal-currency`} name="currency" defaultValue="XOF" aria-label="Devise" options={PROPOSAL_CURRENCIES.map((currency) => ({ value: currency, label: currency }))} />
            </Field>
            <Field id={`${channel}-proposal-valid`} label="Valable jusqu'au" required requiredLabel="obligatoire">
              <Input id={`${channel}-proposal-valid`} name="validUntil" type="date" required min={minDate} aria-label="Date de validité" />
            </Field>
            <FormRow full>
              <Field id={`${channel}-proposal-guarantees`} label="Principales garanties" hint={`Une garantie par ligne, ${PROPOSAL_GUARANTEES_MAX} au maximum.`}>
                <Textarea id={`${channel}-proposal-guarantees`} name="guarantees" rows={4} aria-label="Principales garanties" />
              </Field>
            </FormRow>
            <FormRow full>
              <Field id={`${channel}-proposal-file`} label="PDF facultatif" hint="PDF, 5 Mo au maximum, analyse par l'antivirus.">
                <Input id={`${channel}-proposal-file`} name="file" type="file" accept="application/pdf" aria-label="Document PDF de la proposition" />
              </Field>
            </FormRow>
            <FormActions>
              <Button type="submit">Envoyer la proposition au visiteur</Button>
            </FormActions>
          </form>
        </TenantWriteGuard>
      ) : (
        <Notice tone="info" title="Lecture seule">Votre rôle ne permet pas d&apos;envoyer de proposition.</Notice>
      )}
    </Stack>
  );
}
