import { redirect } from "next/navigation";
import {
  readAdminCountries,
  readAdminPartner,
  readAdminProducts,
  readPartnerSla,
  type AdminPartnerDetailData,
  type AdminPartnerDocumentData,
  type AdminPartnerLicenseData
} from "../../lib/admin-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { adminReadErrorMessage } from "../../lib/catalog-messages";
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  LICENSE_STATUS_LABELS,
  LICENSE_STATUS_TONES,
  PARTNER_CAPACITY_LABELS,
  PARTNER_PLAN_LABELS,
  PARTNER_STATUS_LABELS,
  PARTNER_STATUS_TONES,
  PARTNER_USER_ROLE_LABELS,
  SCAN_STATUS_LABELS,
  SCAN_STATUS_TONES,
  canDecidePartner,
  canDownloadPartnerDocuments,
  canPreparePartner,
  partnerFormatDate,
  partnerStatusLabel
} from "../../lib/partner-messages";
import {
  Badge,
  Button,
  Card,
  Cluster,
  DataTable,
  DescriptionList,
  Grid,
  Notice,
  PageHeader,
  PageStack,
  StateMessage,
  StatusBadge,
  userStatusTones
} from "../../lib/ui/admin-ui";
import {
  AuthorizeScopeForm,
  CreateLicenseForm,
  EditPartnerForm,
  InviteUserForm,
  LicenseActionForm,
  PartnerBlockers,
  PartnerStatusTransitionForm,
  RecordContractForm,
  RenewLicenseForm,
  ReviewDocumentForm,
  UploadDocumentForm,
  WithdrawScopeForm
} from "../partner-forms";

/**
 * Spec 051 US7: partner page. Identity, status and history, activation conditions with their
 * "Corriger" anchors, licences, documents (upload, scan, review, audited download), contract,
 * coverage, users and invitation, and a journal. Compliance-only actions are rendered for
 * compliance_admin and super_admin only; `support_admin` reads everything but the document content
 * and gets no action. The API re-checks every rule.
 */
