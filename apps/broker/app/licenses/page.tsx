import { redirect } from "next/navigation";
import { isBrokerProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { TENANT_SUSPENDED_MESSAGE, canMutateAccount, canReadAccount, isTenantReadOnly } from "../lib/broker-permissions";
import { readBrokerCatalogChoices, readBrokerLicenses, type BrokerLicenseView } from "../lib/self-service-api";
import {
  DOCUMENT_STATUS_LABELS,
  LICENSE_STATUS_LABELS,
  LICENSE_STATUS_TONES,
  SCAN_STATUS_LABELS,
  selfServiceFormatDate
} from "../lib/self-service-messages";
import { Badge, Card, Cluster, DescriptionList, Notice, PageHeader, PageStack, StateMessage, StatusBadge, TenantWriteGuard } from "../lib/ui/broker-ui";
import { RenewLicenseForm, UploadProofForm } from "./license-forms";

/**
 * Spec 053 US2 (G-02): « Licences ». Every broker role sees its licences (status, dates, status
 * history, proofs without content). The owner and the managers submit a renewal and its proof; the
 * compliance of AssurMatch validates it in the admin partner page. A licence is never validated
 * from the broker portal.
 */
const BREADCRUMB = [{ label: "Organisation" }, { label: "Licences" }];

function LicenseCard({ license, licenses, canWrite, readOnlyTenant, products }: { license: BrokerLicenseView; licenses: BrokerLicenseView[]; canWrite: boolean; readOnlyTenant: boolean; products: Array<{ value: string; label: string }> }) {
  const renews = license.renewsLicenseId ? licenses.find((entry) => entry.id === license.renewsLicenseId)?.licenseNumber ?? "-" : null;
  const pendingRenewal = license.pendingRenewalId ? licenses.find((entry) => entry.id === license.pendingRenewalId) : undefined;
  return (
    <Card title={`Licence ${license.licenseNumber}`} actions={<StatusBadge status={license.effectiveStatus} labels={LICENSE_STATUS_LABELS} tones={LICENSE_STATUS_TONES} />}>
      <DescriptionList
        columns={2}
        items={[
          { term: "Autorité", value: license.issuingAuthority },
          { term: "Pays", value: license.countryName ?? license.countryId },
          { term: "Produits", value: license.productNames.length ? license.productNames.join(", ") : "Tous les produits du pays" },
          { term: "Effet", value: selfServiceFormatDate(license.effectiveDate) },
          { term: "Expiration", value: selfServiceFormatDate(license.expirationDate) },
          ...(renews ? [{ term: "Renouvelle", value: renews }] : []),
          ...(pendingRenewal ? [{ term: "Renouvellement en cours", value: `${pendingRenewal.licenseNumber} (${LICENSE_STATUS_LABELS[pendingRenewal.status] ?? pendingRenewal.status})` }] : [])
        ]}
      />
      {license.status === "pending_review" ? <Notice tone="info">En revue par la conformité AssurMatch : la licence n&apos;est pas utilisée pour le routage avant sa validation.</Notice> : null}
      {license.documents.length > 0 ? (
        <ul className="bo-list" aria-label={`Preuves de la licence ${license.licenseNumber}`}>
          {license.documents.map((document) => (
            <li key={document.id}>
              <Cluster>
                <span>{document.fileName ?? "Document"} — déposé le {selfServiceFormatDate(document.createdAt)}</span>
                <Badge tone={document.quarantined ? "danger" : document.scanStatus === "clean" ? "success" : "warning"}>{SCAN_STATUS_LABELS[document.scanStatus] ?? document.scanStatus}</Badge>
                <Badge tone={document.status === "accepted" ? "success" : document.status === "rejected" ? "danger" : "info"}>{DOCUMENT_STATUS_LABELS[document.status] ?? document.status}</Badge>
              </Cluster>
            </li>
          ))}
        </ul>
      ) : null}
      {license.history.length > 0 ? (
        <ol className="bo-list" aria-label={`Historique de la licence ${license.licenseNumber}`}>
          {license.history.map((entry, index) => (
            <li key={`${entry.createdAt}:${index}`}>
              {selfServiceFormatDate(entry.createdAt)} : {LICENSE_STATUS_LABELS[entry.fromStatus ?? ""] ?? "création"} → {LICENSE_STATUS_LABELS[entry.toStatus] ?? entry.toStatus}
            </li>
          ))}
        </ol>
      ) : null}
      {canWrite || readOnlyTenant ? (
        <TenantWriteGuard readOnly={readOnlyTenant}>
          {license.canUploadProof ? <UploadProofForm licenseId={license.id} licenseNumber={license.licenseNumber} /> : null}
          {license.canRenew ? <RenewLicenseForm licenseId={license.id} licenseNumber={license.licenseNumber} products={products} /> : null}
        </TenantWriteGuard>
      ) : null}
    </Card>
  );
}

export default async function BrokerLicensesPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/licenses", session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent("/licenses")}`);
  if (session.status !== "authenticated" || !isBrokerProfile(session.profile)) redirect("/login?error=access_denied&returnTo=%2Flicenses");
  if (!canReadAccount(session.profile)) {
    return (
      <PageStack>
        <PageHeader breadcrumb={BREADCRUMB} kicker="Licences" title="Acces refuse" description="La consultation des licences exige un rôle courtier." />
      </PageStack>
    );
  }
  const readOnlyTenant = isTenantReadOnly(session.profile);
  const canWrite = canMutateAccount(session.profile);
  const [licensesResult, catalogResult] = await Promise.all([readBrokerLicenses(), readBrokerCatalogChoices()]);
  if (licensesResult.status === "unauthenticated") redirect(loginRedirect("/licenses", licensesResult.error ?? "session_required"));
  const licenses = licensesResult.data;
  const products = catalogResult.data.products.map((product) => ({ value: product.id, label: product.name }));

  return (
    <PageStack>
      <PageHeader
        breadcrumb={BREADCRUMB}
        kicker="Licences"
        title="Mes licences"
        description="Une licence expirée, suspendue ou révoquée bloque la réception de demandes pour son périmètre. Déposez le renouvellement avant l'échéance : il est validé par la conformité AssurMatch."
      />
      {readOnlyTenant ? <Notice tone="warning">{TENANT_SUSPENDED_MESSAGE}</Notice> : null}
      {!canWrite && !readOnlyTenant ? <Notice tone="info">Lecture seule : seuls le propriétaire et les managers déposent un renouvellement.</Notice> : null}
      {licensesResult.status === "error" ? <StateMessage tone="danger">Les licences n&apos;ont pas pu être chargées. Réessayez dans quelques instants.</StateMessage> : null}
      {licensesResult.status === "success" && licenses.length === 0 ? <StateMessage>Aucune licence enregistrée. AssurMatch saisit la première licence lors de l&apos;onboarding.</StateMessage> : null}
      {licenses.map((license) => (
        <LicenseCard key={license.id} license={license} licenses={licenses} canWrite={canWrite} readOnlyTenant={readOnlyTenant} products={products} />
      ))}
    </PageStack>
  );
}
