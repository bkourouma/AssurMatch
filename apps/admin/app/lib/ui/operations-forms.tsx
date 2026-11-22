"use client";

import { useActionState, useId, useState } from "react";
import {
  decideQuoteReviewAction,
  reassignLeadAssignmentAction,
  updateContactMessageStatusAction,
  type OperationsActionState
} from "../operations-actions";
import { REASON_MAX_LENGTH, REASON_MIN_LENGTH } from "../operations-validation";
import { ActionNotice, Button, Field, Form, FormActions, Input, Notice, Select, fieldControlProps } from "./admin-ui";

const initialState: OperationsActionState = { status: "idle" };

/** Same wording on every audited, mandatory reason of the operations consoles. */
const REASON_LABEL = `Motif (obligatoire, audité, ${REASON_MIN_LENGTH} caractères minimum)`;
const REASON_HINT = `Entre ${REASON_MIN_LENGTH} et ${REASON_MAX_LENGTH} caractères. Conservé dans le journal d'audit.`;

export interface ReviewCandidate {
  partnerTenantId: string;
  legalName: string;
  plan: string;
  eligible: boolean;
  reasons: string[];
}

const decisionLabels: Record<string, string> = {
  route: "Router par le moteur (règles et éligibilité)",
  assign: "Assigner à un courtier partenaire éligible",
  non_routable: "Marquer non routable",
  duplicate: "Marquer doublon"
};

/** The button names the decision it is about to record, so the operator never submits a generic "OK". */
const decisionSubmitLabels: Record<string, string> = {
  route: "Router la demande",
  assign: "Assigner la demande",
  non_routable: "Marquer non routable",
  duplicate: "Marquer comme doublon"
};

/**
 * Spec 056 (H-02): one decision per request, with a mandatory audited reason. Only eligible
 * partners are offered for an assignment; the API re-checks eligibility and consent anyway.
 */
export function QuoteReviewForm({ quoteRequestId, candidates, reference }: { quoteRequestId: string; candidates: ReviewCandidate[]; reference?: string | undefined }) {
  const [state, formAction, pending] = useActionState(decideQuoteReviewAction, initialState);
  const [decision, setDecision] = useState("route");
  const eligible = candidates.filter((candidate) => candidate.eligible);
  const base = useId();
  const ids = { decision: `${base}-decision`, partner: `${base}-partner`, duplicate: `${base}-duplicate`, reason: `${base}-reason` };
  const subject = reference ? `la demande ${reference}` : "cette demande";
  const partnerHint = `${eligible.length} courtier(s) éligible(s) sur ${candidates.length} évalué(s).`;
  const sensitive = decision === "non_routable" || decision === "duplicate";

  return (
    <Form action={formAction} data-operations-form="quote-review">
      <ActionNotice state={state} />
      <input type="hidden" name="quoteRequestId" value={quoteRequestId} />
      <Field id={ids.decision} label="Décision" required requiredLabel="obligatoire">
        <Select
          {...fieldControlProps(ids.decision, { required: true })}
          name="decision"
          value={decision}
          onChange={(event) => setDecision(event.target.value)}
          options={Object.entries(decisionLabels).map(([value, label]) => ({ value, label }))}
        />
      </Field>
      {decision === "assign" ? (
        <Field id={ids.partner} label="Courtier partenaire éligible" required requiredLabel="obligatoire" hint={partnerHint}>
          <Select
            {...fieldControlProps(ids.partner, { required: true, hint: partnerHint })}
            name="partnerTenantId"
            options={eligible.map((candidate) => ({ value: candidate.partnerTenantId, label: `${candidate.legalName} (${candidate.plan})` }))}
          />
        </Field>
      ) : null}
      {decision === "assign" && eligible.length === 0 ? (
        <Notice tone="danger">Aucun courtier partenaire éligible : vérifier licences, autorisations et quotas.</Notice>
      ) : null}
      {decision === "duplicate" ? (
        <Field id={ids.duplicate} label="Référence de la demande d'origine (optionnelle)">
          <Input {...fieldControlProps(ids.duplicate)} name="duplicateOfReference" placeholder="QR-2026-XXXXXXXX" maxLength={64} />
        </Field>
      ) : null}
      {sensitive ? (
        <Notice tone="warning">
          {decision === "non_routable"
            ? `Vous allez marquer ${subject} comme non routable. La décision et son motif sont journalisés.`
            : `Vous allez marquer ${subject} comme doublon. La décision et son motif sont journalisés.`}
        </Notice>
      ) : null}
      <Field id={ids.reason} label={REASON_LABEL} required requiredLabel="obligatoire" hint={REASON_HINT}>
        <Input {...fieldControlProps(ids.reason, { required: true, hint: REASON_HINT })} name="reason" minLength={REASON_MIN_LENGTH} maxLength={REASON_MAX_LENGTH} />
      </Field>
      <FormActions>
        <Button
          type="submit"
          size="sm"
          variant={sensitive ? "secondary" : "primary"}
          pending={pending}
          pendingLabel="Enregistrement..."
          disabled={decision === "assign" && eligible.length === 0}
        >
          {decisionSubmitLabels[decision] ?? "Enregistrer la décision"}
        </Button>
      </FormActions>
    </Form>
  );
}