interface PartnerDetailPageProps {
  params: Promise<{ partnerId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const NOTICES: Record<string, string> = {
  created: "Courtier créé en Prospect. Complétez licences, documents, couverture, propriétaire et contrat avant toute activation.",
  converted: "Candidature convertie : courtier Prospect et licence brouillon créés. Vérifiez la fiche avant de l'envoyer en vérification."
};

interface JournalEntry {
  key: string;
  at: string;
  label: string;
  reason: string | null;
}

function journalOf(partner: AdminPartnerDetailData): JournalEntry[] {
  const entries: JournalEntry[] = [
    ...partner.statusHistory.map((entry) => ({
      key: `status:${entry.id}`,
      at: entry.createdAt,
      label: `Statut : ${partnerStatusLabel(entry.fromStatus)} → ${partnerStatusLabel(entry.toStatus)}`,
      reason: entry.reason
    })),
    ...partner.licenses.flatMap((license) => license.history.map((entry) => ({
      key: `license:${entry.id}`,
      at: entry.createdAt,
      label: `Licence ${license.licenseNumber} : ${LICENSE_STATUS_LABELS[entry.fromStatus ?? ""] ?? "création"} → ${LICENSE_STATUS_LABELS[entry.toStatus] ?? entry.toStatus}`,
      reason: entry.reason
    }))),
    ...partner.documents.map((document) => ({
      key: `document:${document.id}`,
      at: document.reviewedAt ?? document.createdAt,
      label: `Document ${DOCUMENT_TYPE_LABELS[document.documentType] ?? document.documentType} : ${DOCUMENT_STATUS_LABELS[document.status] ?? document.status}`,
      reason: document.reviewReason
    })),
    ...partner.contracts.map((contract) => ({
      key: `contract:${contract.id}`,
      at: contract.createdAt,
      label: `Contrat ${contract.version} enregistré (signé le ${partnerFormatDate(contract.signedAt)} par ${contract.signatoryName})`,
      reason: null
    }))
  ];
  return entries.sort((left, right) => right.at.localeCompare(left.at));
}

export default async function PartnerDetailPage({ params, searchParams }: PartnerDetailPageProps) {
  const { partnerId } = await params;
  const query = searchParams ? await searchParams : {};
  const notice = typeof query.notice === "string" ? NOTICES[query.notice] : undefined;
  const path = `/partners/${partnerId}`;
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect(path, session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent(path)}`);
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) redirect(`/login?error=access_denied&returnTo=${encodeURIComponent(path)}`);
  const roles = session.profile.roles;
  const canDecide = canDecidePartner(roles);
  const canPrepare = canPreparePartner(roles);
  const canDownload = canDownloadPartnerDocuments(roles);

  const [partnerResult, countriesResult, productsResult, slaResult] = await Promise.all([
    readAdminPartner(partnerId),
    readAdminCountries(),
    readAdminProducts(),
    readPartnerSla()
  ]);
  if (partnerResult.unauthenticated) redirect(loginRedirect(path, partnerResult.error ?? "session_required"));
  const partner = partnerResult.data;

  if (!partner) {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={[{ label: "Partenaires" }, { label: "Courtiers", href: "/partners" }, { label: "Fiche" }]}
          title="Courtier indisponible"
          actions={<Button href="/partners" variant="secondary">Retour à l&apos;annuaire</Button>}
        />
        <StateMessage tone="danger">{adminReadErrorMessage(partnerResult.error)}</StateMessage>
      </PageStack>
    );
  }

  const retired = partner.status === "retired";
  const editable = canPrepare && !retired;
  const partnerRef = { id: partner.id, countryId: partner.countryId };
  const countryById = new Map(countriesResult.data.map((country) => [country.id, country]));
  const productById = new Map(productsResult.data.map((product) => [product.id, product]));
  const countryLabel = (id: string | null) => {
    if (!id) return "-";
    const country = countryById.get(id);
    return country ? `${country.name} (${country.isoCode})` : id;
  };
  const productLabel = (id: string) => productById.get(id)?.name ?? id;
  const countryChoices = countriesResult.data.filter((country) => country.status !== "retired").map((country) => ({ value: country.id, label: `${country.name} (${country.isoCode})` }));
  const productChoices = productsResult.data.filter((product) => product.status !== "retired").map((product) => ({ value: product.id, label: `${product.name} (${product.key})` }));
  const licenseChoices = partner.licenses
    .filter((license) => !["revoked", "superseded"].includes(license.status))
    .map((license) => ({ value: license.id, label: `${license.licenseNumber} (${countryLabel(license.countryId)})` }));
  const contractDocumentChoices = partner.documents
    .filter((document) => document.documentType === "partnership_contract" && document.scanStatus === "clean" && !document.quarantined && document.status !== "rejected")
    .map((document) => ({ value: document.id, label: `${document.fileName ?? document.id} (${partnerFormatDate(document.createdAt)})` }));
  const activeCountryIds = new Set(partner.coverage.countries.filter((entry) => entry.status === "active").map((entry) => entry.scopeId));
  const activeProductIds = new Set(partner.coverage.products.filter((entry) => entry.status === "active").map((entry) => entry.scopeId));
  const sla = slaResult.status === "success" ? slaResult.data.find((row) => row.partnerTenantId === partner.id) : undefined;
  const transitions = partner.allowedTransitions.filter((target) => (target === "pending_compliance" ? canPrepare : canDecide));
  const journal = journalOf(partner);

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Partenaires" }, { label: "Courtiers", href: "/partners" }, { label: partner.tradeName || partner.legalName }]}
        kicker="Fiche courtier"
        title={partner.tradeName || partner.legalName}
        description="Chaque modification est auditée avec son motif. Seul un courtier « Actif public » avec une licence valide est routable et visible des visiteurs."
        actions={
          <Cluster>
            <StatusBadge status={partner.status} labels={PARTNER_STATUS_LABELS} tones={PARTNER_STATUS_TONES} />
            {partner.effectiveStatus === "expired" ? <Badge tone="danger">Expiré</Badge> : null}
            <Button href="/partners" variant="secondary">Retour à l&apos;annuaire</Button>
          </Cluster>
        }
      />

      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {retired ? <Notice tone="warning">Courtier résilié : la fiche est en lecture seule et ses utilisateurs n&apos;ont plus accès au portail.</Notice> : null}
      {!canPrepare ? <Notice tone="info">Lecture seule : votre rôle ne permet aucune action sur les courtiers.</Notice> : null}

      <div id="identite">
        <Card title="Synthèse">
          <DescriptionList
            columns={2}
            items={[
              { term: "Raison sociale", value: partner.legalName },
              { term: "Pays principal", value: countryLabel(partner.countryId) },
              { term: "Ville", value: partner.city ?? "-" },
              { term: "RCCM", value: partner.registrationNumber ?? "-" },
              { term: "Plan", value: PARTNER_PLAN_LABELS[partner.plan] ?? partner.plan },
              { term: "Quota mensuel", value: `${partner.quotaMonthlyLeads} leads` },
              { term: "Capacité", value: PARTNER_CAPACITY_LABELS[partner.capacityStatus] ?? partner.capacityStatus },
              { term: "SLA contractuel", value: partner.slaTargetMinutes ? `${partner.slaTargetMinutes} min` : "Non fixé" },
              { term: "SLA mesuré (30 j)", value: sla ? `${Math.round(sla.complianceRate * 100)}% dans l'objectif, ${sla.leadsMeasured} leads` : "-" },
              { term: "Prochaine expiration", value: partnerFormatDate(partner.nextLicenseExpiration) },
              { term: "Assureurs partenaires", value: partner.partnerInsurers.length ? partner.partnerInsurers.join(", ") : "-" },
              { term: "Mis à jour", value: partnerFormatDate(partner.updatedAt) }
            ]}
          />
        </Card>
      </div>

