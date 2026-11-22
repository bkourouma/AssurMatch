import { redirect } from "next/navigation";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { readAdminUser } from "../../lib/admin-api";
import { adminUserLifecycleAction, updateAdminUserProfileAction, updateAdminUserRolesAction } from "../actions";
import { PasswordResetForm } from "../user-action-forms";
import { USER_ACTION_LABELS, adminRoleOptions, userNextStep, userNoticeLabel, userStatusLabel } from "../user-options";
import {
  Button,
  Card,
  CheckboxGroup,
  Cluster,
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
  StatusBadge,
  Tabs,
  Textarea,
  fieldControlProps,
  mfaStatusTones,
  userStatusTones
} from "../../lib/ui/admin-ui";
import { errorNoticeText, readFailureDetail } from "../../lib/auth-error-messages";

interface UserDetailPageProps {
  params: Promise<{ userId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/** Restorative lifecycle actions stay a plain form; the destructive ones go through a dialog. */
const restoreActions = ["unsuspend", "unlock"];
const sensitiveActions = ["suspend", "lock", "mfa-reset", "delete"];

const TABS = [
  { key: "profil", label: "Profil et scopes" },
  { key: "roles", label: "Rôles" },
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
  const errorNotice = errorNoticeText(firstParam(paramsValue.error));
  const requestedTab = firstParam(paramsValue.tab);
  const tab = TABS.some((entry) => entry.key === requestedTab) ? requestedTab : "profil";
  const result = await readAdminUser(userId);
  if (result.unauthenticated) redirect(loginRedirect(`/users/${userId}`, result.error ?? "session_required"));
  if (!result.data) {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={[{ label: "Plateforme" }, { label: "Utilisateurs", href: "/users" }, { label: "Détail" }]}
          title="Utilisateur introuvable"
          actions={<Button href="/users" variant="secondary">Retourner à la liste</Button>}
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
        title={user.displayName}
        description={user.email}
        actions={
          <Cluster>
            <StatusBadge status={user.status} tones={userStatusTones} />
            <StatusBadge status={user.mfaStatus} tones={mfaStatusTones} />
            <Button href="/users" variant="secondary">Retourner à la liste</Button>
          </Cluster>
        }
      />

      {errorNotice ? <StateMessage tone="danger">{errorNotice}</StateMessage> : null}
      {notice && !errorNotice ? <StateMessage>Action terminée : {userNoticeLabel(notice)}.</StateMessage> : null}
      <p data-user-next-step="true">
        <strong>{`Statut : ${userStatusLabel(user.status)}`}</strong>
        {` - prochaine étape : ${userNextStep(user.status)}`}
      </p>
      {result.forbidden ? <StateMessage tone="danger">Accès refusé pour ce profil utilisateur.</StateMessage> : null}
      {result.status === "error" ? <StateMessage tone="warning">Détail indisponible. {readFailureDetail(result.error)}</StateMessage> : null}

      <Card title="État du compte">
        <DescriptionList
          columns={2}
          items={[
            { term: "Statut", value: <StatusBadge status={user.status} tones={userStatusTones} /> },
            { term: "MFA", value: <StatusBadge status={user.mfaStatus} tones={mfaStatusTones} /> },
            { term: "Tenant", value: user.partnerTenantId ? <code className="bo-break">{user.partnerTenantId}</code> : "-" }
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
            <Field id="user-display-name" label="Nom affiché" required>
              <Input {...fieldControlProps("user-display-name", { required: true })} name="displayName" minLength={2} defaultValue={user.displayName} />
            </Field>
            <Field id="user-phone" label="Téléphone E.164" hint="Format international, par exemple +2250700000000.">
              <Input {...fieldControlProps("user-phone", { hint: "x" })} name="phone" defaultValue={user.phone ?? ""} />
            </Field>
            <Field id="user-country-scopes" label="Scopes pays" hint="Identifiants (UUID) séparés par des virgules.">
              <Input {...fieldControlProps("user-country-scopes", { hint: "x" })} name="countryScopes" defaultValue={user.countryScopes.join(", ")} />
            </Field>
            <Field id="user-product-scopes" label="Scopes produits" hint="Identifiants (UUID) séparés par des virgules.">
              <Input {...fieldControlProps("user-product-scopes", { hint: "x" })} name="productScopes" defaultValue={user.productScopes.join(", ")} />
            </Field>
            <Field id="user-profile-reason" label="Raison auditable" required hint="Au moins 8 caractères, conservée dans le journal d'audit.">
              <Textarea {...fieldControlProps("user-profile-reason", { required: true, hint: "x" })} name="reason" minLength={8} />
            </Field>
            <FormActions>
              <Button type="submit">Mettre à jour</Button>
            </FormActions>
          </Form>
        </Card>
      ) : null}

      {tab === "roles" ? (
        <Card title="Rôles">
          <Form action={updateAdminUserRolesAction}>
            <input type="hidden" name="userId" value={user.id} />
            <CheckboxGroup
              legend="Rôles"
              name="roles"
              options={adminRoleOptions.map((role) => ({ value: role, label: role }))}
              defaultValues={user.roles}
            />
            <Field id="user-roles-reason" label="Raison auditable" required hint="Au moins 8 caractères, conservée dans le journal d'audit.">
              <Textarea {...fieldControlProps("user-roles-reason", { required: true, hint: "x" })} name="reason" minLength={8} />
            </Field>
            <FormActions>
              <Button type="submit">Mettre à jour les rôles</Button>
            </FormActions>
          </Form>
        </Card>
      ) : null}

      {tab === "actions" ? (
        <Stack>
          <PasswordResetForm userId={user.id} userEmail={user.email} />
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
                    <Textarea {...fieldControlProps(`user-reason-${action}`, { required: true })} name="reason" minLength={8} />
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
                  title={`${USER_ACTION_LABELS[action] ?? action} : ${user.email}`}
                  description={`Confirmer ${action} sur le compte ${user.email}. Cette action est auditée et s'applique immédiatement.`}
                  confirmLabel={`Confirmer ${action}`}
                  cancelLabel="Annuler"
                  tone="danger"
                  formAction={adminUserLifecycleAction}
                  dataAttributes={{ "data-user-action": action }}
                >
                  <input type="hidden" name="userId" value={user.id} />
                  <input type="hidden" name="action" value={action} />
                  <Field id={`user-reason-${action}`} label={`Raison pour ${action}`} required>
                    <Textarea {...fieldControlProps(`user-reason-${action}`, { required: true })} name="reason" minLength={8} />
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
