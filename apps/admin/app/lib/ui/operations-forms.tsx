"use client";

import { useActionState, useId, useState } from "react";
import {
  decideQuoteReviewAction,
  reassignLeadAssignmentAction,
  updateContactMessageStatusAction,
  type OperationsActionState
} from "../operations-actions";
import { ActionNotice, Button, Field, Form, FormActions, Input, Notice, Select, fieldControlProps } from "./admin-ui";

const initialState: OperationsActionState = { status: "idle" };

export interface ReviewCandidate {
  partnerTenantId: string;
  legalName: string;
  plan: string;
  eligible: boolean;
  reasons: string[];
}

const decisionLabels: Record<string, string> = {
  route: "Router par le moteur (regles et eligibilite)",
  assign: "Assigner a un courtier partenaire eligible",
  non_routable: "Marquer non routable",
  duplicate: "Marquer doublon"
};

/**
 * Spec 056 (H-02): one decision per request, with a mandatory audited reason. Only eligible
 * partners are offered for an assignment; the API re-checks eligibility and consent anyway.
 */
export function QuoteReviewForm({ quoteRequestId, candidates }: { quoteRequestId: string; candidates: ReviewCandidate[] }) {
  const [state, formAction, pending] = useActionState(decideQuoteReviewAction, initialState);
  const [decision, setDecision] = useState("route");
  const eligible = candidates.filter((candidate) => candidate.eligible);
  const base = useId();
  const ids = { decision: `${base}-decision`, partner: `${base}-partner`, duplicate: `${base}-duplicate`, reason: `${base}-reason` };

  return (
    <Form action={formAction} data-operations-form="quote-review">
      <ActionNotice state={state} />
      <input type="hidden" name="quoteRequestId" value={quoteRequestId} />
      <Field id={ids.decision} label="Decision" required>
        <Select
          {...fieldControlProps(ids.decision, { required: true })}
          name="decision"
          value={decision}
          onChange={(event) => setDecision(event.target.value)}
          options={Object.entries(decisionLabels).map(([value, label]) => ({ value, label }))}
        />
      </Field>
      {decision === "assign" ? (
        <Field id={ids.partner} label="Courtier partenaire eligible" required>
          <Select
            {...fieldControlProps(ids.partner, { required: true })}
            name="partnerTenantId"
            options={eligible.map((candidate) => ({ value: candidate.partnerTenantId, label: `${candidate.legalName} (${candidate.plan})` }))}
          />
        </Field>
      ) : null}
      {decision === "assign" && eligible.length === 0 ? (
        <Notice tone="danger">Aucun courtier partenaire eligible : verifier licences, autorisations et quotas.</Notice>
      ) : null}
      {decision === "duplicate" ? (
        <Field id={ids.duplicate} label="Reference de la demande d'origine (optionnelle)">
          <Input {...fieldControlProps(ids.duplicate)} name="duplicateOfReference" placeholder="QR-2026-XXXXXXXX" maxLength={64} />
        </Field>
      ) : null}
      <Field id={ids.reason} label="Motif (audite, 8 caracteres minimum)" required>
        <Input {...fieldControlProps(ids.reason, { required: true })} name="reason" minLength={8} maxLength={500} />
      </Field>
      <FormActions>
        <Button type="submit" size="sm" pending={pending} pendingLabel="Enregistrement..." disabled={decision === "assign" && eligible.length === 0}>
          Enregistrer la decision
        </Button>
      </FormActions>
    </Form>
  );
}

/** Spec 056 (H-03): reassignment through the existing service (eligibility, notification, audit). */
export function ReassignAssignmentForm({ assignmentId, partners }: { assignmentId: string; partners: Array<{ id: string; legalName: string }> }) {
  const [state, formAction, pending] = useActionState(reassignLeadAssignmentAction, initialState);
  const base = useId();
  const ids = { partner: `${base}-partner`, reason: `${base}-reason`, list: `${base}-partners` };

  return (
    <Form action={formAction} data-operations-form="reassign">
      <ActionNotice state={state} />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <Field id={ids.partner} label="Nouveau courtier partenaire (UUID)" required>
        <Input {...fieldControlProps(ids.partner, { required: true })} name="partnerTenantId" list={ids.list} />
      </Field>
      <datalist id={ids.list}>
        {partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.legalName}</option>)}
      </datalist>
      <Field id={ids.reason} label="Motif (audite)" required>
        <Input {...fieldControlProps(ids.reason, { required: true })} name="reason" minLength={8} maxLength={500} />
      </Field>
      <FormActions>
        <Button type="submit" size="sm" variant="secondary" pending={pending} pendingLabel="Reaffectation...">Reaffecter</Button>
      </FormActions>
    </Form>
  );
}

const contactStatusLabels: Record<string, string> = { new: "Nouveau", handled: "Traite", spam: "Spam" };

/** Spec 056 (H-04): status of a contact message; the transition is audited without the message body. */
export function ContactStatusForm({ messageId, current }: { messageId: string; current: string }) {
  const [state, formAction, pending] = useActionState(updateContactMessageStatusAction, initialState);
  const base = useId();
  const ids = { status: `${base}-status`, reason: `${base}-reason` };

  return (
    <Form action={formAction} data-operations-form="contact-status">
      <ActionNotice state={state} />
      <input type="hidden" name="messageId" value={messageId} />
      <Field id={ids.status} label="Statut" required>
        <Select
          {...fieldControlProps(ids.status, { required: true })}
          name="status"
          defaultValue={current}
          options={Object.entries(contactStatusLabels).map(([value, label]) => ({ value, label }))}
        />
      </Field>
      <Field id={ids.reason} label="Note interne (optionnelle)">
        <Input {...fieldControlProps(ids.reason)} name="reason" maxLength={500} />
      </Field>
      <FormActions>
        <Button type="submit" size="sm" variant="secondary" pending={pending} pendingLabel="Mise a jour...">Mettre a jour</Button>
      </FormActions>
    </Form>
  );
}
