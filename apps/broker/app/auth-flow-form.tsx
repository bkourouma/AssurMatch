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
  Stack,
  fieldControlProps
} from "./lib/ui/broker-ui";
import polish from "./lib/ui/self-service-polish.module.css";
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

const MFA_CODE_HINT = "Code à 6 chiffres de votre application, ou un code de secours (choisissez le type ci-dessous).";

/** Rendu uniforme d'un resultat d'action d'authentification: rien tant que l'etat est inactif. */
function FlowNotice({ state }: { state: AuthFlowState }) {
  if (state.status === "idle") return null;
  return (
    <Notice tone={state.status === "error" ? "danger" : "success"}>
      <p>{state.message}</p>
      {state.secret || state.otpauthUri ? (
        <div className={polish.secretBlock}>
          {state.secret ? <p>Secret TOTP: <code>{state.secret}</code></p> : null}
          {state.otpauthUri ? <p>URI: <code>{state.otpauthUri}</code></p> : null}
          <p>Ajoutez ce secret à votre application d&apos;authentification, puis saisissez le code qu&apos;elle affiche dans « Vérification MFA ».</p>
        </div>
      ) : null}
      {state.backupCodes?.length ? (
        <div className={polish.secretBlock}>
          <p>Codes de secours : conservez-les en lieu sûr, hors de cet appareil si possible.</p>
          <ul className={polish.codeList}>
            {state.backupCodes.map((code) => <li key={code}><code>{code}</code></li>)}
          </ul>
        </div>
      ) : null}
    </Notice>
  );
}

export function ActivationForm({ returnTo, token }: { returnTo: string; token: string }) {
  const [state, formAction, pending] = useActionState(activateAction, initialAuthFlowState);
  const tokenHint = token ? "Jeton déjà renseigné depuis votre lien d'activation." : "Jeton fourni par votre administrateur.";
  return (
    <Form action={formAction}>
      <input type="hidden" name="returnTo" value={returnTo} />
      <FlowNotice state={state} />
      <Field id="activate-token" label="Jeton d'activation" required requiredLabel="obligatoire" hint={tokenHint}>
        <Input
          {...fieldControlProps("activate-token", { hint: tokenHint, required: true })}
          name="token"
          defaultValue={token}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
      </Field>
      <Field id="activate-password" label="Nouveau mot de passe" required requiredLabel="obligatoire" hint="12 caractères minimum.">
        <Input {...fieldControlProps("activate-password", { hint: "12 caractères minimum.", required: true })} name="password" type="password" autoComplete="new-password" minLength={12} />
      </Field>
      <FormActions>
        <Button type="submit" pending={pending} pendingLabel="Activation en cours…" fullWidth>
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
        <Card
          title="Enrôlement MFA"
          description={
            showEnrollment
              ? "Générer un nouveau secret remplace l'ancien et révoque vos appareils de confiance. Ajoutez ensuite le nouveau secret à votre application d'authentification."
              : "Première étape : générez un secret et des codes de secours, ajoutez le secret à votre application d'authentification, puis validez avec un code dans « Vérification MFA »."
          }
        >
          <Form action={enrollAction}>
            <FlowNotice state={enrollState} />
            <FormActions>
              <Button type="submit" variant="secondary" pending={enrollPending} pendingLabel="Génération en cours…">
                Générer secret et codes de secours
              </Button>
            </FormActions>
          </Form>
        </Card>
      ) : null}
      <Card title="Vérification MFA" description="Saisissez le code à usage unique de votre application d'authentification, ou l'un de vos codes de secours.">
        <Form action={verifyAction}>
          <input type="hidden" name="returnTo" value={returnTo} />
          <FlowNotice state={verifyState} />
          <Field id="mfa-code" label="Code" required requiredLabel="obligatoire" hint={MFA_CODE_HINT}>
            <Input
              {...fieldControlProps("mfa-code", { hint: MFA_CODE_HINT, required: true })}
              name="code"
              minLength={6}
              maxLength={10}
              autoComplete="one-time-code"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
          <Field id="mfa-kind" label="Type de code">
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
            <Button type="submit" pending={verifyPending} pendingLabel="Vérification en cours…">
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
        <Button type="submit" variant="secondary" pending={pending} pendingLabel="Révocation en cours…">
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
        <Input {...fieldControlProps("password-new", { hint: "12 caractères minimum.", required: true })} name="newPassword" type="password" autoComplete="new-password" minLength={12} />
      </Field>
      <FormActions>
        <Button type="submit" pending={pending} pendingLabel="Modification en cours…">
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
      <Field id="reset-token" label="Jeton de réinitialisation" required requiredLabel="obligatoire" hint="Jeton reçu avec votre lien de réinitialisation.">
        <Input
          {...fieldControlProps("reset-token", { hint: "Jeton reçu avec votre lien de réinitialisation.", required: true })}
          name="token"
          defaultValue={token}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
      </Field>
      <Field id="reset-password" label="Nouveau mot de passe" required requiredLabel="obligatoire" hint="12 caractères minimum.">
        <Input {...fieldControlProps("reset-password", { hint: "12 caractères minimum.", required: true })} name="newPassword" type="password" autoComplete="new-password" minLength={12} />
      </Field>
      <FormActions>
        <Button type="submit" pending={pending} pendingLabel="Réinitialisation en cours…" fullWidth>
          Consommer le jeton
        </Button>
      </FormActions>
      {state.status === "success" ? (
        <Button href="/login" variant="secondary" fullWidth>
          Aller à la connexion
        </Button>
      ) : null}
    </Form>
  );
}