      {editable ? <EditPartnerForm partner={partner} countries={countryChoices} /> : null}

      <Grid columns="two">
        <div id="statut">
          <Card title="Statut" description="Envoi en vérification : préparation. Activation, suspension, réactivation et résiliation : conformité uniquement.">
            <p>
              Statut actuel : <StatusBadge status={partner.status} labels={PARTNER_STATUS_LABELS} tones={PARTNER_STATUS_TONES} />
              {partner.statusReason ? <span className="bo-description"> ({partner.statusReason})</span> : null}
            </p>
            {transitions.length > 0 ? (
              <div data-partner-transitions="true">
                {transitions.map((target) => <PartnerStatusTransitionForm key={target} partner={partnerRef} target={target} />)}
              </div>
            ) : (
              <p className="bo-description">
                {partner.allowedTransitions.length === 0 ? "Aucune transition possible depuis ce statut." : "Les transitions possibles sont réservées à la conformité (compliance_admin, super_admin)."}
              </p>
            )}
          </Card>
        </div>
        <div id="conditions">
          <Card title="Conditions d'activation" description="Recalculées à chaque chargement ; une activation ou une réactivation est refusée tant qu'une condition manque.">
            {partner.activationBlockers.length === 0 ? (
              <Notice tone="success">Toutes les conditions d&apos;activation sont remplies.</Notice>
            ) : (
              <>
                <Notice tone="warning">{`${partner.activationBlockers.length} condition(s) non remplie(s).`}</Notice>
                <PartnerBlockers blockers={partner.activationBlockers} partner={partnerRef} />
              </>
            )}
          </Card>
        </div>
      </Grid>

      <div id="licences">
        <Card title="Licences" description="Statut effectif : une licence valide dont la date est passée est affichée expirée. Validation, suspension et révocation : conformité uniquement.">
          {partner.licenses.length === 0 ? <StateMessage>Aucune licence enregistrée.</StateMessage> : null}
          {partner.licenses.map((license: AdminPartnerLicenseData) => (
            <Card key={license.id} muted title={`Licence ${license.licenseNumber}`}>
              <DescriptionList
                columns={2}
                items={[
                  { term: "Statut effectif", value: <StatusBadge status={license.effectiveStatus} labels={LICENSE_STATUS_LABELS} tones={LICENSE_STATUS_TONES} /> },
                  { term: "Autorité", value: license.issuingAuthority },
                  { term: "Pays", value: countryLabel(license.countryId) },
                  { term: "Produits", value: license.productIds.length ? license.productIds.map(productLabel).join(", ") : "Tous les produits du pays" },
                  { term: "Effet", value: partnerFormatDate(license.effectiveDate) },
                  { term: "Expiration", value: partnerFormatDate(license.expirationDate) },
                  { term: "Validée le", value: partnerFormatDate(license.validatedAt) },
                  { term: "Renouvelle", value: license.renewsLicenseId ? partner.licenses.find((entry) => entry.id === license.renewsLicenseId)?.licenseNumber ?? license.renewsLicenseId : "-" }
                ]}
              />
              {editable ? (
                <Cluster>
                  {canDecide && ["draft", "pending_review"].includes(license.status) ? <LicenseActionForm partnerId={partner.id} licenseId={license.id} action="validate" /> : null}
                  {canDecide && license.status === "valid" ? <LicenseActionForm partnerId={partner.id} licenseId={license.id} action="suspend" /> : null}
                  {canDecide && !["revoked", "superseded"].includes(license.status) ? <LicenseActionForm partnerId={partner.id} licenseId={license.id} action="revoke" /> : null}
                  {!["revoked", "superseded"].includes(license.status) ? <RenewLicenseForm partnerId={partner.id} license={license} products={productChoices} /> : null}
                </Cluster>
              ) : null}
              {license.history.length > 0 ? (
                <ol className="bo-list" aria-label={`Historique de la licence ${license.licenseNumber}`}>
                  {license.history.map((entry) => (
                    <li key={entry.id}>
                      {partnerFormatDate(entry.createdAt)} : {LICENSE_STATUS_LABELS[entry.fromStatus ?? ""] ?? "création"} → {LICENSE_STATUS_LABELS[entry.toStatus] ?? entry.toStatus} — {entry.reason}
                    </li>
                  ))}
                </ol>
              ) : null}
            </Card>
          ))}
        </Card>
        {editable ? <CreateLicenseForm partnerId={partner.id} countries={countryChoices} products={productChoices} /> : null}
      </div>

