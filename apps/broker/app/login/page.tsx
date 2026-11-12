import { loginErrorNotice, loginReasonNotice } from "../lib/auth-error-messages";
import { loginAction } from "../lib/backoffice-session-actions";
import { isLocalBrokerDemoLoginEnabled } from "../lib/dev-demo-accounts";
import { Button, Field, Form, FormActions, Input, Notice } from "../lib/ui/broker-ui";
import { DevAccountPicker } from "./dev-account-picker";

interface LoginPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BrokerLoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : {};
  const returnTo = firstParam(params.returnTo) ?? "/";
  const error = firstParam(params.error);
  const reason = firstParam(params.reason);
  const mfa = firstParam(params.mfa);
  const reasonNotice = loginReasonNotice(reason);
  const errorNotice = loginErrorNotice(error);

  return (
    <>
      <h1 className="bo-auth__title">Connexion</h1>
      {reasonNotice ? (
        <Notice tone={reasonNotice.tone}>
          {reasonNotice.message}
          {reason === "mfa_required" ? <>{" "}<a href={`/mfa?returnTo=${encodeURIComponent(returnTo)}`}>Saisir mon code de vérification</a></> : null}
        </Notice>
      ) : null}
      {mfa === "required" ? (
        <Notice tone="danger">MFA requise. Votre profil est reconnu, mais l'accès protégé reste bloqué tant que la vérification MFA n'est pas terminée.</Notice>
      ) : null}
      {errorNotice ? <Notice tone={errorNotice.tone}>{errorNotice.message}</Notice> : null}

      {isLocalBrokerDemoLoginEnabled() ? <DevAccountPicker returnTo={returnTo} /> : null}

      <Form action={loginAction}>
        <input type="hidden" name="returnTo" value={returnTo} />
        <Field id="login-email" label="Email" required requiredLabel="obligatoire">
          <Input id="login-email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field id="login-password" label="Mot de passe" required requiredLabel="obligatoire">
          <Input id="login-password" name="password" type="password" autoComplete="current-password" required minLength={12} />
        </Field>
        <FormActions>
          <Button type="submit" fullWidth>Se connecter</Button>
        </FormActions>
      </Form>

      <p>
        <a href={`/activate?returnTo=${encodeURIComponent(returnTo)}`}>Activer un compte</a>
        {" · "}
        <a href="/password-reset">Consommer un jeton de réinitialisation</a>
      </p>
    </>
  );
}
