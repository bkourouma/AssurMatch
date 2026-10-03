import { redirect } from "next/navigation";
import { loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { TENANT_SUSPENDED_MESSAGE, canMutateOffers, canReadOffers, isTenantReadOnly } from "../../lib/broker-permissions";
import { readBrokerOffer, readOfferScopeChoices, type OfferVersionView } from "../../lib/offer-api";
import {
  OFFER_STATUS_LABELS,
  OFFER_STATUS_TONES,
  OFFER_VERSION_STATUS_LABELS,
  OFFER_VERSION_STATUS_TONES,
  PAYMENT_FLEXIBILITY_LABELS,
  formatDiffValue,
  formatPriceRange,
  offerDisplayName,
  offerFormatDate
} from "../../lib/offer-messages";
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
  StatusBadge,
  TenantWriteGuard
} from "../../lib/ui/broker-ui";
import type { DataTableColumn } from "../../lib/ui/broker-ui";
import {
  CompletenessChecklist,
  EditBrokerOfferForm,
  RenewBrokerOfferForm,
  SubmitBrokerOfferForm,
  WithdrawBrokerOfferForm
} from "../offer-forms";

/**
 * Spec 052 US1/US3/US5: one offer of the broker. The published version is shown read-only; the
 * version in progress (draft or submitted) is the one edited. Owner and managers edit, submit,
 * withdraw and renew; agents and read-only users consult; a suspended partner sees the write area
 * disabled (spec 051 FR-021). Another broker's offer answers "introuvable" (FR-008).
 */
