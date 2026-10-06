"use client";

import { useActionState, useId } from "react";
import { toggleGlobalFeatureFlagAction, type CatalogActionState } from "../lib/catalog-actions";
import { CatalogActionResult } from "../lib/ui/catalog-action-result";
import { Button, Field, Form, FormActions, Input, fieldControlProps } from "../lib/ui/admin-ui";

const initialState: CatalogActionState = { status: "idle" };

/**
 * Spec 050: one global, non-sensitive flag, one form, one submit button (no `Switch`). The target
 * value is written explicitly; the server action and the API both refuse a sensitive key.
 */
export function GlobalFlagToggleForm({ flagId, flagKey, currentValue }: { flagId: string; flagKey: string; currentValue: boolean }) {
  const [state, formAction, pending] = useActionState(toggleGlobalFeatureFlagAction, initialState);
  const base = useId();
  const nextValue = !currentValue;
  return (
    <Form action={formAction} data-feature-flag-form={flagKey}>
      <CatalogActionResult state={state} />
      <input type="hidden" name="flagId" value={flagId} />
      <input type="hidden" name="key" value={flagKey} />
      <input type="hidden" name="value" value={String(nextValue)} />
      <Field id={`${base}-reason`} label="Motif (audite)" required>
        <Input {...fieldControlProps(`${base}-reason`, { required: true })} name="reason" minLength={8} />
      </Field>
      <FormActions>
        <Button type="submit" size="sm" variant={nextValue ? "primary" : "secondary"} pending={pending} pendingLabel="Envoi...">
          {nextValue ? "Activer" : "Desactiver"}
        </Button>
      </FormActions>
    </Form>
  );
}
