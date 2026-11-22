import { loginAction } from "../lib/backoffice-session-actions";
import { loginNotices } from "../lib/auth-error-messages";
import { isLocalAdminDemoLoginEnabled } from "../lib/dev-demo-accounts";
import { DevAccountPicker } from "./dev-account-picker";
import { Field, Form, FormActions, Input, Notice, fieldControlProps } from "../lib/ui/admin-ui";
import { AuthSubmitButton } from "../lib/ui/auth-submit-button";

export const metadata = { title: "Connexion" };

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

      {loginNotices({ reason, error }).map((notice) => <Notice key={notice.text} tone={notice.tone}>{notice.text}</Notice>)}
      {mfa === "required" ? <Notice tone="danger">MFA requise. L'accès admin reste bloqué tant que la vérification MFA n'est pas terminée.</Notice> : null}

      {isLocalAdminDemoLoginEnabled() ? <DevAccountPicker returnTo={returnTo} /> : null}

      <Form action={loginAction}>
        <input type="hidden" name="returnTo" value={returnTo} />
        <Field id="login-email" label="Email" required>
          <Input {...fieldControlProps("login-email", { required: true })} name="email" type="email" autoComplete="username" autoFocus spellCheck={false} />
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
          <AuthSubmitButton pendingLabel="Connexion…">Se connecter</AuthSubmitButton>
        </FormActions>
      </Form>

      <p className="bo-auth__footer">
        <a href={`/activate?returnTo=${encodeURIComponent(returnTo)}`}>Activer mon compte (lien d'invitation)</a> · <a href="/password-reset">Mot de passe oublié : utiliser un jeton de réinitialisation</a>
      </p>
    </>
  );
}
