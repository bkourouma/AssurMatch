import { redirect } from "next/navigation";
import { isBrokerProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { TENANT_SUSPENDED_MESSAGE, canMutateAccount, canReadAccount, isTenantReadOnly } from "../lib/broker-permissions";
import { readBrokerAccount, readBrokerCatalogChoices, readBrokerRequests, type PartnerChangeRequestView } from "../lib/self-service-api";
import {
  CAPACITY_LABELS,
  PARTNER_STATUS_LABELS,
  PLAN_LABELS,
  REQUEST_FIELD_LABELS,
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_TONES,
  REQUEST_TYPE_LABELS,
  selfServiceFormatDate
} from "../lib/self-service-messages";
import { Badge, Button, Card, DataTable, DescriptionList, Grid, Notice, PageHeader, PageStack, StateMessage, StatusBadge, TenantWriteGuard } from "../lib/ui/broker-ui";
import { CancelRequestForm, CompanyProfileForm, CoverageExtensionForm, IdentityChangeRequestForm } from "./company-forms";

/**
 * Spec 053 US1/US4 (G-01, G-04): « Société ». Every broker role reads the whole company profile
 * (identity, contacts, insurers, plan, quota, contractual SLA, status, coverage); the owner and the
 * managers edit contacts and presentation, and request identity changes and coverage extensions,
 * which AssurMatch decides. Plan, quota and SLA are contractual: read only.
 */
const BREADCRUMB = [{ label: "Organisation" }, { label: "Société" }];

export default async function BrokerCompanyPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/company", session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent("/company")}`);
  if (session.status !== "authenticated" || !isBrokerProfile(session.profile)) redirect("/login?error=access_denied&returnTo=%2Fcompany");
  if (!canReadAccount(session.profile)) {
    return (
      <PageStack>
        <PageHeader breadcrumb={BREADCRUMB} kicker="Profil société" title="Acces refuse" description="La consultation du profil société exige un rôle courtier." />
      </PageStack>
    );
  }
  const readOnlyTenant = isTenantReadOnly(session.profile);
  const canWrite = canMutateAccount(session.profile);

  const [accountResult, requestsResult, catalogResult] = await Promise.all([readBrokerAccount(), readBrokerRequests(), readBrokerCatalogChoices()]);
  if (accountResult.status === "unauthenticated") redirect(loginRedirect("/company", accountResult.error ?? "session_required"));
  const account = accountResult.data;
  if (!account) {
    return (
      <PageStack>
        <PageHeader breadcrumb={BREADCRUMB} kicker="Profil société" title="Profil indisponible" />
        <StateMessage tone="danger">Le profil société n&apos;a pas pu être chargé. Réessayez dans quelques instants.</StateMessage>
      </PageStack>
    );
  }

  const countryName = new Map(catalogResult.data.countries.map((country) => [country.id, `${country.name} (${country.code})`]));
  const productName = new Map(catalogResult.data.products.map((product) => [product.id, product.name]));
  const describeValue = (field: string, value: string | null | undefined) => {
    if (!value) return "-";
    if (field === "countryId") return countryName.get(value) ?? value;
    if (field === "productId") return productName.get(value) ?? value;
    return value;
  };
  const authorizedCountries = new Set(account.coverage.countries.map((entry) => entry.scopeId));
  const authorizedProducts = new Set(account.coverage.products.map((entry) => entry.scopeId));
  const extensionOptions = [
    ...catalogResult.data.countries.filter((country) => !authorizedCountries.has(country.id)).map((country) => ({ value: `country:${country.id}`, label: `Pays : ${country.name} (${country.code})` })),
    ...catalogResult.data.products.filter((product) => !authorizedProducts.has(product.id)).map((product) => ({ value: `product:${product.id}`, label: `Produit : ${product.name}` }))
  ];
  const requests = requestsResult.data;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={BREADCRUMB}
        kicker="Profil société"
        title={account.tradeName || account.legalName}
        description="Les données réglementaires (raison sociale, RCCM, pays, licences) ne changent qu'après vérification par AssurMatch, plateforme technique de mise en relation."
        actions={<Button href="/licenses" variant="secondary">Mes licences</Button>}
      />

      {readOnlyTenant ? <Notice tone="warning">{TENANT_SUSPENDED_MESSAGE}</Notice> : null}
      {!canWrite && !readOnlyTenant ? <Notice tone="info">Lecture seule : seuls le propriétaire et les managers modifient le profil et déposent des demandes.</Notice> : null}

      <Grid columns="two">
        <Card title="Identité" description="Modifiable uniquement par une demande examinée par AssurMatch.">
          <DescriptionList
            items={[
              { term: "Raison sociale", value: account.legalName },
              { term: "Nom commercial", value: account.tradeName ?? "-" },
              { term: "RCCM", value: account.registrationNumber ?? "-" },
              { term: "Pays principal", value: account.countryName ?? "-" },
              { term: "Ville", value: account.city ?? "-" }
            ]}
          />
        </Card>
        <Card title="Plan et engagements" description="Fixés au contrat de partenariat ; une évolution se demande à AssurMatch.">
          <DescriptionList
            items={[
              { term: "Statut", value: <Badge tone={account.effectiveStatus === "active" ? "success" : account.effectiveStatus === "suspended" || account.effectiveStatus === "expired" ? "danger" : "info"}>{PARTNER_STATUS_LABELS[account.effectiveStatus] ?? account.effectiveStatus}</Badge> },
              { term: "Plan", value: PLAN_LABELS[account.plan] ?? account.plan },
              { term: "Quota mensuel", value: `${account.quotaMonthlyLeads} leads` },
              { term: "Capacité", value: CAPACITY_LABELS[account.capacityStatus] ?? account.capacityStatus },
              { term: "SLA contractuel", value: account.slaTargetMinutes ? `${account.slaTargetMinutes} min avant première action` : "Non fixé" },
              { term: "Prochaine expiration de licence", value: selfServiceFormatDate(account.nextLicenseExpiration) }
            ]}
          />
        </Card>
      </Grid>

      <Card title="Contacts" description="Contacts communiqués à AssurMatch.">
        <DescriptionList
          columns={2}
          items={[
            { term: "E-mail principal", value: account.primaryEmail },
            { term: "WhatsApp principal", value: account.primaryWhatsApp },
            { term: "Contact administratif", value: [account.adminContactName, account.adminContactEmail, account.adminContactPhone].filter(Boolean).join(" · ") || "-" },
            { term: "Contact commercial", value: [account.commercialContactName, account.commercialContactEmail, account.commercialContactPhone].filter(Boolean).join(" · ") || "-" },
            { term: "Assureurs partenaires", value: account.partnerInsurers.length ? account.partnerInsurers.join(", ") : "-" }
          ]}
        />
      </Card>

      {canWrite || readOnlyTenant ? (
        <TenantWriteGuard readOnly={readOnlyTenant}>
          <CompanyProfileForm account={account} />
          <IdentityChangeRequestForm countries={catalogResult.data.countries.map((country) => ({ value: country.id, label: `${country.name} (${country.code})` }))} />
        </TenantWriteGuard>
      ) : null}

      <div id="couverture">
        <Grid columns="two">
          <Card title="Pays autorisés" description="« Licence valide » : couvert par une licence validée et non expirée.">
            <DataTable
              columns={[
                { key: "name", header: "Pays", render: (entry: (typeof account.coverage.countries)[number]) => `${entry.name}${entry.code ? ` (${entry.code})` : ""}` },
                { key: "licensed", header: "Licence", render: (entry: (typeof account.coverage.countries)[number]) => <Badge tone={entry.licensed ? "success" : "warning"}>{entry.licensed ? "Licence valide" : "Sans licence valide"}</Badge> }
              ]}
              items={account.coverage.countries}
              getKey={(entry) => entry.scopeId}
              emptyLabel="Aucun pays autorisé."
              aria-label="Pays autorisés"
            />
          </Card>
          <Card title="Produits autorisés">
            <DataTable
              columns={[
                { key: "name", header: "Produit", render: (entry: (typeof account.coverage.products)[number]) => entry.name },
                { key: "licensed", header: "Licence", render: (entry: (typeof account.coverage.products)[number]) => <Badge tone={entry.licensed ? "success" : "warning"}>{entry.licensed ? "Licence valide" : "Sans licence valide"}</Badge> }
              ]}
              items={account.coverage.products}
              getKey={(entry) => entry.scopeId}
              emptyLabel="Aucun produit autorisé."
              aria-label="Produits autorisés"
            />
          </Card>
        </Grid>
        {canWrite || readOnlyTenant ? (
          <TenantWriteGuard readOnly={readOnlyTenant}>
            <CoverageExtensionForm options={extensionOptions} />
          </TenantWriteGuard>
        ) : null}
      </div>

      <div id="demandes">
        <Card title="Mes demandes" description="Demandes de modification d'identité et d'extension de couverture, examinées par AssurMatch.">
          <DataTable
            columns={[
              { key: "type", header: "Demande", render: (request: PartnerChangeRequestView) => REQUEST_TYPE_LABELS[request.type] ?? request.type },
              {
                key: "changes",
                header: "Valeurs demandées",
                render: (request: PartnerChangeRequestView) => (
                  <ul className="bo-list">
                    {Object.entries(request.requestedChanges).map(([field, value]) => (
                      <li key={field}>
                        {REQUEST_FIELD_LABELS[field] ?? field} : {describeValue(field, value)}
                        {request.previousValues[field] !== undefined ? ` (actuel : ${describeValue(field, request.previousValues[field])})` : ""}
                      </li>
                    ))}
                  </ul>
                )
              },
              { key: "status", header: "Statut", render: (request: PartnerChangeRequestView) => <StatusBadge status={request.status} labels={REQUEST_STATUS_LABELS} tones={REQUEST_STATUS_TONES} /> },
              { key: "date", header: "Déposée le", render: (request: PartnerChangeRequestView) => selfServiceFormatDate(request.createdAt) },
              { key: "decision", header: "Décision", render: (request: PartnerChangeRequestView) => (request.decisionReason ? `${selfServiceFormatDate(request.decidedAt)} : ${request.decisionReason}` : "-") },
              {
                key: "actions",
                header: "Actions",
                render: (request: PartnerChangeRequestView) => (canWrite && request.status === "pending" ? <CancelRequestForm requestId={request.id} /> : null)
              }
            ]}
            items={requests}
            getKey={(request) => request.id}
            emptyLabel="Aucune demande déposée."
            aria-label="Demandes du courtier"
          />
        </Card>
      </div>
    </PageStack>
  );
}
