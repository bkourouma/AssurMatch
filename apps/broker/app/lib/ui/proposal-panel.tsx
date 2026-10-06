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
import { Badge, Button, Card, Cluster, ConfirmDialog, DescriptionList, Field, FormActions, Input, Notice, Select, Stack, Textarea, TenantWriteGuard } from "./broker-ui";
import { formatDate } from "./broker-view-models";

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

function ProposalItem({ proposal, channel, leadAssignmentId, canWithdraw }: { proposal: BrokerProposalData; channel: "starter" | "crm"; leadAssignmentId: string; canWithdraw: boolean }) {
  return (
    <Card as="article" muted title={`Proposition du ${formatDate(proposal.sentAt)}`} actions={<Badge tone={STATUS_TONES[proposal.status] ?? "neutral"}>{PROPOSAL_STATUS_LABELS[proposal.status] ?? proposal.status}</Badge>}>
      <Stack>
        <p style={{ whiteSpace: "pre-wrap" }}>{proposal.message}</p>
        <DescriptionList
          items={[
            { term: "Prime indicative", value: formatPremium(proposal.priceMin, proposal.priceMax, proposal.currency) },
            { term: "Valable jusqu'au", value: formatDate(proposal.validUntil) },
            { term: "Garanties principales", value: proposal.guarantees.length > 0 ? proposal.guarantees.join(", ") : "Non precisees" },
            {
              term: "Document",
              value: proposal.document
                ? <a href={documentHref(channel, leadAssignmentId, proposal.id)}>{proposal.document.fileName}</a>
                : "Aucun"
            },
            ...(proposal.viewedAt ? [{ term: "Vue par le visiteur", value: formatDate(proposal.viewedAt) }] : []),
            ...(proposal.withdrawnAt ? [{ term: "Retiree le", value: `${formatDate(proposal.withdrawnAt)}${proposal.withdrawReason ? ` - ${proposal.withdrawReason}` : ""}` }] : [])
          ]}
        />
        <p><small>{proposal.nonContractualNotice}</small></p>
        {proposal.responses.length > 0 ? (
          <div>
            <h3 className="bo-section-title">Reponses du visiteur</h3>
            <ol>
              {proposal.responses.map((response) => (
                <li key={response.id}>
                  {formatDate(response.createdAt)} - {VISITOR_RESPONSE_LABELS[response.type] ?? response.type}
                  {response.callbackSlot ? ` (creneau : ${response.callbackSlot})` : ""}
                  {response.declineReason ? ` (motif : ${DECLINE_REASON_LABELS[response.declineReason] ?? response.declineReason})` : ""}
                  {response.question ? ` : « ${response.question} »` : ""}
                </li>
              ))}
            </ol>
            <p><small>La derniere reponse fait foi. Repondez par une nouvelle proposition ou hors plateforme.</small></p>
          </div>
        ) : null}
        {canWithdraw && proposal.status !== "withdrawn" ? (
          <ConfirmDialog
            triggerLabel="Retirer cette proposition"
            title="Retirer la proposition"
            description="Une proposition envoyee n'est jamais modifiee. Retirez-la puis envoyez-en une nouvelle si besoin. Le visiteur ne la verra plus."
            confirmLabel="Retirer"
            cancelLabel="Annuler"
            formAction={withdrawProposalAction}
          >
            <input type="hidden" name="leadAssignmentId" value={leadAssignmentId} />
            <input type="hidden" name="proposalId" value={proposal.id} />
            <input type="hidden" name="channel" value={channel} />
            <Field id={`withdraw-reason-${proposal.id}`} label="Motif interne">
              <Input id={`withdraw-reason-${proposal.id}`} name="reason" maxLength={500} placeholder="Optionnel" aria-label="Motif du retrait" />
            </Field>
          </ConfirmDialog>
        ) : null}
      </Stack>
    </Card>
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
        <Notice tone="info" title="Statut suggere">
          Le visiteur a repondu. Statut suivant suggere : {suggestedStatusLabel}. Le statut CRM n'est jamais modifie automatiquement.
        </Notice>
      ) : null}
      {data.blockers.map((blocker) => (
        <Notice key={blocker} tone="warning">{PROPOSAL_BLOCKER_LABELS[blocker] ?? blocker}</Notice>
      ))}
      <p>Propositions actives : {data.activeCount} / {data.maxActive}</p>
      {data.items.length > 0 ? (
        data.items.map((proposal) => (
          <ProposalItem key={proposal.id} proposal={proposal} channel={channel} leadAssignmentId={leadAssignmentId} canWithdraw={canMutate} />
        ))
      ) : (
        <p>Aucune proposition envoyee pour ce lead.</p>
      )}
      {canMutate || tenantReadOnly ? (
        <TenantWriteGuard readOnly={tenantReadOnly || !data.canSend}>
          <form action={action} method="post" encType="multipart/form-data" className="bo-form" aria-label="Nouvelle proposition au visiteur">
            <Field id={`${channel}-proposal-message`} label="Message au visiteur" required requiredLabel="obligatoire" hint={`${PROPOSAL_MESSAGE_MAX} caracteres au maximum. Aucune promesse de souscription.`}>
              <Textarea id={`${channel}-proposal-message`} name="message" required maxLength={PROPOSAL_MESSAGE_MAX} rows={5} aria-label="Message de la proposition" />
            </Field>
            <Cluster>
              <Field id={`${channel}-proposal-min`} label="Prime indicative (ou minimum)">
                <Input id={`${channel}-proposal-min`} name="priceMin" type="number" min={0} step="any" inputMode="decimal" aria-label="Prime indicative minimum" />
              </Field>
              <Field id={`${channel}-proposal-max`} label="Maximum de la fourchette">
                <Input id={`${channel}-proposal-max`} name="priceMax" type="number" min={0} step="any" inputMode="decimal" aria-label="Prime indicative maximum" />
              </Field>
              <Field id={`${channel}-proposal-currency`} label="Devise" required requiredLabel="obligatoire">
                <Select id={`${channel}-proposal-currency`} name="currency" defaultValue="XOF" aria-label="Devise" options={PROPOSAL_CURRENCIES.map((currency) => ({ value: currency, label: currency }))} />
              </Field>
            </Cluster>
            <Field id={`${channel}-proposal-guarantees`} label="Principales garanties" hint={`Une garantie par ligne, ${PROPOSAL_GUARANTEES_MAX} au maximum.`}>
              <Textarea id={`${channel}-proposal-guarantees`} name="guarantees" rows={4} aria-label="Principales garanties" />
            </Field>
            <Cluster>
              <Field id={`${channel}-proposal-valid`} label="Valable jusqu'au" required requiredLabel="obligatoire">
                <Input id={`${channel}-proposal-valid`} name="validUntil" type="date" required min={minDate} aria-label="Date de validite" />
              </Field>
              <Field id={`${channel}-proposal-file`} label="PDF facultatif" hint="PDF, 5 Mo au maximum, analyse par l'antivirus.">
                <Input id={`${channel}-proposal-file`} name="file" type="file" accept="application/pdf" aria-label="Document PDF de la proposition" />
              </Field>
            </Cluster>
            <FormActions>
              <Button type="submit">Envoyer la proposition au visiteur</Button>
            </FormActions>
          </form>
        </TenantWriteGuard>
      ) : (
        <Notice tone="info" title="Lecture seule">Votre role ne permet pas d'envoyer de proposition.</Notice>
      )}
    </Stack>
  );
}
