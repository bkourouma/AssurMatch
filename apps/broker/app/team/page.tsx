import { redirect } from "next/navigation";
import { isBrokerProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { TENANT_SUSPENDED_MESSAGE, canManageTeam, isBrokerOwner, isTenantReadOnly } from "../lib/broker-permissions";
import { readBrokerCustomRoles } from "../lib/broker-api";
import { readBrokerTeam, type BrokerTeamMemberView } from "../lib/self-service-api";
import { TEAM_ROLE_LABELS, TEAM_STATUS_LABELS, selfServiceFormatDate } from "../lib/self-service-messages";
import { Badge, Button, Card, Cluster, DataTable, Notice, PageHeader, PageStack, StateMessage, TenantWriteGuard } from "../lib/ui/broker-ui";
import styles from "../lib/ui/broker-screens.module.css";
import { CustomRoleForm, InviteMemberForm, MemberActionForm } from "./team-forms";

/**
 * Spec 053 US3 (G-03): « Equipe ». Tenant-safe: the list and every action go through the broker
 * routes `/broker/team` (never an admin route) and only cover the users of the session's partner.
 * Every broker role reads the team; the owner and the managers invite (manager, agent, read-only),
 * deactivate, reactivate and change roles. Guards: never oneself, never the last owner, never a
 * manager on an owner; the owner role is an AssurMatch decision. MFA stays mandatory.
 */
const BREADCRUMB = [{ label: "Organisation" }, { label: "Equipe" }];

const STATUS_TONES: Record<string, "success" | "warning" | "danger" | "disabled" | "info"> = {
  active: "success",
  invited: "info",
  suspended: "disabled",
  locked: "danger"
};

/** Spec 064 FR-005: outcome of a custom role assignment, redirected back as `?role=`. */
const ROLE_NOTICES: Record<string, string> = {
  assigned: "Rôle personnalisé attribué et audité. Il s'applique dès la prochaine requête du collaborateur.",
  cleared: "Rôle personnalisé retiré et audité : le collaborateur retrouve les permissions de son rôle de base.",
  forbidden: "Attribution refusée : plan Enterprise requis, droit de gérer l'équipe, collaborateur non propriétaire et différent de vous.",
  owner_required: "Seul le propriétaire peut modifier le rôle personnalisé d'un manager.",
  not_found: "Collaborateur ou rôle personnalisé introuvable pour votre cabinet.",
  invalid: "Saisie incomplète : choisissez un rôle et indiquez un motif.",
  suspended: TENANT_SUSPENDED_MESSAGE,
  error: "Attribution temporairement indisponible. Réessayez dans quelques instants."
};

export default async function BrokerTeamPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role: roleNotice } = await searchParams;
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/team", session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent("/team")}`);
  if (session.status !== "authenticated" || !isBrokerProfile(session.profile)) redirect("/login?error=access_denied&returnTo=%2Fteam");

  const readOnlyTenant = isTenantReadOnly(session.profile);
  const canManage = canManageTeam(session.profile);
  const actorIsOwner = isBrokerOwner(session.profile);
  const teamResult = await readBrokerTeam();
  if (teamResult.status === "unauthenticated") redirect(loginRedirect("/team", teamResult.error ?? "session_required"));
  const members = teamResult.data;

  // Spec 064: custom roles exist for Enterprise cabinets only; other plans make no extra API call.
  const isEnterprise = session.profile.partnerPlan === "enterprise";
  const customRolesResult = isEnterprise ? await readBrokerCustomRoles() : undefined;
  const customRoles = customRolesResult?.status === "success" ? customRolesResult.data : [];
  const customRoleOf = (memberId: string) => customRoles.find((role) => (role.memberIds ?? []).includes(memberId));

  const actionsFor = (member: BrokerTeamMemberView) => {
    if (!canManage || member.isSelf) return null;
    // A manager never acts on an owner; an owner's role is changed by AssurMatch only.
    if (member.isOwner && !actorIsOwner) return null;
    return (
      <Cluster>
        {member.status === "suspended"
          ? <MemberActionForm userId={member.id} displayName={member.displayName} action="reactivate" />
          : <MemberActionForm userId={member.id} displayName={member.displayName} action="deactivate" />}
        {!member.isOwner ? <MemberActionForm userId={member.id} displayName={member.displayName} action="role" currentRole={member.roles[0]} /> : null}
        {/* Only an owner may assign or clear the custom role of a manager (the API enforces it too). */}
        {isEnterprise && !member.isOwner && customRoles.length > 0 && (actorIsOwner || !member.roles.includes("broker_manager")) ? (
          <CustomRoleForm
            userId={member.id}
            displayName={member.displayName}
            roles={customRoles.map((role) => ({ id: role.id, name: role.name }))}
            currentRoleId={customRoleOf(member.id)?.id}
          />
        ) : null}
      </Cluster>
    );
  };

  return (
    <PageStack>
      <PageHeader
        breadcrumb={BREADCRUMB}
        title="Equipe"
        description="Lecture tenant-safe des utilisateurs de votre cabinet. Toute invitation, désactivation ou changement de rôle est audité ; la MFA reste obligatoire pour chacun."
        actions={canManage && !readOnlyTenant ? <Button href="#inviter">Inviter un collaborateur</Button> : null}
      />

      {readOnlyTenant ? <Notice tone="warning">{TENANT_SUSPENDED_MESSAGE}</Notice> : null}
      {roleNotice && ROLE_NOTICES[roleNotice] ? (
        <Notice tone={roleNotice === "assigned" || roleNotice === "cleared" ? "success" : "warning"}>{ROLE_NOTICES[roleNotice]}</Notice>
      ) : null}
      {!canManage && !readOnlyTenant ? (
        <Notice tone="info" title="Permissions conservees">Lecture seule : seuls le propriétaire et les managers gèrent l&apos;équipe.</Notice>
      ) : null}
      {teamResult.status === "error" ? <StateMessage tone="danger">L&apos;équipe n&apos;a pas pu être chargée. Réessayez dans quelques instants.</StateMessage> : null}

      <Card title="Membres" description="Le dernier propriétaire actif ne peut pas être désactivé ; personne ne modifie son propre accès.">
        <DataTable
          columns={[
            {
              key: "member",
              header: "Collaborateur",
              render: (member: BrokerTeamMemberView) => (
                <>
                  <strong>{member.displayName}</strong>
                  {member.isSelf ? <> <Badge tone="info">Vous</Badge></> : null}
                  <div className={styles.entryMeta}>{member.email}</div>
                </>
              )
            },
            { key: "role", header: "Rôle", render: (member: BrokerTeamMemberView) => member.roles.map((role) => TEAM_ROLE_LABELS[role] ?? role).join(", ") },
            ...(isEnterprise
              ? [{
                  key: "customRole",
                  header: "Rôle personnalisé",
                  render: (member: BrokerTeamMemberView) => customRoleOf(member.id)?.name ?? "Aucun"
                }]
              : []),
            { key: "status", header: "Statut", render: (member: BrokerTeamMemberView) => <Badge tone={STATUS_TONES[member.status] ?? "info"}>{TEAM_STATUS_LABELS[member.status] ?? member.status}</Badge> },
            { key: "mfa", header: "MFA", render: (member: BrokerTeamMemberView) => <Badge tone={member.mfaEnrolled ? "success" : "warning"}>{member.mfaEnrolled ? "Enrôlée" : "À enrôler"}</Badge> },
            { key: "login", header: "Dernière connexion", render: (member: BrokerTeamMemberView) => <span className="bo-ref">{selfServiceFormatDate(member.lastLoginAt)}</span> },
            { key: "actions", header: "Actions", render: (member: BrokerTeamMemberView) => (readOnlyTenant ? null : actionsFor(member)) }
          ]}
          items={members}
          getKey={(member) => member.id}
          emptyLabel="Aucun utilisateur."
          emptyDescription="Invitez un premier collaborateur : il reçoit l'e-mail d'activation puis enrôle sa MFA."
          aria-label="Membres de l'équipe"
        />
      </Card>

      {canManage || readOnlyTenant ? (
        <div id="inviter">
          <TenantWriteGuard readOnly={readOnlyTenant}>
            <InviteMemberForm />
          </TenantWriteGuard>
        </div>
      ) : null}
    </PageStack>
  );
}
