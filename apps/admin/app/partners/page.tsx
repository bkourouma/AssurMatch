import { redirect } from "next/navigation";
import {
  readAdminCountries,
  readAdminPartners,
  readPartnerSla,
  type AdminPartnerData,
  type AdminPartnerSlaRowData,
  type PartnerEffectiveStatus,
  type PartnerPlan
} from "../lib/admin-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { adminReadErrorMessage } from "../lib/catalog-messages";
import {
  PARTNER_CAPACITY_LABELS,
  PARTNER_PLAN_LABELS,
  PARTNER_PLAN_OPTIONS,
  PARTNER_STATUS_FILTER_OPTIONS,
  PARTNER_STATUS_LABELS,
  PARTNER_STATUS_TONES,
  canPreparePartner,
  daysUntil,
  partnerFormatDate,
  partnerStatusLabel
} from "../lib/partner-messages";
import {
  Badge,
  Button,
  Card,
  Cluster,
  DataTable,
  Field,
  FilterBar,
  Grid,
  Input,
  PageHeader,
  PageStack,
  Select,
  StateMessage,
  StatusBadge,
  fieldControlProps,
  paginateItems,
  readTableParams,
  sortItems
} from "../lib/ui/admin-ui";
import type { DataTableColumn } from "../lib/ui/admin-ui";
import { CreatePartnerForm } from "./partner-forms";

/**
 * Spec 051 US7: partner (courtier) directory, creation form and the SLA table of spec 045. The
 * status column shows the PRD label of the stored status and, when no valid licence remains, the
 * computed "Expiré" status (R1).
 */
const slaColumns: Array<DataTableColumn<AdminPartnerSlaRowData>> = [
  { key: "partner", header: "Partenaire", render: (row) => <strong>{row.partnerName}</strong>, sortable: true, sortValue: (row) => row.partnerName },
  { key: "plan", header: "Plan", render: (row) => row.plan, sortable: true, sortValue: (row) => row.plan },
  { key: "target", header: "Objectif", render: (row) => `${row.firstActionTargetMinutes} min`, numeric: true, align: "right", sortable: true, sortValue: (row) => row.firstActionTargetMinutes },
  { key: "measured", header: "Leads mesures", render: (row) => row.leadsMeasured, numeric: true, align: "right", sortable: true, sortValue: (row) => row.leadsMeasured },
  { key: "withinTarget", header: "Dans l'objectif", render: (row) => row.leadsWithinTarget, numeric: true, align: "right", sortable: true, sortValue: (row) => row.leadsWithinTarget },
  {
    key: "rate",
    header: "Taux",
    render: (row) => <Badge tone={row.complianceRate >= 0.8 ? "info" : "warning"}>{Math.round(row.complianceRate * 100)}%</Badge>,
    sortable: true,
    sortValue: (row) => row.complianceRate
  },
  {
    key: "average",
    header: "Delai moyen",
    render: (row) => (row.averageFirstActionMinutes === null ? "-" : `${row.averageFirstActionMinutes} min`),
    numeric: true,
    align: "right",
    sortable: true,
    sortValue: (row) => row.averageFirstActionMinutes
  }
];

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function PartnerStatusCell({ partner }: { partner: AdminPartnerData }) {
  return (
    <Cluster>
      <StatusBadge status={partner.status} labels={PARTNER_STATUS_LABELS} tones={PARTNER_STATUS_TONES} />
      {partner.effectiveStatus === "expired" ? <Badge tone="danger" title="Aucune licence valide et non expirée">Expiré</Badge> : null}
    </Cluster>
  );
}

function LicenseExpiryCell({ value }: { value: string | null }) {
  if (!value) return <Badge tone="warning">Aucune licence valide</Badge>;
  const days = daysUntil(value);
  return (
    <>
      {partnerFormatDate(value)}
      {days !== null && days <= 30 ? <> <Badge tone="warning">{`${days} j`}</Badge></> : null}
    </>
  );
}

