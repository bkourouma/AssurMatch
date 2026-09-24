import { redirect } from "next/navigation";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { readAdminUser } from "../../lib/admin-api";
import { adminUserLifecycleAction, updateAdminUserProfileAction, updateAdminUserRolesAction } from "../actions";
import { PasswordResetForm } from "../user-action-forms";
import { adminRoleOptions } from "../user-options";
import {
  Button,
  Card,
  CheckboxGroup,
  ConfirmDialog,
  DescriptionList,
  Field,
  Form,
  FormActions,
  Input,
  PageHeader,
  PageStack,
  StateMessage,
  Stack,
  Tabs,
  Textarea,
  fieldControlProps
} from "../../lib/ui/admin-ui";

interface UserDetailPageProps {
  params: Promise<{ userId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/** Restorative lifecycle actions stay a plain form; the destructive ones go through a dialog. */
const restoreActions = ["unsuspend", "unlock"];
const sensitiveActions = ["suspend", "lock", "mfa-reset", "delete"];

const TABS = [
  { key: "profil", label: "Profil et scopes" },
  { key: "roles", label: "Roles" },
  { key: "actions", label: "Actions sensibles" }
];

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function UserDetailPage({ params, searchParams }: UserDetailPageProps) {
  const { userId } = await params;
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect(`/users/${userId}`, session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent(`/users/${userId}`)}`);
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) redirect(`/login?error=access_denied&returnTo=${encodeURIComponent(`/users/${userId}`)}`);

  const paramsValue = searchParams ? await searchParams : {};
  const notice = firstParam(paramsValue.notice);
  const requestedTab = firstParam(paramsValue.tab);
  const tab = TABS.some((entry) => entry.key === requestedTab) ? requestedTab : "profil";
  const result = await readAdminUser(userId);
  if (result.unauthenticated) redirect(loginRedirect(`/users/${userId}`, result.error ?? "session_required"));
  if (!result.data) {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={[{ label: "Plateforme" }, { label: "Utilisateurs", href: "/users" }, { label: "Detail" }]}
          title="Utilisateur introuvable"
          actions={<Button href="/users" variant="secondary">Retour utilisateurs</Button>}
        />
      </PageStack>
    );
  }
  const user = result.data;
  const base = `/users/${encodeURIComponent(user.id)}`;
  const hrefForTab = (key: string) => (key === "profil" ? base : `${base}?tab=${key}`);

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Plateforme" }, { label: "Utilisateurs", href: "/users" }, { label: user.displayName }]}
        kicker="Detail utilisateur"
        title={user.displayName}
        description={user.email}
        actions={<Button href="/users" variant="secondary">Retour liste</Button>}
      />

      {notice ? <StateMessage>Action terminee: {notice}.</StateMessage> : null}
      {result.forbidden ? <StateMessage tone="danger">Acces refuse pour ce profil utilisateur.</StateMessage> : null}
      {result.status === "error" ? <StateMessage tone="warning">Detail indisponible: {result.error}.</StateMessage> : null}

      <Card title="Etat du compte">
        <DescriptionList
          columns={2}
          items={[
            { term: "Statut", value: user.status },
            { term: "MFA", value: user.mfaStatus },
            { term: "Echecs login", value: String(user.failedLoginCount ?? 0) },
            { term: "Tenant", value: user.partnerTenantId ?? "-" }
          ]}
        />
      </Card>

      <Tabs
        label="Sections du compte utilisateur"
        items={TABS.map((entry) => ({ label: entry.label, href: hrefForTab(entry.key), current: entry.key === tab }))}
      />

      {tab === "profil" ? (
        <Card title="Profil et scopes">
          <Form action={updateAdminUserProfileAction}>
            <input type="hidden" name="userId" value={user.id} />
            <Field id="user-display-name" label="Nom affiche" required>
              <Input {...fieldControlProps("user-display-name", { required: true })} name="displayName" defaultValue={user.displayName} />
            </Field>
            <Field id="user-phone" label="Telephone E.164">
              <Input {...fieldControlProps("user-phone")} name="phone" defaultValue={user.phone ?? ""} />
            </Field>
            <Field id="user-country-scopes" label="Scopes pays">
              <Input {...fieldControlProps("user-country-scopes")} name="countryScopes" defaultValue={user.countryScopes.join(", ")} />
            </Field>
            <Field id="user-product-scopes" label="Scopes produits">
              <Input {...fieldControlProps("user-product-scopes")} name="productScopes" defaultValue={user.productScopes.join(", ")} />
            </Field>
            <Field id="user-profile-reason" label="Raison auditable" required>
              <Textarea {...fieldControlProps("user-profile-reason", { required: true })} name="reason" minLength={5} />
            </Field>
            <FormActions>
              <Button type="submit">Mettre a jour</Button>
            </FormActions>
          </Form>
        </Card>
      ) : null}

      {tab === "roles" ? (
        <Card title="Roles">
          <Form action={updateAdminUserRolesAction}>
            <input type="hidden" name="userId" value={user.id} />
            <CheckboxGroup
              legend="Roles"
              name="roles"
              options={adminRoleOptions.map((role) => ({ value: role, label: role }))}
              defaultValues={user.roles}
            />
            <Field id="user-roles-reason" label="Raison auditable" required>
              <Textarea {...fieldControlProps("user-roles-reason", { required: true })} name="reason" minLength={5} />
            </Field>
            <FormActions>
              <Button type="submit">Mettre a jour les roles</Button>
            </FormActions>
          </Form>
        </Card>
      ) : null}

      {tab === "actions" ? (
        <Stack>
          <PasswordResetForm userId={user.id} />
          <Card
            title="Actions sensibles"
            description="Chaque action demande une raison auditable; la confirmation est explicite pour les actions destructives."
          >
            <Stack>
              {restoreActions.map((action) => (
                <Form key={action} action={adminUserLifecycleAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <input type="hidden" name="action" value={action} />
                  <Field id={`user-reason-${action}`} label={`Raison pour ${action}`} required>
                    <Textarea {...fieldControlProps(`user-reason-${action}`, { required: true })} name="reason" minLength={5} />
                  </Field>
                  <FormActions align="start">
                    <Button type="submit" variant="secondary" size="sm">Confirmer {action}</Button>
                  </FormActions>
                </Form>
              ))}
              {sensitiveActions.map((action) => (
                <ConfirmDialog
                  key={action}
                  triggerLabel={`Confirmer ${action}`}
                  triggerVariant="danger"
                  title={`Confirmer ${action}`}
                  description={`Cette action est auditee et s'applique immediatement au compte ${user.email}.`}
                  confirmLabel={`Confirmer ${action}`}
                  cancelLabel="Annuler"
                  tone="danger"
                  formAction={adminUserLifecycleAction}
                  dataAttributes={{ "data-user-action": action }}
                >
                  <input type="hidden" name="userId" value={user.id} />
                  <input type="hidden" name="action" value={action} />
                  <Field id={`user-reason-${action}`} label={`Raison pour ${action}`} required>
                    <Textarea {...fieldControlProps(`user-reason-${action}`, { required: true })} name="reason" minLength={5} />
                  </Field>
                </ConfirmDialog>
              ))}
            </Stack>
          </Card>
        </Stack>
      ) : null}
    </PageStack>
  );
}
