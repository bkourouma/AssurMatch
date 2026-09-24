"use client";

import { useActionState, useId } from "react";
import { createAdminUserAction, passwordResetAction, type UserActionState } from "./actions";
import { adminRoleOptions } from "./user-options";
import {
  ActionNotice,
  Button,
  Card,
  CheckboxGroup,
  ConfirmDialog,
  Field,
  Form,
  FormActions,
  Input,
  Textarea,
  fieldControlProps
} from "../lib/ui/admin-ui";

const initialState: UserActionState = { status: "idle" };

const TOKEN_LABEL = "Jeton temporaire a transmettre par canal interne securise:";

function noticeState(state: UserActionState) {
  return {
    status: state.status,
    message: state.message,
    token: state.token,
    expiresAt: state.expiresAt ? new Date(state.expiresAt).toISOString() : undefined
  };
}

export function CreateUserForm() {
  const [state, formAction, pending] = useActionState(createAdminUserAction, initialState);
  const base = useId();
  const ids = {
    email: `${base}-email`,
    displayName: `${base}-display-name`,
    phone: `${base}-phone`,
    partnerTenantId: `${base}-tenant`,
    countryScopes: `${base}-country-scopes`,
    productScopes: `${base}-product-scopes`,
    reason: `${base}-reason`
  };

  return (
    <Card title="Creer un utilisateur">
      <Form action={formAction}>
        <ActionNotice state={noticeState(state)} tokenLabel={TOKEN_LABEL} expiresLabel="expire" />
        <Field id={ids.email} label="Email" required>
          <Input {...fieldControlProps(ids.email, { required: true })} name="email" type="email" />
        </Field>
        <Field id={ids.displayName} label="Nom affiche" required>
          <Input {...fieldControlProps(ids.displayName, { required: true })} name="displayName" />
        </Field>
        <Field id={ids.phone} label="Telephone E.164">
          <Input {...fieldControlProps(ids.phone)} name="phone" placeholder="+2250000000000" />
        </Field>
        <CheckboxGroup legend="Roles" name="roles" options={adminRoleOptions.map((role) => ({ value: role, label: role }))} />
        <Field id={ids.partnerTenantId} label="Tenant partenaire">
          <Input {...fieldControlProps(ids.partnerTenantId)} name="partnerTenantId" placeholder="UUID tenant pour utilisateurs courtier" />
        </Field>
        <Field id={ids.countryScopes} label="Scopes pays">
          <Input {...fieldControlProps(ids.countryScopes)} name="countryScopes" placeholder="UUID, UUID" />
        </Field>
        <Field id={ids.productScopes} label="Scopes produits">
          <Input {...fieldControlProps(ids.productScopes)} name="productScopes" placeholder="UUID, UUID" />
        </Field>
        <Field id={ids.reason} label="Raison auditable" required>
          <Textarea {...fieldControlProps(ids.reason, { required: true })} name="reason" minLength={5} />
        </Field>
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Creation...">Creer et emettre activation</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

export function PasswordResetForm({ userId }: { userId: string }) {
  const [state, formAction] = useActionState(passwordResetAction, initialState);
  const base = useId();
  const reasonId = `${base}-reason`;

  return (
    <Card
      title="Reinitialisation mot de passe"
      description="Le jeton emis est a usage unique et doit etre transmis par un canal interne securise."
    >
      <ConfirmDialog
        triggerLabel="Emettre un jeton"
        triggerVariant="secondary"
        title="Reinitialisation mot de passe"
        description="Emettre un jeton invalide le mot de passe courant de l'utilisateur. La raison est auditee."
        confirmLabel="Emettre un jeton"
        cancelLabel="Annuler"
        tone="danger"
        formAction={formAction}
        dataAttributes={{ "data-user-action": "password-reset" }}
      >
        <input type="hidden" name="userId" value={userId} />
        <ActionNotice state={noticeState(state)} tokenLabel={TOKEN_LABEL} expiresLabel="expire" />
        <Field id={reasonId} label="Raison auditable" required>
          <Textarea {...fieldControlProps(reasonId, { required: true })} name="reason" minLength={5} />
        </Field>
      </ConfirmDialog>
    </Card>
  );
}
