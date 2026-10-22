"use client";

import { useActionState, useId } from "react";
import { attestActivationControlAction, revokeActivationAttestationAction } from "../lib/lot4-catalog-actions";
import type { CatalogActionState } from "../lib/catalog-actions";
import { ACTIVATION_ATTESTATION_NOTE_MAX_LENGTH } from "../../../../packages/shared/contracts/activation-checklist.contracts";
import { CatalogActionResult } from "../lib/ui/catalog-action-result";
import { Button, Field, Form, FormActions, Input, Textarea, fieldControlProps } from "../lib/ui/admin-ui";

/**
 * Spec 070 PRD 35/36: attest or revoke a manual activation control. Shown only to compliance
 * roles by the page; the API enforces the role and MFA anyway.
 */
const initialState: CatalogActionState = { status: "idle" };

interface AttestationTarget {
  scopeType: string;
  scopeId: string;
  controlKey: string;
}

function TargetFields({ target }: { target: AttestationTarget }) {
  return (
    <>
      <input type="hidden" name="scopeType" value={target.scopeType} />
      <input type="hidden" name="scopeId" value={target.scopeId} />
      <input type="hidden" name="controlKey" value={target.controlKey} />
    </>
  );
}

export function AttestControlForm({ target, minNoteLength }: { target: AttestationTarget; minNoteLength: number }) {
  const [state, formAction, pending] = useActionState(attestActivationControlAction, initialState);
  const base = useId();
  return (
    <Form action={formAction} data-attestation-form="attest">
      <CatalogActionResult state={state} />
      <TargetFields target={target} />
      <Field
        id={`${base}-note`}
        label="Note d'attestation"
        required
        hint={`Au moins ${minNoteLength} caractères : référence du document ou du lien de preuve, sans donnée personnelle.`}
      >
        <Textarea
          {...fieldControlProps(`${base}-note`, { required: true, hint: "x" })}
          name="note"
          rows={2}
          minLength={minNoteLength}
          maxLength={ACTIVATION_ATTESTATION_NOTE_MAX_LENGTH}
        />
      </Field>
      <FormActions>
        <Button type="submit" size="sm" pending={pending} pendingLabel="Enregistrement...">Attester</Button>
      </FormActions>
    </Form>
  );
}

export function RevokeAttestationForm({ target }: { target: AttestationTarget }) {
  const [state, formAction, pending] = useActionState(revokeActivationAttestationAction, initialState);
  const base = useId();
  return (
    <Form action={formAction} data-attestation-form="revoke">
      <CatalogActionResult state={state} />
      <TargetFields target={target} />
      <Field id={`${base}-reason`} label="Motif de révocation" required hint="Au moins 8 caractères, conservé dans le journal d'audit.">
        <Input {...fieldControlProps(`${base}-reason`, { required: true, hint: "x" })} name="reason" minLength={8} />
      </Field>
      <FormActions>
        <Button type="submit" size="sm" variant="secondary" pending={pending} pendingLabel="Révocation...">Révoquer l&apos;attestation</Button>
      </FormActions>
    </Form>
  );
}
