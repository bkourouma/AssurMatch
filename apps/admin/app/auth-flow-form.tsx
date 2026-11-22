"use client";

import { useActionState, useState } from "react";
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

const PASSWORD_RULE = "12 caractères minimum.";

function FlowNotice({ state }: { state: AuthFlowState }) {
  if (state.status === "idle") return null;
  return (
    <Notice tone={state.status === "error" ? "danger" : "success"}>
      <p>
        {state.secret
          ? "Secret généré. Saisissez-le dans votre application d'authentification, puis entrez le code qu'elle affiche dans le formulaire de vérification. Conservez les codes de secours en lieu sûr."
          : state.message}
      </p>
      {state.secret ? <p>Secret TOTP: <code>{state.secret}</code></p> : null}
      {state.otpauthUri ? <p className="bo-break">URI: <code>{state.otpauthUri}</code></p> : null}
      {state.backupCodes?.length ? (
        <ul className="bo-list" aria-label="Codes de secours à usage unique">
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
      <Field id="activate-token" label="Jeton d'activation" required hint="Reçu par e-mail dans le lien d'invitation ; déjà rempli si vous avez ouvert ce lien.">
        <Input
          {...fieldControlProps("activate-token", { required: true, hint: "Reçu par e-mail dans le lien d'invitation ; déjà rempli si vous avez ouvert ce lien." })}
          name="token"
          defaultValue={token}
          autoComplete="off"
          autoFocus={!token}
          spellCheck={false}
        />
      </Field>
      <Field id="activate-password" label="Nouveau mot de passe" required hint={PASSWORD_RULE}>
        <Input
          {...fieldControlProps("activate-password", { required: true, hint: PASSWORD_RULE })}
          name="password"
          type="password"
          autoComplete="new-password"
          autoFocus={Boolean(token)}
          minLength={12}
        />
      </Field>
      <FormActions>
        <Button type="submit" fullWidth pending={pending} pendingLabel="Activation…">Activer et continuer vers MFA</Button>
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
  const [codeKind, setCodeKind] = useState("totp");
  const codeHint = codeKind === "backup" ? "Code de secours à usage unique, remis lors de l'enrôlement MFA." : "6 chiffres affichés par votre application d'authentification.";
  // Keep the form mounted once an enrolment was attempted so the one-time secret stays visible.
  const enrollmentVisible = (showEnrollment ?? !mfaEnrolled) || enrollState.status !== "idle";
  return (
    <>
      {enrollmentVisible ? (
        <Form action={enrollAction}>
          <h2 className="bo-section-title">Enrôlement MFA</h2>
          <FlowNotice state={enrollState} />
          <FormActions>
            <Button type="submit" fullWidth pending={enrollPending} pendingLabel="Génération…">Générer secret et codes de secours</Button>
          </FormActions>
        </Form>
      ) : null}
      <Form action={verifyAction}>
        <input type="hidden" name="returnTo" value={returnTo} />
        <h2 className="bo-section-title">Vérification MFA</h2>
        <FlowNotice state={verifyState} />
        <Field id="mfa-code" label="Code" required hint={codeHint}>
          <Input
            {...fieldControlProps("mfa-code", { required: true, hint: codeHint })}
            name="code"
            minLength={6}
            maxLength={10}
            autoComplete="one-time-code"
            inputMode={codeKind === "backup" ? "text" : "numeric"}
            autoFocus={!enrollmentVisible}
            spellCheck={false}
          />
        </Field>
        <Field id="mfa-kind" label="Type de code">
          <Select
            {...fieldControlProps("mfa-kind")}
            name="kind"
            value={codeKind}
            onChange={(event) => setCodeKind(event.currentTarget.value)}
            options={[
              { value: "totp", label: "Application d'authentification (TOTP)" },
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
          <Button type="submit" fullWidth pending={verifyPending} pendingLabel="Vérification…">Vérifier MFA</Button>
        </FormActions>
      </Form>
    </>
  );
}

/** "Révoquer tous les appareils de confiance" (spec 063, FR-A06). */
export function RevokeTrustedDevicesForm({ deviceCount }: { deviceCount?: number | undefined }) {
  const [state, formAction, pending] = useActionState(revokeTrustedDevicesAction, initialAuthFlowState);
  return (
    <Form action={formAction}>
      <FlowNotice state={state} />
      {deviceCount !== undefined && deviceCount > 0 ? (
        <p className="bo-field__hint" id="revoke-devices-hint">
          {deviceCount === 1
            ? "Cette action retire la confiance de l'appareil listé ci-dessus : le code MFA sera redemandé à sa prochaine connexion."
            : `Cette action retire la confiance des ${deviceCount} appareils listés ci-dessus : le code MFA sera redemandé à leur prochaine connexion.`}
        </p>
      ) : null}
      <FormActions align="start">
        <Button type="submit" variant="secondary" pending={pending} pendingLabel="Révocation…">Révoquer tous les appareils de confiance</Button>
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
          autoFocus
          minLength={12}
        />
      </Field>
      <Field id="password-change-new" label="Nouveau mot de passe" required hint={`${PASSWORD_RULE} Tous vos appareils de confiance seront révoqués.`}>
        <Input
          {...fieldControlProps("password-change-new", { required: true, hint: `${PASSWORD_RULE} Tous vos appareils de confiance seront révoqués.` })}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
        />
      </Field>
      <FormActions>
        <Button type="submit" fullWidth pending={pending} pendingLabel="Modification…">Changer le mot de passe</Button>
      </FormActions>
    </Form>
  );
}

export function PasswordResetConsumeForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(passwordResetConsumeAction, initialAuthFlowState);
  return (
    <Form action={formAction}>
      <FlowNotice state={state} />
      {state.status === "success" ? <Button href="/login" variant="secondary">Aller à la connexion</Button> : null}
      <Field id="password-reset-token" label="Jeton de réinitialisation" required hint="Reçu de votre administrateur ; déjà rempli si vous avez ouvert son lien.">
        <Input
          {...fieldControlProps("password-reset-token", { required: true, hint: "Reçu de votre administrateur ; déjà rempli si vous avez ouvert son lien." })}
          name="token"
          defaultValue={token}
          autoComplete="off"
          autoFocus={!token}
          spellCheck={false}
        />
      </Field>
      <Field id="password-reset-new" label="Nouveau mot de passe" required hint={PASSWORD_RULE}>
        <Input
          {...fieldControlProps("password-reset-new", { required: true, hint: PASSWORD_RULE })}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          autoFocus={Boolean(token)}
          minLength={12}
        />
      </Field>
      <FormActions>
        <Button type="submit" fullWidth pending={pending} pendingLabel="Réinitialisation…">Réinitialiser le mot de passe</Button>
      </FormActions>
    </Form>
  );
}
