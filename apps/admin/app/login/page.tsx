import { loginAction } from "../lib/backoffice-session-actions";
import { isLocalAdminDemoLoginEnabled } from "../lib/dev-demo-accounts";
import { DevAccountPicker } from "./dev-account-picker";
import { Button, Field, Form, FormActions, Input, Notice, fieldControlProps } from "../lib/ui/admin-ui";

interface LoginPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : {};
  const returnTo = firstParam(params.returnTo) ?? "/";
  const error = firstParam(params.error);
  const reason = firstParam(params.reason);
  const mfa = firstParam(params.mfa);

  return (
    <>
      <h1 className="bo-auth__title">Connexion admin</h1>

      {reason === "session_expired" ? <Notice tone="info">Votre session a expiré. Connectez-vous à nouveau.</Notice> : null}
      {reason === "session_required" ? <Notice tone="info">Connectez-vous pour accéder à l'administration.</Notice> : null}
      {mfa === "required" ? <Notice tone="danger">MFA requise. L'accès admin reste bloqué tant que la vérification MFA n'est pas terminée.</Notice> : null}
      {error === "activation_required" ? <Notice tone="danger">Activation requise. Ouvrez l'écran d'activation avec le jeton fourni par votre administrateur.</Notice> : null}
      {error === "mfa_required" ? <Notice tone="danger">MFA requise. Terminez la vérification MFA avant d'ouvrir les espaces admin.</Notice> : null}
      {error === "locked" ? <Notice tone="danger">Compte verrouillé. Contactez un Super Admin ou un administrateur conformité.</Notice> : null}
      {error === "suspended" ? <Notice tone="danger">Compte suspendu. Contactez un administrateur habilité.</Notice> : null}
      {error === "validation_error" ? <Notice tone="danger">Vérifiez le format de l'email et du mot de passe.</Notice> : null}
      {error === "dev_login_missing_seed" ? <Notice tone="danger">Données démo locales absentes. Relancez le seed broker démo.</Notice> : null}
      {error === "dev_login_database" ? <Notice tone="danger">Base locale indisponible pour le sélecteur démo.</Notice> : null}
      {error && !["activation_required", "mfa_required", "locked", "suspended", "validation_error", "dev_login_missing_seed", "dev_login_database", "dev_login_disabled", "dev_login_invalid"].includes(error) ? <Notice tone="danger">Accès refusé ou identifiants invalides.</Notice> : null}

      {isLocalAdminDemoLoginEnabled() ? <DevAccountPicker returnTo={returnTo} /> : null}

      <Form action={loginAction}>
        <input type="hidden" name="returnTo" value={returnTo} />
        <Field id="login-email" label="Email" required>
          <Input {...fieldControlProps("login-email", { required: true })} name="email" type="email" autoComplete="email" />
        </Field>
        <Field id="login-password" label="Mot de passe" required>
          <Input
            {...fieldControlProps("login-password", { required: true })}
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={12}
          />
        </Field>
        <FormActions>
          <Button type="submit" fullWidth>Se connecter</Button>
        </FormActions>
      </Form>

      <p className="bo-auth__footer">
        <a href={`/activate?returnTo=${encodeURIComponent(returnTo)}`}>Activer un compte</a> · <a href="/password-reset">Consommer un jeton de réinitialisation</a>
      </p>
    </>
  );
}