      <div id="documents">
        <Card
          title="Documents d'agrément"
          description="Un fichier infecté est mis en quarantaine : il n'est jamais servi ni accepté. Le téléchargement est audité et n'est pas ouvert au support."
        >
          <DataTable
            columns={[
              {
                key: "document",
                header: "Document",
                render: (document: AdminPartnerDocumentData) => (
                  <>
                    <strong>{DOCUMENT_TYPE_LABELS[document.documentType] ?? document.documentType}</strong>
                    <div>{document.fileName ?? "-"}{document.sizeBytes ? ` · ${Math.ceil(document.sizeBytes / 1024)} Ko` : ""}</div>
                    {document.licenseId ? <div>Licence {partner.licenses.find((license) => license.id === document.licenseId)?.licenseNumber ?? document.licenseId}</div> : null}
                  </>
                )
              },
              {
                key: "scan",
                header: "Analyse",
                render: (document: AdminPartnerDocumentData) => (
                  <Cluster>
                    <StatusBadge status={document.scanStatus} labels={SCAN_STATUS_LABELS} tones={SCAN_STATUS_TONES} />
                    {document.quarantined ? <Badge tone="danger">Quarantaine</Badge> : null}
                  </Cluster>
                )
              },
              {
                key: "status",
                header: "Revue",
                render: (document: AdminPartnerDocumentData) => (
                  <>
                    <StatusBadge status={document.status} labels={DOCUMENT_STATUS_LABELS} />
                    {document.reviewReason ? <div className="bo-description">{document.reviewReason}</div> : null}
                  </>
                )
              },
              { key: "date", header: "Déposé le", render: (document: AdminPartnerDocumentData) => partnerFormatDate(document.createdAt) },
              {
                key: "actions",
                header: "Actions",
                render: (document: AdminPartnerDocumentData) => (
                  <Cluster>
                    {canDownload && !document.quarantined && document.scanStatus === "clean" ? (
                      <a
                        href={`/partners/${encodeURIComponent(partner.id)}/documents/${encodeURIComponent(document.id)}/file`}
                        data-partner-document-download="true"
                        download
                      >
                        Télécharger
                      </a>
                    ) : null}
                    {canDecide && !retired && ["uploaded", "pending_review"].includes(document.status) ? (
                      <ReviewDocumentForm partnerId={partner.id} document={document} />
                    ) : null}
                  </Cluster>
                )
              }
            ]}
            items={partner.documents}
            getKey={(document) => document.id}
            emptyLabel="Aucun document déposé."
            aria-label="Documents d'agrément du courtier"
          />
        </Card>
        {editable ? <UploadDocumentForm partnerId={partner.id} licenses={licenseChoices} /> : null}
      </div>

      <div id="contrat">
        <Card title="Contrat de partenariat" description="Le contrat est enregistré par l'admin à partir d'un document signé de type contrat de partenariat, analysé sain.">
          <DataTable
            columns={[
              { key: "version", header: "Version", render: (contract: AdminPartnerDetailData["contracts"][number]) => contract.version },
              { key: "signed", header: "Signé le", render: (contract: AdminPartnerDetailData["contracts"][number]) => partnerFormatDate(contract.signedAt) },
              { key: "signatory", header: "Signataire", render: (contract: AdminPartnerDetailData["contracts"][number]) => contract.signatoryName },
              { key: "recorded", header: "Enregistré le", render: (contract: AdminPartnerDetailData["contracts"][number]) => partnerFormatDate(contract.createdAt) }
            ]}
            items={partner.contracts}
            getKey={(contract) => contract.id}
            emptyLabel="Aucun contrat enregistré."
            aria-label="Contrats du courtier"
          />
          {editable ? (
            <>
              {contractDocumentChoices.length === 0 ? (
                <Notice tone="info">Téléversez d&apos;abord le contrat signé (type « Contrat de partenariat signé ») ; il doit être analysé sain.</Notice>
              ) : null}
              <RecordContractForm partnerId={partner.id} documents={contractDocumentChoices} />
            </>
          ) : null}
        </Card>
      </div>