/** Spec 056 (H-03): reassignment through the existing service (eligibility, notification, audit). */
export function ReassignAssignmentForm({
  assignmentId,
  partners,
  reference,
  currentPartnerName
}: {
  assignmentId: string;
  partners: Array<{ id: string; legalName: string }>;
  /** Public reference of the request, named in the form so the operator sees what moves. */
  reference?: string | undefined;
  /** Broker the lead is taken away from. */
  currentPartnerName?: string | undefined;
}) {
  const [state, formAction, pending] = useActionState(reassignLeadAssignmentAction, initialState);
  const base = useId();
  const ids = { partner: `${base}-partner`, reason: `${base}-reason`, list: `${base}-partners`, context: `${base}-context` };
  const partnerHint = "Choisissez dans la liste proposée (courtiers visibles sur cette page) ou collez l'identifiant du courtier.";
  const context = `Réaffectation${reference ? ` de la demande ${reference}` : ""}${currentPartnerName ? ` (courtier actuel : ${currentPartnerName})` : ""}. Le nouveau courtier doit être éligible ; l'ancien perd l'accès au lead. Action auditée.`;

  return (
    <Form action={formAction} data-operations-form="reassign" aria-describedby={ids.context}>
      <ActionNotice state={state} />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <p className="bo-description" id={ids.context}>{context}</p>
      <Field id={ids.partner} label="Nouveau courtier partenaire" required requiredLabel="obligatoire" hint={partnerHint}>
        <Input {...fieldControlProps(ids.partner, { required: true, hint: partnerHint })} name="partnerTenantId" list={ids.list} autoComplete="off" />
      </Field>
      <datalist id={ids.list}>
        {partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.legalName}</option>)}
      </datalist>
      <Field id={ids.reason} label={REASON_LABEL} required requiredLabel="obligatoire" hint={REASON_HINT}>
        <Input {...fieldControlProps(ids.reason, { required: true, hint: REASON_HINT })} name="reason" minLength={REASON_MIN_LENGTH} maxLength={REASON_MAX_LENGTH} />
      </Field>
      <FormActions>
        <Button type="submit" size="sm" variant="secondary" pending={pending} pendingLabel="Réaffectation...">Réaffecter</Button>
      </FormActions>
    </Form>
  );
}

const contactStatusLabels: Record<string, string> = { new: "Nouveau", handled: "Traité", spam: "Spam" };

/** Spec 056 (H-04): status of a contact message; the transition is audited without the message body. */
export function ContactStatusForm({ messageId, current }: { messageId: string; current: string }) {
  const [state, formAction, pending] = useActionState(updateContactMessageStatusAction, initialState);
  const base = useId();
  const ids = { status: `${base}-status`, reason: `${base}-reason` };
  const noteHint = "Visible dans le journal d'audit, sans le corps du message.";

  return (
    <Form action={formAction} data-operations-form="contact-status">
      <ActionNotice state={state} />
      <input type="hidden" name="messageId" value={messageId} />
      <Field id={ids.status} label="Statut" required requiredLabel="obligatoire">
        <Select
          {...fieldControlProps(ids.status, { required: true })}
          name="status"
          defaultValue={current}
          options={Object.entries(contactStatusLabels).map(([value, label]) => ({ value, label }))}
        />
      </Field>
      <Field id={ids.reason} label="Note interne (optionnelle)" hint={noteHint}>
        <Input {...fieldControlProps(ids.reason, { hint: noteHint })} name="reason" maxLength={REASON_MAX_LENGTH} />
      </Field>
      <FormActions>
        <Button type="submit" size="sm" variant="secondary" pending={pending} pendingLabel="Enregistrement...">Enregistrer le statut</Button>
      </FormActions>
    </Form>
  );
}
