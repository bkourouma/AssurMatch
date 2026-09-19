import { redirect } from "next/navigation";
import { loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { readBrokerAgencies, readBrokerBranding, readBrokerCustomRoles, readBrokerSla } from "../lib/broker-api";
import { assignAgencyMemberAction, createAgencyAction, createCustomRoleAction, updateBrandingAction, updateSlaAction } from "../lib/enterprise-actions";
import { Badge, Card, KpiCard, PageHeader, StateMessage } from "../lib/ui/broker-ui";

const NOTICES: Record<string, string> = {
  agency_created: "Agence creee et auditee.",
  member_assigned: "Membre rattache a l'agence.",
  role_created: "Role personnalise cree. Seules les permissions courtier autorisees sont conservees.",
  sla_saved: "Engagement de reactivite enregistre.",
  branding_saved: "Charte du portail courtier enregistree.",
  forbidden: "Action reservee au proprietaire d'un cabinet Enterprise.",
  not_found: "Element introuvable pour votre cabinet.",
  invalid: "Saisie incomplete.",
  error: "Espace Enterprise temporairement indisponible."
};

const GRANTABLE_PERMISSIONS = [
  "broker_leads:read",
  "broker_leads:update",
  "broker_leads:export",
  "broker_crm:read",
  "broker_crm:read_assigned",
  "broker_crm:update",
  "broker_crm:update_assigned",
  "broker_crm:assign",
  "broker_crm:export",
  "notifications:read"
];

export default async function BrokerEnterprisePage({ searchParams }: { searchParams: Promise<{ ent?: string }> }) {
  const { ent } = await searchParams;
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/enterprise", session.status));
  if (session.status !== "authenticated") {
    return (
      <div className="page-stack">
        <PageHeader kicker="Enterprise" title="Acces refuse" description="L'espace Enterprise exige une session courtier authentifiee et la MFA verifiee." />
      </div>
    );
  }
  if (session.profile.partnerPlan !== "enterprise") {
    return (
      <div className="page-stack">
        <PageHeader
          kicker="Enterprise"
          title="Espace Enterprise indisponible"
          description="Multi-agences, roles personnalises, engagement de reactivite et charte interne sont reserves au plan Enterprise."
          actions={<Badge tone="disabled">Plan Enterprise requis</Badge>}
        />
        <StateMessage tone="info">Votre plan actuel donne acces aux leads et au CRM selon vos permissions.</StateMessage>
      </div>
    );
  }

  const [agencies, roles, sla, branding] = await Promise.all([readBrokerAgencies(), readBrokerCustomRoles(), readBrokerSla(), readBrokerBranding()]);

  return (
    <div className="page-stack">
      <PageHeader
        kicker="Enterprise"
        title="Organisation du cabinet"
        description="Agences, roles internes, engagement de reactivite et charte du portail. Rien ici ne modifie l'eligibilite, le routage ou ce que voit un visiteur."
      />
      {ent && NOTICES[ent] ? <StateMessage tone={ent.endsWith("created") || ent.endsWith("saved") || ent === "member_assigned" ? "info" : "warning"}>{NOTICES[ent]}</StateMessage> : null}

      <Card plain>
        <h2 className="section-title">Agences</h2>
        {agencies.status === "success" && agencies.data.length > 0 ? (
          <ul className="simple-list">
            {agencies.data.map((agency) => (
              <li key={agency.id}>
                <div className="inline-cluster">
                  <strong>{agency.name}</strong>
                  <Badge tone={agency.status === "active" ? "success" : "warning"}>{agency.status}</Badge>
                  <span>{agency.countryCode}{agency.city ? ` - ${agency.city}` : ""}</span>
                  <span>{agency.memberCount} membre(s)</span>
                </div>
                <form action={assignAgencyMemberAction} className="inline-cluster">
                  <input type="hidden" name="agencyId" value={agency.id} />
                  <input name="memberId" placeholder="Identifiant du membre" aria-label="Identifiant du membre" />
                  <input name="reason" placeholder="Motif" aria-label="Motif du rattachement" />
                  <button type="submit" className="button button--secondary">Rattacher un membre</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="page-description">Aucune agence enregistree.</p>
        )}
        <form action={createAgencyAction} className="inline-cluster">
          <input name="name" placeholder="Nom de l'agence" aria-label="Nom de l'agence" />
          <input name="countryCode" maxLength={2} placeholder="CI" aria-label="Pays de l'agence" />
          <input name="city" placeholder="Ville" aria-label="Ville de l'agence" />
          <input name="reason" placeholder="Motif" aria-label="Motif de creation" />
          <button type="submit" className="button button--secondary">Creer une agence</button>
        </form>
      </Card>

      <Card plain>
        <h2 className="section-title">Roles personnalises</h2>
        <p className="page-description">
          Un role personnalise ne peut accorder que des permissions courtier deja prevues par la plateforme, et jamais plus que le role de base du membre.
        </p>
        {roles.status === "success" && roles.data.length > 0 ? (
          <ul className="simple-list">
            {roles.data.map((role) => (
              <li key={role.id}>
                <strong>{role.name}</strong>: {role.permissions.join(", ")}
              </li>
            ))}
          </ul>
        ) : (
          <p className="page-description">Aucun role personnalise.</p>
        )}
        <form action={createCustomRoleAction} className="page-stack">
          <input name="name" placeholder="Nom du role" aria-label="Nom du role" />
          <fieldset>
            <legend>Permissions accordees</legend>
            {GRANTABLE_PERMISSIONS.map((permission) => (
              <label key={permission}>
                <input type="checkbox" name="permissions" value={permission} />
                {permission}
              </label>
            ))}
          </fieldset>
          <input name="reason" placeholder="Motif" aria-label="Motif de creation du role" />
          <button type="submit" className="button button--secondary">Creer le role</button>
        </form>
      </Card>

      <Card plain>
        <h2 className="section-title">Engagement de reactivite (SLA)</h2>
        {sla.status === "success" ? (
          <>
            <div className="broker-grid broker-grid--kpi">
              <KpiCard label="Objectif premiere action" value={`${sla.data.firstActionTargetMinutes} min`} />
              <KpiCard label="Leads mesures" value={sla.data.leadsMeasured} helper={`${sla.data.windowDays} derniers jours`} />
              <KpiCard label="Dans l'objectif" value={sla.data.leadsWithinTarget} tone="info" />
              <KpiCard label="Taux de respect" value={`${Math.round(sla.data.complianceRate * 100)}%`} tone={sla.data.complianceRate >= 0.8 ? "success" : "warning"} />
              <KpiCard label="Delai moyen" value={sla.data.averageFirstActionMinutes === null ? "-" : `${sla.data.averageFirstActionMinutes} min`} />
            </div>
            <form action={updateSlaAction} className="inline-cluster">
              <input name="firstActionTargetMinutes" type="number" min={5} max={10080} defaultValue={sla.data.firstActionTargetMinutes} aria-label="Objectif en minutes" />
              <input name="reason" placeholder="Motif" aria-label="Motif de la mise a jour SLA" />
              <button type="submit" className="button button--secondary">Enregistrer l'objectif</button>
            </form>
          </>
        ) : (
          <StateMessage tone="warning">SLA indisponible: {sla.error ?? "erreur inconnue"}.</StateMessage>
        )}
      </Card>

      <Card plain>
        <h2 className="section-title">Charte du portail courtier</h2>
        <p className="page-description">
          La charte s'applique uniquement a votre back-office. Le comparateur public reste presente par AssurMatch, plateforme technique.
        </p>
        {branding.status === "success" ? (
          <form action={updateBrandingAction} className="inline-cluster">
            <input name="displayLabel" defaultValue={branding.data.displayLabel} aria-label="Libelle affiche" />
            <input name="primaryColor" defaultValue={branding.data.primaryColor} aria-label="Couleur principale" />
            <input name="reason" placeholder="Motif" aria-label="Motif de la mise a jour de charte" />
            <button type="submit" className="button button--secondary">Enregistrer la charte</button>
            <Badge tone="info">{branding.data.platformMention}</Badge>
          </form>
        ) : (
          <StateMessage tone="warning">Charte indisponible: {branding.error ?? "erreur inconnue"}.</StateMessage>
        )}
      </Card>
    </div>
  );
}
