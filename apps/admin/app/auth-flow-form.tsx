"use client";

import { useActionState } from "react";
import {
  activateAction,
  enrollMfaAction,
  passwordChangeAction,
  passwordResetConsumeAction,
  revokeTrustedDevicesAction,
  verifyMfaAction,
  type AuthFlowState
} from "./lib/auth-flow-actions";
import { Button, Checkbox, Field, Form, FormActions, Input, Notice, Select, fieldControlProps } from "./lib/ui/admin-ui";

const initialAuthFlowState: AuthFlowState = { status: "idle" };

function FlowNotice({ state }: { state: AuthFlowState }) {
  if (state.status === "idle") return null;
  return (
    <Notice tone={state.status === "error" ? "danger" : "success"}>
      <p>{state.message}</p>
      {state.secret ? <p>Secret TOTP: <code>{state.secret}</code></p> : null}
      {state.otpauthUri ? <p className="bo-break">URI: <code>{state.otpauthUri}</code></p> : null}
      {state.backupCodes?.length ? (
        <ul className="bo-list">
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
      <Field id="activate-token" label="Jeton activation" required>
        <Input {...fieldControlProps("activate-token", { required: true })} name="token" defaultValue={token} />
      </Field>
      <Field id="activate-password" label="Nouveau mot de passe" required>
        <Input
          {...fieldControlProps("activate-password", { required: true })}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
        />
      </Field>
      <FormActions>
        <Button type="submit" fullWidth pending={pending} pendingLabel="Activation...">Activer et continuer vers MFA</Button>
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
    <>
      {enrollmentVisible ? (
        <Form action={enrollAction}>
          <h2 className="bo-section-title">Enrolement MFA</h2>
          <FlowNotice state={enrollState} />
          <FormActions>
            <Button type="submit" fullWidth pending={enrollPending} pendingLabel="Generation...">Generer secret et codes de secours</Button>
          </FormActions>
        </Form>
      ) : null}
      <Form action={verifyAction}>
        <input type="hidden" name="returnTo" value={returnTo} />
        <h2 className="bo-section-title">Verification MFA</h2>
        <FlowNotice state={verifyState} />
        <Field id="mfa-code" label="Code" required>
          <Input {...fieldControlProps("mfa-code", { required: true })} name="code" minLength={6} maxLength={10} />
        </Field>
        <Field id="mfa-kind" label="Type">
          <Select
            {...fieldControlProps("mfa-kind")}
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
          <Button type="submit" fullWidth pending={verifyPending} pendingLabel="Verification...">Verifier MFA</Button>
        </FormActions>
      </Form>
    </>
  );
}

/** "Révoquer tous les appareils de confiance" (spec 063, FR-A06). */
export function RevokeTrustedDevicesForm() {
  const [state, formAction, pending] = useActionState(revokeTrustedDevicesAction, initialAuthFlowState);
  return (
    <Form action={formAction}>
      <FlowNotice state={state} />
      <FormActions>
        <Button type="submit" variant="secondary" pending={pending} pendingLabel="Révocation...">Révoquer tous les appareils de confiance</Button>
      </FormActions>
    </Form>
  );
}

export function PasswordChangeForm() {
  const [state, formAction, pending] = useActionState(passwordChangeAction, initialAuthFlowState);
  return (
    <Form action={formAction}>
      <FlowNotice state={state} />
      <Field id="password-change-old" label="Mot de passe actuel" required>
        <Input
          {...fieldControlProps("password-change-old", { required: true })}
          name="oldPassword"
          type="password"
          autoComplete="current-password"
          minLength={12}
        />
      </Field>
      <Field id="password-change-new" label="Nouveau mot de passe" required>
        <Input
          {...fieldControlProps("password-change-new", { required: true })}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
        />
      </Field>
      <FormActions>
        <Button type="submit" fullWidth pending={pending} pendingLabel="Modification...">Changer le mot de passe</Button>
      </FormActions>
    </Form>
  );
}

export function PasswordResetConsumeForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(passwordResetConsumeAction, initialAuthFlowState);
  return (
    <Form action={formAction}>
      <FlowNotice state={state} />
      <Field id="password-reset-token" label="Jeton reinitialisation" required>
        <Input {...fieldControlProps("password-reset-token", { required: true })} name="token" defaultValue={token} />
      </Field>
      <Field id="password-reset-new" label="Nouveau mot de passe" required>
        <Input
          {...fieldControlProps("password-reset-new", { required: true })}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
        />
      </Field>
      <FormActions>
        <Button type="submit" fullWidth pending={pending} pendingLabel="Reinitialisation...">Consommer le jeton</Button>
      </FormActions>
    </Form>
  );
}
