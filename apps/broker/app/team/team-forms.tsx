"use client";

import { useActionState, useId } from "react";
import { inviteTeamMemberAction, teamMemberAction, type SelfServiceActionState } from "../lib/self-service-actions";
import { TEAM_INVITE_ROLE_OPTIONS } from "../lib/self-service-messages";
import { Button, Card, ConfirmDialog, Field, Form, FormActions, Input, Select, fieldControlProps } from "../lib/ui/broker-ui";
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
  return (
    <Card title="Inviter un collaborateur" description="Le collaborateur reçoit l'e-mail d'activation, choisit son mot de passe puis enrôle sa MFA. Le rôle propriétaire est attribué par AssurMatch uniquement.">
      <SelfServiceResult state={state} />
      <Form action={formAction} columns={2} data-team-form="invite">
        <Field id={`${base}-name`} label="Nom affiché" required>
          <Input {...fieldControlProps(`${base}-name`, { required: true })} name="displayName" minLength={2} maxLength={120} />
        </Field>
        <Field id={`${base}-email`} label="E-mail professionnel" required>
          <Input {...fieldControlProps(`${base}-email`, { required: true })} name="email" type="email" maxLength={160} />
        </Field>
        <Field id={`${base}-role`} label="Rôle" required>
          <Select {...fieldControlProps(`${base}-role`, { required: true })} name="role" defaultValue="broker_agent" options={[...TEAM_INVITE_ROLE_OPTIONS]} />
        </Field>
        <Field id={`${base}-reason`} label="Commentaire (facultatif, audité)">
          <Input {...fieldControlProps(`${base}-reason`)} name="reason" maxLength={500} />
        </Field>
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Invitation...">Inviter</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

const ACTION_COPY = {
  deactivate: { label: "Désactiver", title: "Désactiver le collaborateur", description: "Son accès est coupé dès sa prochaine requête. Son historique est conservé.", tone: "danger" as const },
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
        description={copy.description}
        confirmLabel={copy.label}
        cancelLabel="Annuler"
        tone={copy.tone}
        formAction={formAction}
        dataAttributes={{ "data-team-form": `member-${action}` }}
      >
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="action" value={action} />
        {action === "role" ? (
          <Field id={`${base}-role`} label="Nouveau rôle" required>
            <Select {...fieldControlProps(`${base}-role`, { required: true })} name="role" defaultValue={currentRole ?? "broker_agent"} options={[...TEAM_INVITE_ROLE_OPTIONS]} />
          </Field>
        ) : null}
        <Field id={`${base}-reason`} label="Motif (audité)" required hint="Au moins 8 caractères, conservé dans le journal d'audit.">
          <Input {...fieldControlProps(`${base}-reason`, { required: true, hint: "x" })} name="reason" minLength={8} maxLength={500} />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
