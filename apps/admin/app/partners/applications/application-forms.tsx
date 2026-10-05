"use client";

import { useActionState, useId } from "react";
import {
  convertApplicationAction,
  rejectApplicationAction,
  reviewApplicationAction,
  type PartnerActionState
} from "../../lib/partner-actions";
import { REJECTION_REASON_LABELS, REJECTION_REASON_OPTIONS } from "../../lib/partner-messages";
import { ConfirmDialog, Field, Form, FormActions, Button, Input, Select, fieldControlProps } from "../../lib/ui/admin-ui";
import { PartnerActionResult } from "../partner-forms";

/**
 * Spec 051 US5/US7: application decisions. `review` needs `partner_applications:review`; `convert`
 * and `reject` are compliance only (compliance_admin, super_admin) and final. Every form carries the
 * audited reason ("Motif (audite)").
 */
const initialState: PartnerActionState = { status: "idle" };

function ReasonField({ id }: { id: string }) {
  return (
    <Field id={id} label="Motif (audite)" required hint="Au moins 8 caractères, conservé dans le journal d'audit.">
      <Input {...fieldControlProps(id, { required: true, hint: "x" })} name="reason" minLength={8} />
    </Field>
  );
}

export function ReviewApplicationForm({ applicationId }: { applicationId: string }) {
  const [state, formAction, pending] = useActionState(reviewApplicationAction, initialState);
  const base = useId();
  return (
    <Form action={formAction} data-application-form="review">
      <PartnerActionResult state={state} />
      <input type="hidden" name="applicationId" value={applicationId} />
      <ReasonField id={`${base}-reason`} />
      <FormActions>
        <Button type="submit" pending={pending} pendingLabel="Envoi...">Passer en examen</Button>
      </FormActions>
    </Form>
  );
}

/** Compliance only. On success the server action opens the new partner page. */
export function ConvertApplicationForm({ applicationId }: { applicationId: string }) {
  const [state, formAction] = useActionState(convertApplicationAction, initialState);
  const base = useId();
  return (
    <div data-compliance-only="application-convert">
      <PartnerActionResult state={state} />
      <ConfirmDialog
        triggerLabel="Convertir en courtier"
        triggerVariant="primary"
        title="Convertir la candidature"
        description="Crée un courtier Prospect et une licence brouillon à partir de la candidature. Aucune activation : la fiche doit ensuite être complétée et vérifiée. Décision définitive."
        confirmLabel="Convertir"
        cancelLabel="Annuler"
        formAction={formAction}
        dataAttributes={{ "data-application-form": "convert" }}
      >
        <PartnerActionResult state={state} />
        <input type="hidden" name="applicationId" value={applicationId} />
        <ReasonField id={`${base}-reason`} />
      </ConfirmDialog>
    </div>
  );
}

const reasonChoices = REJECTION_REASON_OPTIONS.map((code) => ({ value: code, label: REJECTION_REASON_LABELS[code] ?? code }));

/** Compliance only. The candidate receives a neutral e-mail, never the internal note. */
export function RejectApplicationForm({ applicationId }: { applicationId: string }) {
  const [state, formAction] = useActionState(rejectApplicationAction, initialState);
  const base = useId();
  return (
    <div data-compliance-only="application-reject">
      <PartnerActionResult state={state} />
      <ConfirmDialog
        triggerLabel="Refuser la candidature"
        triggerVariant="danger"
        title="Refuser la candidature"
        description="Décision définitive. Le candidat reçoit un e-mail neutre avec sa référence, sans la note interne."
        confirmLabel="Refuser"
        cancelLabel="Annuler"
        tone="danger"
        formAction={formAction}
        dataAttributes={{ "data-application-form": "reject" }}
      >
        <PartnerActionResult state={state} />
        <input type="hidden" name="applicationId" value={applicationId} />
        <Field id={`${base}-code`} label="Motif de refus" required>
          <Select {...fieldControlProps(`${base}-code`, { required: true })} name="rejectionReasonCode" options={reasonChoices} placeholder="Choisir un motif" />
        </Field>
        <ReasonField id={`${base}-reason`} />
      </ConfirmDialog>
    </div>
  );
}
