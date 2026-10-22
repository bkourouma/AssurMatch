"use client";

import { useActionState, useId, useState } from "react";
import { applyAiScopeFlagAction, type AiScopeFlagActionState } from "../../lib/ai-scope-flag-actions";
import { Button, Field, Form, FormActions, Input, Notice, Stack, fieldControlProps } from "../../lib/ui/admin-ui";

const initialState: AiScopeFlagActionState = { status: "idle" };

interface ScopeFlagFormProps {
  scopeType: "country" | "product";
  scopeId: string;
  scopeLabel: string;
  flagKey: string;
  currentValue: boolean;
  /** Set for a highly sensitive product: activation is refused by the API, so the button is disabled. */
  activationBlocked?: boolean;
}

/**
 * Spec 074 FR-006: one flag of one country or product. Enabling opens a form (policy reference,
 * approver, reason); disabling only asks for a reason. The API decides role, MFA and scope.
 */
export function ScopeFlagForm({ scopeType, scopeId, scopeLabel, flagKey, currentValue, activationBlocked = false }: ScopeFlagFormProps) {
  const [state, formAction, pending] = useActionState(applyAiScopeFlagAction, initialState);
  const [open, setOpen] = useState(false);
  const base = useId();
  const nextValue = !currentValue;
  const blocked = nextValue && activationBlocked;

  return (
    <Stack>
      {state.status !== "idle" ? <Notice tone={state.status === "success" ? "success" : "danger"}>{state.message}</Notice> : null}
      {!open ? (
        <>
          <Button
            type="button"
            size="sm"
            variant={nextValue ? "primary" : "secondary"}
            disabled={blocked}
            aria-label={`${nextValue ? "Activer" : "Desactiver"} ${flagKey} pour ${scopeLabel}`}
            onClick={() => setOpen(true)}
          >
            {nextValue ? "Activer" : "Desactiver"}
          </Button>
          {blocked ? <small className="bo-description">Produit hautement sensible : activation IA refusee sans exception documentee</small> : null}
        </>
      ) : (
        <Form action={formAction} data-ai-scope-flag-form={`${scopeType}:${scopeId}:${flagKey}`}>
          <input type="hidden" name="scopeType" value={scopeType} />
          <input type="hidden" name="scopeId" value={scopeId} />
          <input type="hidden" name="key" value={flagKey} />
          <input type="hidden" name="value" value={String(nextValue)} />
          {nextValue ? (
            <>
              <Notice tone="warning">Decision de conformite : l'activation est reservee aux roles super admin et conformite, avec MFA, et est auditee.</Notice>
              <Field id={`${base}-reference`} label="Reference de politique" required>
                <Input {...fieldControlProps(`${base}-reference`, { required: true })} name="reference" minLength={3} maxLength={120} />
              </Field>
              <Field id={`${base}-approvedBy`} label="Approbateur" required>
                <Input {...fieldControlProps(`${base}-approvedBy`, { required: true })} name="approvedBy" minLength={3} maxLength={120} />
              </Field>
            </>
          ) : null}
          <Field id={`${base}-reason`} label="Motif (audite)" required>
            <Input {...fieldControlProps(`${base}-reason`, { required: true })} name="reason" minLength={8} maxLength={500} />
          </Field>
          <FormActions>
            <Button type="submit" size="sm" variant={nextValue ? "primary" : "secondary"} pending={pending} pendingLabel="Envoi...">
              {nextValue ? "Confirmer l'activation" : "Confirmer la desactivation"}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>Annuler</Button>
          </FormActions>
        </Form>
      )}
    </Stack>
  );
}
