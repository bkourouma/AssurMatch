"use client";

import { useActionState } from "react";
import {
  Button,
  Card,
  Checkbox,
  Field,
  Form,
  FormActions,
  Input,
  Notice,
  Select,
  Stack
} from "./lib/ui/broker-ui";
import {
  activateAction,
  enrollMfaAction,
  passwordChangeAction,
  passwordResetConsumeAction,
  revokeTrustedDevicesAction,
  verifyMfaAction,
  type AuthFlowState
} from "./lib/auth-flow-actions";

const initialAuthFlowState: AuthFlowState = { status: "idle" };

/** Rendu uniforme d'un resultat d'action d'authentification: rien tant que l'etat est inactif. */
function FlowNotice({ state }: { state: AuthFlowState }) {
  if (state.status === "idle") return null;
  return (
    <Notice tone={state.status === "error" ? "danger" : "success"}>
      <p>{state.message}</p>
      {state.secret ? <p>Secret TOTP: <code>{state.secret}</code></p> : null}
      {state.otpauthUri ? <p>URI: <code>{state.otpauthUri}</code></p> : null}
      {state.backupCodes?.length ? (
        <ul>
          {state.backupCodes.map((code) => <li key={code}><code>{code}</code></li>)}
        </ul>
      ) : null}
    </Notice>
  );
}

export function ActivationForm({ returnTo, token }: { returnTo: string; token: string }) {
  const [state, formAction, pending] = useActionState(activateAction, initialAuthFlowState);
  return (
    <Form action={formAction}>
      <input type="hidden" name="returnTo" value={returnTo} />
      <FlowNotice state={state} />
      <Field id="activate-token" label="Jeton activation" required requiredLabel="obligatoire">
        <Input id="activate-token" name="token" defaultValue={token} required />
      </Field>
      <Field id="activate-password" label="Nouveau mot de passe" required requiredLabel="obligatoire" hint="12 caractères minimum.">
        <Input id="activate-password" name="password" type="password" autoComplete="new-password" required minLength={12} />
      </Field>
      <FormActions>
        <Button type="submit" pending={pending} pendingLabel="Activation..." fullWidth>
          Activer et continuer vers MFA
        </Button>
      </FormActions>
    </Form>
  );
}

/**
 * MFA enrolment + verification. Spec 063 (FR-A11): once a secret is enrolled and the session is not MFA-verified,
 * only the verification form is offered (the API refuses re-enrolment to such a session). A verified user who
 * manages the account passes `showEnrollment` to keep the re-enrolment form.
 */
export function MfaPanel({ returnTo, mfaEnrolled = false, showEnrollment }: { returnTo: string; mfaEnrolled?: boolean; showEnrollment?: boolean }) {
  const [enrollState, enrollAction, enrollPending] = useActionState(enrollMfaAction, initialAuthFlowState);
  const [verifyState, verifyAction, verifyPending] = useActionState(verifyMfaAction, initialAuthFlowState);
  // Keep the form mounted once an enrolment was attempted so the one-time secret stays visible.
  const enrollmentVisible = (showEnrollment ?? !mfaEnrolled) || enrollState.status !== "idle";
  return (
    <Stack>
      {enrollmentVisible ? (
        <Card title="Enrôlement MFA">
          <Form action={enrollAction}>
            <FlowNotice state={enrollState} />
            <FormActions>
              <Button type="submit" variant="secondary" pending={enrollPending} pendingLabel="Generation...">
                Générer secret et codes de secours
              </Button>
            </FormActions>
          </Form>
        </Card>
      ) : null}
      <Card title="Vérification MFA">
        <Form action={verifyAction}>
          <input type="hidden" name="returnTo" value={returnTo} />
          <FlowNotice state={verifyState} />
          <Field id="mfa-code" label="Code" required requiredLabel="obligatoire">
            <Input id="mfa-code" name="code" required minLength={6} maxLength={10} autoComplete="one-time-code" />
          </Field>
          <Field id="mfa-kind" label="Type">
            <Select
              id="mfa-kind"
              name="kind"
              defaultValue="totp"
              options={[
                { value: "totp", label: "TOTP" },
                { value: "backup", label: "Code de secours" }
              ]}
            />
          </Field>
          <Checkbox
            id="mfa-trust-device"
            name="trustDevice"
            label="Faire confiance à cet appareil pendant 30 jours"
            hint="Le code ne vous sera plus demandé sur cet appareil pendant 30 jours. Ne cochez pas sur un ordinateur partagé."
          />
          <FormActions>
            <Button type="submit" pending={verifyPending} pendingLabel="Verification...">
              Vérifier MFA
            </Button>
          </FormActions>
        </Form>
      </Card>
    </Stack>
  );
}

/** "Révoquer tous les appareils de confiance" (spec 063, FR-A06). */
export function RevokeTrustedDevicesForm() {
  const [state, formAction, pending] = useActionState(revokeTrustedDevicesAction, initialAuthFlowState);
  return (
    <Form action={formAction}>
      <FlowNotice state={state} />
      <FormActions>
        <Button type="submit" variant="secondary" pending={pending} pendingLabel="Révocation...">
          Révoquer tous les appareils de confiance
        </Button>
      </FormActions>
    </Form>
  );
}

export function PasswordChangeForm() {
  const [state, formAction, pending] = useActionState(passwordChangeAction, initialAuthFlowState);
  return (
    <Form action={formAction}>
      <FlowNotice state={state} />
      <Field id="password-old" label="Mot de passe actuel" required requiredLabel="obligatoire">
        <Input id="password-old" name="oldPassword" type="password" autoComplete="current-password" required minLength={12} />
      </Field>
      <Field id="password-new" label="Nouveau mot de passe" required requiredLabel="obligatoire" hint="12 caractères minimum.">
        <Input id="password-new" name="newPassword" type="password" autoComplete="new-password" required minLength={12} />
      </Field>
      <FormActions>
        <Button type="submit" pending={pending} pendingLabel="Modification...">
          Changer le mot de passe
        </Button>
      </FormActions>
    </Form>
  );
}

export function PasswordResetConsumeForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(passwordResetConsumeAction, initialAuthFlowState);
  return (
    <Form action={formAction}>
      <FlowNotice state={state} />
      <Field id="reset-token" label="Jeton réinitialisation" required requiredLabel="obligatoire">
        <Input id="reset-token" name="token" defaultValue={token} required />
      </Field>
      <Field id="reset-password" label="Nouveau mot de passe" required requiredLabel="obligatoire" hint="12 caractères minimum.">
        <Input id="reset-password" name="newPassword" type="password" autoComplete="new-password" required minLength={12} />
      </Field>
      <FormActions>
        <Button type="submit" pending={pending} pendingLabel="Reinitialisation..." fullWidth>
          Consommer le jeton
        </Button>
      </FormActions>
    </Form>
  );
}