interface BrokerOfferPageProps {
  params: Promise<{ offerId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function VersionDetails({ version }: { version: OfferVersionView }) {
  const content = version.content;
  return (
    <DescriptionList
      items={[
        { term: "Version", value: <Cluster><span>{`v${version.versionNumber}`}</span><StatusBadge status={version.status} labels={OFFER_VERSION_STATUS_LABELS} tones={OFFER_VERSION_STATUS_TONES} /></Cluster> },
        { term: "Nom commercial", value: content.name },
        { term: "Assureur porteur", value: content.insurerName ?? "-" },
        { term: "Description", value: content.shortDescription ?? "-" },
        { term: "Garanties", value: content.guarantees.length ? formatDiffValue(content.guarantees) : "-" },
        { term: "Exclusions", value: content.exclusionsSummary ?? "-" },
        { term: "Franchise / plafond", value: `${content.deductibleAmount ?? "-"} / ${content.coverageCeiling ?? "-"}` },
        { term: "Documents requis", value: content.requiredDocuments.join(" ; ") || "-" },
        { term: "Délai moyen", value: content.processingDelayDays !== undefined ? `${content.processingDelayDays} jours` : "-" },
        { term: "Prix indicatif", value: formatPriceRange(content.indicativePriceMin, content.indicativePriceMax, content.currency, content.pricingUnit) },
        { term: "Paiement", value: content.paymentFlexibility ? PAYMENT_FLEXIBILITY_LABELS[content.paymentFlexibility] ?? content.paymentFlexibility : "-" },
        { term: "Validité", value: `${offerFormatDate(content.validFrom)} → ${offerFormatDate(content.validUntil)}` },
        { term: "Source", value: content.sourceOfInformation ?? "-" },
        { term: "Mentions", value: content.publicDisclaimers.join(" ; ") || "-" },
        ...(content.isSponsored ? [{ term: "Sponsorisation", value: `Sponsorisé${content.sponsorLabel ? ` (${content.sponsorLabel})` : ""} : décision AssurMatch` }] : []),
        { term: "Complétude", value: `${version.completeness.score} %` }
      ]}
    />
  );
}

const versionColumns: Array<DataTableColumn<OfferVersionView>> = [
  { key: "number", header: "Version", render: (version) => `v${version.versionNumber}`, numeric: true },
  { key: "status", header: "Statut", render: (version) => <StatusBadge status={version.status} labels={OFFER_VERSION_STATUS_LABELS} tones={OFFER_VERSION_STATUS_TONES} /> },
  { key: "author", header: "Auteur", render: (version) => (version.authorRole === "admin" ? "AssurMatch" : "Cabinet") },
  { key: "submitted", header: "Soumise le", render: (version) => offerFormatDate(version.submittedAt) },
  { key: "decision", header: "Décision", render: (version) => (version.lastDecision ? `${version.lastDecision === "validated" ? "Validée" : "Refusée"} le ${offerFormatDate(version.decidedAt)}` : "-") },
  { key: "reason", header: "Motif", render: (version) => version.decisionReason ?? "-" }
];

export default async function BrokerOfferPage({ params, searchParams }: BrokerOfferPageProps) {
  const { offerId } = await params;
  const query = searchParams ? await searchParams : {};
  const path = `/offers/${encodeURIComponent(offerId)}`;
  const breadcrumb = [{ label: "Activite" }, { label: "Mes offres", href: "/offers" }, { label: "Offre" }];
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect(path, session.status));
  if (session.status !== "authenticated" || !canReadOffers(session.profile)) {
    return (
      <PageStack>
        <PageHeader breadcrumb={breadcrumb} kicker="Offres" title="Acces refuse" description="La consultation des offres exige une session courtier authentifiee et la MFA verifiee." />
      </PageStack>
    );
  }
  const readOnlyTenant = isTenantReadOnly(session.profile);
  // Owner or manager: the write area is rendered, disabled while the partner is suspended.
  const writer = canMutateOffers({ ...session.profile, tenantReadOnly: false, partnerTenantStatus: "active" });

  const [result, scopes] = await Promise.all([readBrokerOffer(offerId), readOfferScopeChoices()]);
  if (result.status === "unauthenticated") redirect(loginRedirect(path, result.error ?? "session_required"));
  const offer = result.data;
  if (!offer) {
    return (
      <PageStack>
        <PageHeader breadcrumb={breadcrumb} kicker="Offres" title="Offre introuvable" description="Cette offre n'existe pas ou n'appartient pas à votre cabinet." />
        <Button href="/offers" variant="secondary">Retour à mes offres</Button>
      </PageStack>
    );
  }

  const scope = scopes.find((item) => item.countryId === offer.countryId && item.productId === offer.productId);
  const published = offer.published;
  const pending = offer.pending;
  const withdrawn = offer.status === "withdrawn";
  const expired = offer.status === "expired" || (offer.expiresInDays !== undefined && offer.expiresInDays < 0);
  const notice = query.notice === "created" ? "Offre créée en brouillon (version 1). Complétez-la puis soumettez-la à validation." : undefined;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Activite" }, { label: "Mes offres", href: "/offers" }, { label: offerDisplayName(offer) }]}
        kicker={offer.offerType === "partner" ? "Offre partenaire" : "Offre indicative"}
        title={offerDisplayName(offer)}
        description={`${scope ? `${scope.countryLabel} · ${scope.productLabel}` : "Périmètre non ouvert au public"}. Offre indicative : prix à confirmer par le courtier partenaire.`}
        actions={
          <Cluster>
            <StatusBadge status={offer.status} labels={OFFER_STATUS_LABELS} tones={OFFER_STATUS_TONES} />
            {offer.expiringSoon && !expired ? <Badge tone="warning">{`Expire dans ${offer.expiresInDays ?? 0} jours`}</Badge> : null}
            {offer.isSponsored ? <Badge tone="warning">Sponsorisé</Badge> : null}
          </Cluster>
        }
      />
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {readOnlyTenant ? <Notice tone="warning">{TENANT_SUSPENDED_MESSAGE}</Notice> : null}
      {!writer ? <Notice tone="info">Consultation seule : seuls le propriétaire et les managers du cabinet modifient les offres.</Notice> : null}
      {offer.suspensionReason ? <Notice tone="danger" title="Offre suspendue par AssurMatch">{offer.suspensionReason}</Notice> : null}
      {offer.lastDecisionReason && !offer.suspensionReason ? <Notice tone="warning" title="Motif du dernier refus">{offer.lastDecisionReason}</Notice> : null}
      {expired && !withdrawn ? <Notice tone="warning" title="Offre expirée">Elle n&apos;est plus affichée au public. Renouvelez-la avec de nouvelles dates : une nouvelle version sera à valider.</Notice> : null}

      <Grid columns="two">
        <Card title="Version publiée" description="Visible du public tant qu'aucune nouvelle version n'est validée. Lecture seule.">
          {published ? <VersionDetails version={published} /> : <p>Aucune version publiée.</p>}
        </Card>
        <Card
          title="Version en cours"
          description={pending?.status === "submitted" ? "En attente de validation par AssurMatch." : "Brouillon : soumettez-le quand la complétude minimale est atteinte."}
        >
          {pending ? (
            <>
              <VersionDetails version={pending} />
              <CompletenessChecklist completeness={pending.completeness} />
            </>
          ) : <p>Aucune version en cours.</p>}
        </Card>
      </Grid>

      {writer && !withdrawn ? (
        <TenantWriteGuard readOnly={readOnlyTenant}>
          <Card title="Actions" description="Chaque action est auditée.">
            <Cluster>
              {pending ? <WithdrawBrokerOfferForm offerId={offer.id} target="pending" /> : null}
              {published ? <WithdrawBrokerOfferForm offerId={offer.id} target="offer" /> : null}
            </Cluster>
            {pending?.status === "draft" ? <SubmitBrokerOfferForm offerId={offer.id} complete={pending.completeness.complete} /> : null}
          </Card>
          {published && !pending ? (
            <Card title="Renouveler" description="Crée une nouvelle version avec de nouvelles dates de validité, à soumettre à validation.">
              <RenewBrokerOfferForm offerId={offer.id} />
            </Card>
          ) : null}
          <EditBrokerOfferForm
            offerId={offer.id}
            concurrencyToken={offer.concurrencyToken}
            content={(pending ?? published)?.content}
            hasPending={Boolean(pending)}
            pendingSubmitted={pending?.status === "submitted"}
          />
        </TenantWriteGuard>
      ) : null}

      <Card title="Historique des versions">
        <DataTable
          columns={versionColumns}
          items={offer.versions ?? []}
          getKey={(version) => version.id}
          aria-label="Historique des versions"
          emptyLabel="Aucune version."
        />
      </Card>
    </PageStack>
  );
}
