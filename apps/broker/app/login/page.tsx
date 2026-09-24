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

const KNOWN_ERRORS = [
  "activation_required",
  "mfa_required",
  "locked",
  "suspended",
  "validation_error",
  "dev_login_missing_seed",
  "dev_login_database",
  "dev_login_disabled",
  "dev_login_invalid"
];

export default async function BrokerLoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : {};
  const returnTo = firstParam(params.returnTo) ?? "/";
  const error = firstParam(params.error);
  const reason = firstParam(params.reason);
  const mfa = firstParam(params.mfa);

  return (
    <>
      <h1 className="bo-auth__title">Connexion</h1>
      {reason === "session_expired" ? <Notice tone="info">Votre session a expire. Connectez-vous a nouveau.</Notice> : null}
      {reason === "session_required" ? <Notice tone="info">Connectez-vous pour acceder au back-office.</Notice> : null}
      {mfa === "required" ? (
        <Notice tone="danger">MFA requise. Votre profil est reconnu, mais l'acces protege reste bloque tant que la verification MFA n'est pas terminee.</Notice>
      ) : null}
      {error === "activation_required" ? (
        <Notice tone="danger">Activation requise. Ouvrez l'ecran d'activation avec le jeton fourni par votre administrateur.</Notice>
      ) : null}
      {error === "mfa_required" ? (
        <Notice tone="danger">MFA requise. Terminez la verification MFA avant d'ouvrir le back-office courtier.</Notice>
      ) : null}
      {error === "locked" ? <Notice tone="danger">Compte verrouille. Contactez votre administrateur plateforme.</Notice> : null}
      {error === "suspended" ? <Notice tone="danger">Compte suspendu. Contactez votre responsable habilite.</Notice> : null}
      {error === "validation_error" ? <Notice tone="danger">Verifiez le format de l'email et du mot de passe.</Notice> : null}
      {error === "dev_login_missing_seed" ? <Notice tone="danger">Donnees demo locales absentes. Relancez le seed broker demo.</Notice> : null}
      {error === "dev_login_database" ? <Notice tone="danger">Base locale indisponible pour le selecteur demo.</Notice> : null}
      {error && !KNOWN_ERRORS.includes(error) ? <Notice tone="danger">Acces refuse ou identifiants invalides.</Notice> : null}

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
        <a href="/password-reset">Consommer un jeton de reinitialisation</a>
      </p>
    </>
  );
}
