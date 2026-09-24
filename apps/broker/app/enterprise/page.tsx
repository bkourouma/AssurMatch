import { redirect } from "next/navigation";
import { loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { readBrokerAgencies, readBrokerBranding, readBrokerCustomRoles, readBrokerSla } from "../lib/broker-api";
import type { BrokerAgency, BrokerCustomRole } from "../lib/broker-api";
import { assignAgencyMemberAction, createAgencyAction, createCustomRoleAction, updateBrandingAction, updateSlaAction } from "../lib/enterprise-actions";
import {
  Badge,
  Button,
  Card,
  CheckboxGroup,
  ConfirmDialog,
  DataTable,
  Field,
  Form,
  FormActions,
  Grid,
  Input,
  KpiCard,
  Notice,
  PageHeader,
  PageStack,
  StatusBadge
} from "../lib/ui/broker-ui";
import type { DataTableColumn } from "../lib/ui/broker-ui";

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

/** Les statuts d'agence restent ceux de l'API: seule leur couleur est decidee ici. */
const AGENCY_TONES = { active: "success", suspended: "warning" } as const;

const BREADCRUMB = [{ label: "Organisation" }, { label: "Entreprise" }];

const agencyColumns: Array<DataTableColumn<BrokerAgency>> = [
  { key: "name", header: "Agence", render: (agency) => agency.name, sortable: true, sortValue: (agency) => agency.name },
  { key: "location", header: "Pays / ville", render: (agency) => `${agency.countryCode}${agency.city ? ` - ${agency.city}` : ""}` },
  { key: "status", header: "Statut", render: (agency) => <StatusBadge status={agency.status} tones={AGENCY_TONES} /> },
  {
    key: "members",
    header: "Membres",
    numeric: true,
    align: "right",
    render: (agency) => `${agency.memberCount} membre(s)`,
    sortable: true,
    sortValue: (agency) => agency.memberCount
  }
];

const roleColumns: Array<DataTableColumn<BrokerCustomRole>> = [
  { key: "name", header: "Role", render: (role) => role.name, sortable: true, sortValue: (role) => role.name },
  { key: "permissions", header: "Permissions accordees", render: (role) => role.permissions.join(", ") }
];

export default async function BrokerEnterprisePage({ searchParams }: { searchParams: Promise<{ ent?: string }> }) {
  const { ent } = await searchParams;
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/enterprise", session.status));
  if (session.status !== "authenticated") {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={BREADCRUMB}
          kicker="Enterprise"
          title="Acces refuse"
          description="L'espace Enterprise exige une session courtier authentifiee et la MFA verifiee."
        />
      </PageStack>
    );
  }
  if (session.profile.partnerPlan !== "enterprise") {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={BREADCRUMB}
          kicker="Enterprise"
          title="Espace Enterprise indisponible"
          description="Multi-agences, roles personnalises, engagement de reactivite et charte interne sont reserves au plan Enterprise."
          actions={<Badge tone="disabled">Plan Enterprise requis</Badge>}
        />
        <Notice tone="info">Votre plan actuel donne acces aux leads et au CRM selon vos permissions.</Notice>
      </PageStack>
    );
  }

  const [agencies, roles, sla, branding] = await Promise.all([readBrokerAgencies(), readBrokerCustomRoles(), readBrokerSla(), readBrokerBranding()]);

  return (
    <PageStack>
      <PageHeader
        breadcrumb={BREADCRUMB}
        kicker="Enterprise"
        title="Organisation du cabinet"
        description="Agences, roles internes, engagement de reactivite et charte du portail. Rien ici ne modifie l'eligibilite, le routage ou ce que voit un visiteur."
      />
      {ent && NOTICES[ent] ? (
        <Notice tone={ent.endsWith("created") || ent.endsWith("saved") || ent === "member_assigned" ? "success" : "warning"}>{NOTICES[ent]}</Notice>
      ) : null}

      <Card title="Agences">
        <DataTable
          columns={agencyColumns}
          items={agencies.status === "success" ? agencies.data : []}
          getKey={(agency) => agency.id}
          aria-label="Agences du cabinet"
          emptyLabel="Aucune agence enregistree."
          rowActions={(agency) => (
            <ConfirmDialog
              triggerLabel="Rattacher un membre"
              title={`Rattacher un membre a ${agency.name}`}
              description="Le rattachement est audite. Il ne modifie ni les permissions du membre ni le routage."
              confirmLabel="Rattacher"
              cancelLabel="Annuler"
              formAction={assignAgencyMemberAction}
            >
              <input type="hidden" name="agencyId" value={agency.id} />
              <Field id={`member-${agency.id}`} label="Identifiant du membre">
                <Input id={`member-${agency.id}`} name="memberId" placeholder="Identifiant du membre" aria-label="Identifiant du membre" />
              </Field>
              <Field id={`member-reason-${agency.id}`} label="Motif">
                <Input id={`member-reason-${agency.id}`} name="reason" placeholder="Motif" aria-label="Motif du rattachement" />
              </Field>
            </ConfirmDialog>
          )}
        />
        <Form action={createAgencyAction} columns={2}>
          <Field id="agency-name" label="Nom de l'agence">
            <Input id="agency-name" name="name" placeholder="Nom de l'agence" aria-label="Nom de l'agence" />
          </Field>
          <Field id="agency-country" label="Pays de l'agence">
            <Input id="agency-country" name="countryCode" maxLength={2} placeholder="CI" aria-label="Pays de l'agence" />
          </Field>
          <Field id="agency-city" label="Ville de l'agence">
            <Input id="agency-city" name="city" placeholder="Ville" aria-label="Ville de l'agence" />
          </Field>
          <Field id="agency-reason" label="Motif">
            <Input id="agency-reason" name="reason" placeholder="Motif" aria-label="Motif de creation" />
          </Field>
          <FormActions>
            <Button type="submit" variant="secondary">Creer une agence</Button>
          </FormActions>
        </Form>
      </Card>

      <Card title="Roles personnalises">
        <p>
          Un role personnalise ne peut accorder que des permissions courtier deja prevues par la plateforme, et jamais plus que le role de base du membre.
        </p>
        <DataTable
          columns={roleColumns}
          items={roles.status === "success" ? roles.data : []}
          getKey={(role) => role.id}
          aria-label="Roles personnalises du cabinet"
          emptyLabel="Aucun role personnalise."
        />
        <Form action={createCustomRoleAction}>
          <Field id="role-name" label="Nom du role">
            <Input id="role-name" name="name" placeholder="Nom du role" aria-label="Nom du role" />
          </Field>
          <CheckboxGroup
            legend="Permissions accordees"
            name="permissions"
            options={GRANTABLE_PERMISSIONS.map((permission) => ({ value: permission, label: permission }))}
          />
          <Field id="role-reason" label="Motif">
            <Input id="role-reason" name="reason" placeholder="Motif" aria-label="Motif de creation du role" />
          </Field>
          <FormActions>
            <Button type="submit" variant="secondary">Creer le role</Button>
          </FormActions>
        </Form>
      </Card>

      <Card title="Engagement de reactivite (SLA)">
        {sla.status === "success" ? (
          <>
            <Grid columns="kpi">
              <KpiCard label="Objectif premiere action" value={`${sla.data.firstActionTargetMinutes} min`} />
              <KpiCard label="Leads mesures" value={sla.data.leadsMeasured} helper={`${sla.data.windowDays} derniers jours`} />
              <KpiCard label="Dans l'objectif" value={sla.data.leadsWithinTarget} tone="info" />
              <KpiCard
                label="Taux de respect"
                value={`${Math.round(sla.data.complianceRate * 100)}%`}
                tone={sla.data.complianceRate >= 0.8 ? "success" : "warning"}
              />
              <KpiCard label="Delai moyen" value={sla.data.averageFirstActionMinutes === null ? "-" : `${sla.data.averageFirstActionMinutes} min`} />
            </Grid>
            <Form action={updateSlaAction} columns={2}>
              <Field id="sla-target" label="Objectif en minutes">
                <Input
                  id="sla-target"
                  name="firstActionTargetMinutes"
                  type="number"
                  min={5}
                  max={10080}
                  defaultValue={sla.data.firstActionTargetMinutes}
                  aria-label="Objectif en minutes"
                />
              </Field>
              <Field id="sla-reason" label="Motif">
                <Input id="sla-reason" name="reason" placeholder="Motif" aria-label="Motif de la mise a jour SLA" />
              </Field>
              <FormActions>
                <Button type="submit" variant="secondary">Enregistrer l'objectif</Button>
              </FormActions>
            </Form>
          </>
        ) : (
          <Notice tone="warning">SLA indisponible: {sla.error ?? "erreur inconnue"}.</Notice>
        )}
      </Card>

      <Card title="Charte du portail courtier">
        <p>
          La charte s'applique uniquement a votre back-office. Le comparateur public reste presente par AssurMatch, plateforme technique.
        </p>
        {branding.status === "success" ? (
          <Form action={updateBrandingAction} columns={2}>
            <Field id="branding-label" label="Libelle affiche">
              <Input id="branding-label" name="displayLabel" defaultValue={branding.data.displayLabel} aria-label="Libelle affiche" />
            </Field>
            <Field id="branding-color" label="Couleur principale">
              <Input id="branding-color" name="primaryColor" defaultValue={branding.data.primaryColor} aria-label="Couleur principale" />
            </Field>
            <Field id="branding-reason" label="Motif">
              <Input id="branding-reason" name="reason" placeholder="Motif" aria-label="Motif de la mise a jour de charte" />
            </Field>
            <FormActions>
              <Badge tone="info">{branding.data.platformMention}</Badge>
              <Button type="submit" variant="secondary">Enregistrer la charte</Button>
            </FormActions>
          </Form>
        ) : (
          <Notice tone="warning">Charte indisponible: {branding.error ?? "erreur inconnue"}.</Notice>
        )}
      </Card>
    </PageStack>
  );
}
