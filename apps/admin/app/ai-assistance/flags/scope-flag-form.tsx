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
 * Spec 074 FR-006 (disable-only, supervisor decision pending the owner's arbitration on a derogation
 * to specs 035 and 050): an active flag can be disabled here with a reason; an inactive flag shows
 * the read-only operations procedure instead of an Activate button. The API decides role, MFA and scope.
 */
export function ScopeFlagForm({ scopeType, scopeId, scopeLabel, flagKey, currentValue, activationBlocked = false }: ScopeFlagFormProps) {
  const [state, formAction, pending] = useActionState(applyAiScopeFlagAction, initialState);
  const [open, setOpen] = useState(false);
  const base = useId();

  if (!currentValue) {
    return (
      <Stack>
        {state.status === "success" ? <Notice tone="success">{state.message}</Notice> : null}
        {activationBlocked ? (
          <small className="bo-description">Produit hautement sensible : activation IA refusée sans exception documentée</small>
        ) : (
          <small className="bo-description">
            Activation par la commande d'exploitation uniquement (décision de conformité, référence de politique et approbateur) :
            <pre><code>{`npm run ops:apply-flag-policy -- --flag ${flagKey} --scope-type ${scopeType} --scope-id ${scopeId} --value true --reference <référence de politique> --approved-by "<nom, rôle>" --reason "<motif>"`}</code></pre>
          </small>
        )}
      </Stack>
    );
  }

  return (
    <Stack>
      {state.status !== "idle" ? <Notice tone={state.status === "success" ? "success" : "danger"}>{state.message}</Notice> : null}
      {!open ? (
        <Button type="button" size="sm" variant="secondary" aria-label={`Désactiver ${flagKey} pour ${scopeLabel}`} onClick={() => setOpen(true)}>
          Désactiver
        </Button>
      ) : (
        <Form action={formAction} data-ai-scope-flag-form={`${scopeType}:${scopeId}:${flagKey}`}>
          <input type="hidden" name="scopeType" value={scopeType} />
          <input type="hidden" name="scopeId" value={scopeId} />
          <input type="hidden" name="key" value={flagKey} />
          <input type="hidden" name="value" value="false" />
          <Field id={`${base}-reason`} label="Motif (audité)" required>
            <Input {...fieldControlProps(`${base}-reason`, { required: true })} name="reason" minLength={8} maxLength={500} />
          </Field>
          <FormActions>
            <Button type="submit" size="sm" variant="secondary" pending={pending} pendingLabel="Envoi...">Confirmer la désactivation</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>Annuler</Button>
          </FormActions>
        </Form>
      )}
    </Stack>
  );
}
