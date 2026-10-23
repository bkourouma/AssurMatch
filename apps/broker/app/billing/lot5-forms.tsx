"use client";

import { useActionState, useId } from "react";
import { ActionNotice, Button, Field, Form, FormActions, Select, Textarea, fieldControlProps } from "../lib/ui/broker-ui";
import { cancelPlanChangeAction, requestPlanChangeAction, type PlanChangeActionState } from "./lot5-actions";
import { PLAN_CHANGE_JUSTIFICATION_MAX_LENGTH, PLAN_CHANGE_JUSTIFICATION_MIN_LENGTH, PLAN_LABELS } from "./lot5-labels";

const initialState: PlanChangeActionState = { status: "idle" };

export function PlanChangeRequestForm({ currentPlan, disabled }: { currentPlan: string | undefined; disabled: boolean }) {
  const [state, formAction, pending] = useActionState(requestPlanChangeAction, initialState);
  const base = useId();
  const ids = { plan: `${base}-plan`, justification: `${base}-justification` };
  const options = Object.entries(PLAN_LABELS)
    .filter(([value]) => value !== currentPlan)
    .map(([value, label]) => ({ value, label }));

  return (
    <Form action={formAction} data-billing-form="plan-change">
      <ActionNotice state={state} />
      <Field id={ids.plan} label="Plan souhaité" required>
        <Select {...fieldControlProps(ids.plan, { required: true })} name="requestedPlan" defaultValue="" placeholder="Choisir un plan" options={options} disabled={disabled} />
      </Field>
      <Field id={ids.justification} label={`Justification (${PLAN_CHANGE_JUSTIFICATION_MIN_LENGTH} caractères au minimum)`} required>
        <Textarea
          {...fieldControlProps(ids.justification, { required: true })}
          name="justification"
          rows={3}
          minLength={PLAN_CHANGE_JUSTIFICATION_MIN_LENGTH}
          maxLength={PLAN_CHANGE_JUSTIFICATION_MAX_LENGTH}
          disabled={disabled}
        />
      </Field>
      <FormActions>
        <Button type="submit" pending={pending} pendingLabel="Envoi..." disabled={disabled}>Envoyer la demande</Button>
      </FormActions>
    </Form>
  );
}

export function CancelPlanChangeForm({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState(cancelPlanChangeAction, initialState);

  return (
    <Form action={formAction} data-billing-form="plan-change-cancel">
      <ActionNotice state={state} />
      <input type="hidden" name="requestId" value={requestId} />
      <FormActions>
        <Button type="submit" size="sm" variant="secondary" pending={pending} pendingLabel="Annulation...">Annuler la demande</Button>
      </FormActions>
    </Form>
  );
}
