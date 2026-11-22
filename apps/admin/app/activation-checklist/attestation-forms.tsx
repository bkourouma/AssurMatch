"use client";

import { useActionState, useId } from "react";
import { attestActivationControlAction, revokeActivationAttestationAction } from "../lib/lot4-catalog-actions";
import type { CatalogActionState } from "../lib/catalog-actions";
import { ACTIVATION_ATTESTATION_NOTE_MAX_LENGTH } from "../../../../packages/shared/contracts/activation-checklist.contracts";
import { CatalogActionResult } from "../lib/ui/catalog-action-result";
import { Button, Checkbox, Field, Form, FormActions, Input, Textarea, fieldControlProps } from "../lib/ui/admin-ui";

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

export function AttestControlForm({ target, minNoteLength, controlLabel }: { target: AttestationTarget; minNoteLength: number; controlLabel: string }) {
  const [state, formAction, pending] = useActionState(attestActivationControlAction, initialState);
  const base = useId();
  return (
    <Form action={formAction} data-attestation-form="attest">
      <CatalogActionResult state={state} />
      <TargetFields target={target} />
      <Field
        id={`${base}-note`}
        label={`Note d'attestation (obligatoire) : ${controlLabel}`}
        required
        hint={`Au moins ${minNoteLength} caractères : référence du document ou du lien de preuve, sans donnée personnelle. L'attestation est journalisée à votre nom.`}
      >
        <Textarea
          {...fieldControlProps(`${base}-note`, { required: true, hint: "x" })}
          name="note"
          rows={2}
          minLength={minNoteLength}
          maxLength={ACTIVATION_ATTESTATION_NOTE_MAX_LENGTH}
        />
      </Field>
      {/* No `name`: the confirmation is never submitted, it only gates the button. */}
      <Checkbox id={`${base}-confirm`} required label={`Je confirme que le contrôle « ${controlLabel} » est satisfait.`} />
      <FormActions>
        <Button type="submit" size="sm" pending={pending} pendingLabel="Enregistrement...">Attester</Button>
      </FormActions>
    </Form>
  );
}

export function RevokeAttestationForm({ target, controlLabel }: { target: AttestationTarget; controlLabel: string }) {
  const [state, formAction, pending] = useActionState(revokeActivationAttestationAction, initialState);
  const base = useId();
  return (
    <Form action={formAction} data-attestation-form="revoke">
      <CatalogActionResult state={state} />
      <TargetFields target={target} />
      <Field id={`${base}-reason`} label={`Motif de révocation (obligatoire) : ${controlLabel}`} required hint="Au moins 8 caractères, conservé dans le journal d'audit.">
        <Input {...fieldControlProps(`${base}-reason`, { required: true, hint: "x" })} name="reason" minLength={8} />
      </Field>
      <Checkbox id={`${base}-confirm`} required label={`Je confirme révoquer l'attestation du contrôle « ${controlLabel} ».`} />
      <FormActions>
        <Button type="submit" size="sm" variant="secondary" pending={pending} pendingLabel="Révocation...">Révoquer l&apos;attestation</Button>
      </FormActions>
    </Form>
  );
}
