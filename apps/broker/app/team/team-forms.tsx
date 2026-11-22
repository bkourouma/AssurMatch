"use client";

import { useActionState, useId, useState } from "react";
import { assignCustomRoleAction } from "../lib/enterprise-actions";
import { inviteTeamMemberAction, teamMemberAction, type SelfServiceActionState } from "../lib/self-service-actions";
import { TEAM_INVITE_ROLE_OPTIONS, TEAM_ROLE_DESCRIPTIONS, TEAM_ROLE_LABELS } from "../lib/self-service-messages";
import { Button, Card, ConfirmDialog, Field, Form, FormActions, FormRow, Input, Select, fieldControlProps } from "../lib/ui/broker-ui";
import { SelfServiceResult } from "../company/company-forms";

/**
 * Spec 053 US3 (G-03): team forms. Invitations go through the existing activation e-mail (MFA
 * enrolled at the first sign-in); the owner role is never offered. Deactivation, reactivation and
 * role changes require an audited reason. The API refuses actions on oneself, on the last owner
 * and, for a manager, on an owner.
 */
const initialState: SelfServiceActionState = { status: "idle" };

export function InviteMemberForm() {
  const [state, formAction, pending] = useActionState(inviteTeamMemberAction, initialState);
  const base = useId();
  const [role, setRole] = useState("broker_agent");
  const roleHint = TEAM_ROLE_DESCRIPTIONS[role];
  return (
    <Card title="Inviter un collaborateur" description="Le collaborateur reçoit l'e-mail d'activation, choisit son mot de passe puis enrôle sa MFA. Le rôle propriétaire est attribué par AssurMatch uniquement.">
      <Form action={formAction} columns={2} data-team-form="invite">
        <Field id={`${base}-name`} label="Nom affiché" required hint="Le nom qui apparaîtra dans l'équipe et sur les dossiers.">
          <Input {...fieldControlProps(`${base}-name`, { required: true, hint: "x" })} name="displayName" minLength={2} maxLength={120} autoComplete="off" />
        </Field>
        <Field id={`${base}-email`} label="E-mail professionnel" required hint="L'invitation d'activation est envoyée à cette adresse.">
          <Input {...fieldControlProps(`${base}-email`, { required: true, hint: "x" })} name="email" type="email" maxLength={160} autoComplete="off" autoCapitalize="none" />
        </Field>
        <Field id={`${base}-role`} label="Rôle" required hint={roleHint}>
          <Select
            {...fieldControlProps(`${base}-role`, { required: true, ...(roleHint ? { hint: "x" } : {}) })}
            name="role"
            value={role}
            options={[...TEAM_INVITE_ROLE_OPTIONS]}
            onChange={(event) => setRole(event.target.value)}
          />
        </Field>
        <Field id={`${base}-reason`} label="Commentaire (facultatif, audité)">
          <Input {...fieldControlProps(`${base}-reason`)} name="reason" maxLength={500} />
        </Field>
        {state.status !== "idle" && state.message ? <FormRow full><SelfServiceResult state={state} /></FormRow> : null}
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Invitation...">Inviter</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

const ACTION_COPY = {
  deactivate: { label: "Désactiver", title: "Désactiver le collaborateur", description: "Son accès est coupé dès sa prochaine requête : il ne peut plus se connecter. Son historique est conservé et vous pourrez le réactiver à tout moment.", tone: "danger" as const },
  reactivate: { label: "Réactiver", title: "Réactiver le collaborateur", description: "Il retrouve l'accès avec son rôle actuel (MFA toujours exigée).", tone: "primary" as const },
  role: { label: "Changer le rôle", title: "Changer le rôle", description: "Le collaborateur devra se reconnecter pour appliquer son nouveau rôle.", tone: "primary" as const }
};

export function MemberActionForm({ userId, displayName, action, currentRole }: { userId: string; displayName: string; action: "deactivate" | "reactivate" | "role"; currentRole?: string | undefined }) {
  const [state, formAction] = useActionState(teamMemberAction, initialState);
  const base = useId();
  const copy = ACTION_COPY[action];
  return (
    <div>
      <SelfServiceResult state={state} />
      <ConfirmDialog
        triggerLabel={copy.label}
        triggerVariant={action === "deactivate" ? "danger" : "secondary"}
        title={`${copy.title} : ${displayName}`}
        description={action === "role" && currentRole ? `Rôle actuel : ${TEAM_ROLE_LABELS[currentRole] ?? currentRole}. ${copy.description}` : copy.description}
        confirmLabel={copy.label}
        cancelLabel="Annuler"
        tone={copy.tone}
        formAction={formAction}
        dataAttributes={{ "data-team-form": `member-${action}` }}
      >
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="action" value={action} />
        {action === "role" ? (
          <Field id={`${base}-role`} label="Nouveau rôle" required hint={TEAM_INVITE_ROLE_OPTIONS.map((option) => `${option.label} : ${TEAM_ROLE_DESCRIPTIONS[option.value] ?? ""}`).join(" ")}>
            <Select {...fieldControlProps(`${base}-role`, { required: true, hint: "x" })} name="role" defaultValue={currentRole ?? "broker_agent"} options={[...TEAM_INVITE_ROLE_OPTIONS]} />
          </Field>
        ) : null}
        <Field id={`${base}-reason`} label="Motif (audité)" required hint="Au moins 8 caractères, conservé dans le journal d'audit.">
          <Input {...fieldControlProps(`${base}-reason`, { required: true, hint: "x" })} name="reason" minLength={8} maxLength={500} />
        </Field>
      </ConfirmDialog>
    </div>
  );
}

/**
 * Spec 064 FR-005: assigns one tenant custom role (or none) to a member. The custom role only narrows
 * the base role; the API refuses owners, oneself, other plans and suspended partners.
 */
export function CustomRoleForm({ userId, displayName, roles, currentRoleId }: { userId: string; displayName: string; roles: Array<{ id: string; name: string }>; currentRoleId?: string | undefined }) {
  const base = useId();
  return (
    <ConfirmDialog
      triggerLabel="Rôle personnalisé"
      triggerVariant="secondary"
      title={`Rôle personnalisé : ${displayName}`}
      description="Un rôle personnalisé restreint les permissions du rôle de base, il ne les étend jamais. Il s'applique dès la prochaine requête du collaborateur."
      confirmLabel="Attribuer"
      cancelLabel="Annuler"
      formAction={assignCustomRoleAction}
      dataAttributes={{ "data-team-form": "custom-role" }}
    >
      <input type="hidden" name="userId" value={userId} />
      <Field id={`${base}-custom-role`} label="Rôle personnalisé" required>
        <Select
          {...fieldControlProps(`${base}-custom-role`, { required: true })}
          name="customRoleId"
          defaultValue={currentRoleId ?? ""}
          options={[{ value: "", label: "Aucun rôle personnalisé" }, ...roles.map((role) => ({ value: role.id, label: role.name }))]}
        />
      </Field>
      <Field id={`${base}-custom-reason`} label="Motif (audité)" required hint="Au moins 3 caractères, conservé dans le journal d'audit.">
        <Input {...fieldControlProps(`${base}-custom-reason`, { required: true, hint: "x" })} name="reason" minLength={3} maxLength={500} />
      </Field>
    </ConfirmDialog>
  );
}