export default async function PartnerDirectoryPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/partners", session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent("/partners")}`);
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) redirect("/login?error=access_denied&returnTo=%2Fpartners");
  const canPrepare = canPreparePartner(session.profile.roles);

  const params = searchParams ? await searchParams : {};
  const statusParam = firstParam(params.status);
  const countryParam = firstParam(params.countryId);
  const planParam = firstParam(params.plan);
  const expiringParam = Number.parseInt(firstParam(params.expiring), 10);
  const status = (PARTNER_STATUS_FILTER_OPTIONS as readonly string[]).includes(statusParam) ? statusParam as PartnerEffectiveStatus : undefined;
  const plan = (PARTNER_PLAN_OPTIONS as readonly string[]).includes(planParam) ? planParam as PartnerPlan : undefined;
  const expiring = Number.isInteger(expiringParam) && expiringParam >= 1 && expiringParam <= 730 ? expiringParam : undefined;
  const countryId = /^[0-9a-f-]{36}$/i.test(countryParam) ? countryParam : undefined;

  const [partners, countries, sla] = await Promise.all([
    readAdminPartners({ status, countryId, plan, licenseExpiringWithinDays: expiring }),
    readAdminCountries(),
    readPartnerSla()
  ]);
  if (partners.unauthenticated) redirect(loginRedirect("/partners", partners.error ?? "session_required"));

  const countryById = new Map(countries.data.map((country) => [country.id, country]));
  const countryChoices = countries.data
    .filter((country) => country.status !== "retired")
    .map((country) => ({ value: country.id, label: `${country.name} (${country.isoCode})` }));

  const directoryColumns: Array<DataTableColumn<AdminPartnerData>> = [
    {
      key: "name",
      header: "Courtier",
      render: (partner) => (
        <>
          <a href={`/partners/${encodeURIComponent(partner.id)}`}><strong>{partner.tradeName || partner.legalName}</strong></a>
          {partner.tradeName ? <div>{partner.legalName}</div> : null}
        </>
      ),
      sortable: true,
      sortValue: (partner) => partner.tradeName || partner.legalName
    },
    {
      key: "country",
      header: "Pays",
      render: (partner) => (partner.countryId ? countryById.get(partner.countryId)?.isoCode ?? "?" : "-"),
      sortable: true,
      sortValue: (partner) => (partner.countryId ? countryById.get(partner.countryId)?.isoCode ?? "" : "")
    },
    { key: "plan", header: "Plan", render: (partner) => PARTNER_PLAN_LABELS[partner.plan] ?? partner.plan, sortable: true, sortValue: (partner) => partner.plan },
    { key: "status", header: "Statut", render: (partner) => <PartnerStatusCell partner={partner} />, sortable: true, sortValue: (partner) => partner.effectiveStatus },
    {
      key: "license",
      header: "Expiration licence",
      render: (partner) => <LicenseExpiryCell value={partner.nextLicenseExpiration} />,
      sortable: true,
      sortValue: (partner) => partner.nextLicenseExpiration
    },
    {
      key: "capacity",
      header: "Quota / capacité",
      render: (partner) => `${partner.quotaMonthlyLeads} / mois · ${PARTNER_CAPACITY_LABELS[partner.capacityStatus] ?? partner.capacityStatus}`,
      numeric: true,
      align: "right",
      sortable: true,
      sortValue: (partner) => partner.quotaMonthlyLeads
    }
  ];

  const directoryTable = readTableParams(params, {
    pathname: "/partners",
    defaultSort: { key: "name", direction: "asc" },
    pageSize: 25
  });
  const directoryRows = paginateItems(sortItems(partners.data, directoryColumns, directoryTable.sort), directoryTable.page, directoryTable.pageSize);

  const slaItems: AdminPartnerSlaRowData[] = sla.status === "success" ? sla.data : [];
  const slaRows = sortItems(slaItems, slaColumns, { key: "partner", direction: "asc" });
  const activeFilters = [status, countryId, plan, expiring].filter(Boolean).length;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Partenaires" }, { label: "Courtiers" }]}
        kicker="Conformite partenaires"
        title="Courtiers partenaires"
        description="Annuaire, statuts, licences et agrements. Seul un courtier « Actif public » avec une licence valide est routable et visible des visiteurs."
        actions={<Button href="/partners/applications" variant="secondary">Candidatures</Button>}
      />
      <Grid columns="two">
        <Card
          title="Licences et agrements"
          description="Activation bloquee sans licence valide, preuve d'agrement acceptee, couverture, proprietaire et contrat enregistre. Les conditions sont listees sur chaque fiche."
        >
          <Badge tone="warning">Licence expiree = statut Expiré et inéligibilité immédiate</Badge>
        </Card>
        <Card
          title="Actions disponibles"
          description="Création et préparation : super_admin, admin_pays (son pays), compliance_admin. Activation, suspension, résiliation, validation de licence et revue des documents : conformité uniquement."
        >
          <Badge tone={canPrepare ? "info" : "disabled"}>{canPrepare ? "Préparation autorisée" : "Lecture seule"}</Badge>
        </Card>
      </Grid>

      <Card title="Annuaire des courtiers">
        <FilterBar
          action="/partners"
          label="Filtres courtiers"
          submitLabel="Filtrer"
          resetLabel="Reinitialiser"
          resetHref="/partners"
          activeCount={activeFilters}
          autoSubmit
        >
          <Field id="partners-status" label="Statut">
            <Select {...fieldControlProps("partners-status")} name="status" defaultValue={status ?? ""}>
              <option value="">Tous</option>
              {PARTNER_STATUS_FILTER_OPTIONS.map((option) => <option key={option} value={option}>{partnerStatusLabel(option)}</option>)}
            </Select>
          </Field>
          <Field id="partners-country" label="Pays">
            <Select {...fieldControlProps("partners-country")} name="countryId" defaultValue={countryId ?? ""}>
              <option value="">Tous</option>
              {countryChoices.map((country) => <option key={country.value} value={country.value}>{country.label}</option>)}
            </Select>
          </Field>
          <Field id="partners-plan" label="Plan">
            <Select {...fieldControlProps("partners-plan")} name="plan" defaultValue={plan ?? ""}>
              <option value="">Tous</option>
              {PARTNER_PLAN_OPTIONS.map((option) => <option key={option} value={option}>{PARTNER_PLAN_LABELS[option]}</option>)}
            </Select>
          </Field>
          <Field id="partners-expiring" label="Licence expirant sous N jours">
            <Input {...fieldControlProps("partners-expiring")} name="expiring" type="number" min={1} max={730} defaultValue={expiring ?? ""} placeholder="30" />
          </Field>
        </FilterBar>
        {partners.forbidden ? <StateMessage tone="danger">{adminReadErrorMessage("access_denied")}</StateMessage> : null}
        {partners.status === "error" ? <StateMessage tone="danger">{adminReadErrorMessage(partners.error)}</StateMessage> : null}
        <DataTable
          columns={directoryColumns}
          items={directoryRows}
          getKey={(partner) => partner.id}
          emptyLabel="Aucun courtier pour ces filtres."
          aria-label="Annuaire des courtiers"
          sort={directoryTable.sort}
          sortHref={directoryTable.sortHref}
          pagination={{
            page: directoryTable.page,
            pageSize: directoryTable.pageSize,
            total: partners.data.length,
            hrefFor: directoryTable.pageHref,
            label: (from, to, total) => `${from}-${to} sur ${total} courtiers`
          }}
        />
      </Card>

      {canPrepare ? <CreatePartnerForm countries={countryChoices} /> : null}

      <Card
        title="Engagement de reactivite (SLA) par partenaire"
        description="Delai de premiere action mesure sur les 30 derniers jours, rapporte a la cible contractuelle quand elle existe. Indicateur de suivi: aucune suspension automatique n'est declenchee par ce tableau."
      >
        <DataTable
          columns={slaColumns}
          items={slaRows}
          getKey={(row) => row.partnerTenantId}
          emptyLabel="Aucun partenaire mesure."
          aria-label="Engagement de reactivite par partenaire"
        />
      </Card>
    </PageStack>
  );
}
