"use client";

import { useActionState } from "react";
import { activateAction, enrollMfaAction, passwordChangeAction, passwordResetConsumeAction, verifyMfaAction, type AuthFlowState } from "./lib/auth-flow-actions";
import { Button, Field, Form, FormActions, Input, Notice, Select, fieldControlProps } from "./lib/ui/admin-ui";

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

export function MfaPanel({ returnTo }: { returnTo: string }) {
  const [enrollState, enrollAction, enrollPending] = useActionState(enrollMfaAction, initialAuthFlowState);
  const [verifyState, verifyAction, verifyPending] = useActionState(verifyMfaAction, initialAuthFlowState);
  return (
    <>
      <Form action={enrollAction}>
        <h2 className="bo-section-title">Enrolement MFA</h2>
        <FlowNotice state={enrollState} />
        <FormActions>
          <Button type="submit" fullWidth pending={enrollPending} pendingLabel="Generation...">Generer secret et codes de secours</Button>
        </FormActions>
      </Form>
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
        <FormActions>
          <Button type="submit" fullWidth pending={verifyPending} pendingLabel="Verification...">Verifier MFA</Button>
        </FormActions>
      </Form>
    </>
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