      <div id="couverture">
        <Grid columns="two">
          <Card title="Pays autorisés" description="Une autorisation pays exige une licence du courtier pour ce pays.">
            <DataTable
              columns={[
                { key: "country", header: "Pays", render: (entry: AdminPartnerDetailData["coverage"]["countries"][number]) => countryLabel(entry.scopeId) },
                { key: "status", header: "Statut", render: (entry: AdminPartnerDetailData["coverage"]["countries"][number]) => <Badge tone={entry.status === "active" ? "success" : "disabled"}>{entry.status === "active" ? "Active" : `Retirée le ${partnerFormatDate(entry.withdrawnAt)}`}</Badge> },
                {
                  key: "action",
                  header: "Action",
                  render: (entry: AdminPartnerDetailData["coverage"]["countries"][number]) => (editable && entry.status === "active"
                    ? <WithdrawScopeForm partnerId={partner.id} scope="country" scopeId={entry.scopeId} label={countryLabel(entry.scopeId)} />
                    : null)
                }
              ]}
              items={partner.coverage.countries}
              getKey={(entry) => entry.scopeId}
              emptyLabel="Aucun pays autorisé."
              aria-label="Pays autorisés"
            />
            {editable ? <AuthorizeScopeForm partnerId={partner.id} scope="country" options={countryChoices.filter((choice) => !activeCountryIds.has(choice.value))} /> : null}
          </Card>
          <Card title="Produits autorisés" description="Un produit autorisé n'est routé que s'il est couvert par une licence valide.">
            <DataTable
              columns={[
                { key: "product", header: "Produit", render: (entry: AdminPartnerDetailData["coverage"]["products"][number]) => productLabel(entry.scopeId) },
                { key: "status", header: "Statut", render: (entry: AdminPartnerDetailData["coverage"]["products"][number]) => <Badge tone={entry.status === "active" ? "success" : "disabled"}>{entry.status === "active" ? "Active" : `Retirée le ${partnerFormatDate(entry.withdrawnAt)}`}</Badge> },
                {
                  key: "action",
                  header: "Action",
                  render: (entry: AdminPartnerDetailData["coverage"]["products"][number]) => (editable && entry.status === "active"
                    ? <WithdrawScopeForm partnerId={partner.id} scope="product" scopeId={entry.scopeId} label={productLabel(entry.scopeId)} />
                    : null)
                }
              ]}
              items={partner.coverage.products}
              getKey={(entry) => entry.scopeId}
              emptyLabel="Aucun produit autorisé."
              aria-label="Produits autorisés"
            />
            {editable ? <AuthorizeScopeForm partnerId={partner.id} scope="product" options={productChoices.filter((choice) => !activeProductIds.has(choice.value))} /> : null}
          </Card>
        </Grid>
      </div>

      <div id="utilisateurs">
        <Card title="Utilisateurs du courtier" description="Rôle propriétaire selon le plan : Propriétaire Starter pour Starter, Propriétaire Pro pour Pro et Enterprise.">
          <DataTable
            columns={[
              {
                key: "user",
                header: "Utilisateur",
                render: (user: AdminPartnerDetailData["users"][number]) => (
                  <>
                    <a href={`/users/${encodeURIComponent(user.id)}`}><strong>{user.displayName}</strong></a>
                    <div>{user.email}</div>
                  </>
                )
              },
              { key: "roles", header: "Rôles", render: (user: AdminPartnerDetailData["users"][number]) => user.roles.map((role) => PARTNER_USER_ROLE_LABELS[role] ?? role).join(", ") },
              { key: "status", header: "Statut", render: (user: AdminPartnerDetailData["users"][number]) => <StatusBadge status={user.status} tones={userStatusTones} /> }
            ]}
            items={partner.users}
            getKey={(user) => user.id}
            emptyLabel="Aucun utilisateur rattaché."
            aria-label="Utilisateurs du courtier"
          />
          {editable ? <InviteUserForm partnerId={partner.id} plan={partner.plan} /> : null}
        </Card>
      </div>

      <div id="historique">
        <Card title="Journal du courtier" description="Transitions de statut, de licences, revues de documents et contrats, du plus récent au plus ancien.">
          {journal.length === 0 ? (
            <StateMessage>Aucun événement enregistré.</StateMessage>
          ) : (
            <ol className="bo-list" aria-label="Journal du courtier">
              {journal.map((entry) => (
                <li key={entry.key}>
                  {partnerFormatDate(entry.at)} : {entry.label}{entry.reason ? ` — ${entry.reason}` : ""}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </PageStack>
  );
}
