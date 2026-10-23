import { redirect } from "next/navigation";
import {
  readAdminCountries,
  readAdminOffer,
  readAdminPartners,
  readAdminProducts,
  type AdminOfferDetailView,
  type OfferVersionDiffEntryData,
  type OfferVersionView
} from "../../lib/admin-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { adminReadErrorMessage } from "../../lib/catalog-messages";
import { readAdminInsurers, readAdminOfferAiSummary } from "../../lib/lot4-offers-api";
import {
  OFFER_STATUS_LABELS,
  OFFER_STATUS_TONES,
  PRIVATE_OFFER_BADGE,
  OFFER_VERSION_STATUS_LABELS,
  OFFER_VERSION_STATUS_TONES,
  canDecideOffer,
  canPrepareOffer,
  canSubmitOffer,
  formatDiffValue,
  formatPriceRange,
  offerFieldLabel,
  offerFormatDate,
  offerTypeLabel
} from "../../lib/offer-messages";
import {
  Badge,
  Card,
  Cluster,
  DataTable,
  DescriptionList,
  Grid,
  Notice,
  PageHeader,
  PageStack,
  StateMessage,
  StatusBadge
} from "../../lib/ui/admin-ui";
import type { DataTableColumn } from "../../lib/ui/admin-ui";
import { CompletenessChecklist, EditOfferForm, OfferDecisionForm } from "../offer-forms";
import { OfferAiSummaryCard } from "../offer-ai-summary";

/**
 * Spec 052 US2/US3/US5: offer page. Published and pending versions side by side with the field
 * diff, version history, versioned edit form (preparers), submission, and the compliance-only
 * decisions (validate, reject, suspend) behind a confirmation dialog with an audited reason.
 */
interface OfferPageProps {
  params: Promise<{ offerId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function VersionSummary({ version }: { version: OfferVersionView }) {
  const content = version.content;
  return (
    <DescriptionList
      items={[
        { term: "Version", value: <Cluster><span>{`v${version.versionNumber}`}</span><StatusBadge status={version.status} labels={OFFER_VERSION_STATUS_LABELS} tones={OFFER_VERSION_STATUS_TONES} /></Cluster> },
        { term: "Nom commercial", value: content.name },
        { term: "Assureur porteur", value: content.insurerName ? `${content.insurerName}${content.insurerId ? " (référentiel)" : ""}` : "-" },
        { term: "Prix indicatif", value: formatPriceRange(content.indicativePriceMin, content.indicativePriceMax, content.currency, content.pricingUnit) },
        { term: "Garanties", value: content.guarantees.length ? formatDiffValue(content.guarantees) : "-" },
        { term: "Validité", value: `${offerFormatDate(content.validFrom)} → ${offerFormatDate(content.validUntil)}` },
        { term: "Source", value: content.sourceOfInformation ?? "-" },
        { term: "Mentions", value: content.publicDisclaimers.join(" ; ") || "-" },
        { term: "Sponsorisation", value: content.isSponsored ? `Sponsorisé${content.sponsorLabel ? ` (${content.sponsorLabel})` : ""}, priorité ${content.displayPriority}` : "Non" },
        { term: "Auteur", value: version.authorRole === "admin" ? "Admin plateforme" : "Courtier" },
        { term: "Complétude", value: `${version.completeness.score} %` },
        ...(version.decisionReason ? [{ term: version.lastDecision === "rejected" ? "Motif du refus" : "Motif de décision", value: version.decisionReason }] : [])
      ]}
    />
  );
}

const versionColumns: Array<DataTableColumn<OfferVersionView>> = [
  { key: "number", header: "Version", render: (version) => `v${version.versionNumber}`, numeric: true },
  { key: "status", header: "Statut", render: (version) => <StatusBadge status={version.status} labels={OFFER_VERSION_STATUS_LABELS} tones={OFFER_VERSION_STATUS_TONES} /> },
  { key: "author", header: "Auteur", render: (version) => (version.authorRole === "admin" ? "Admin" : "Courtier") },
  { key: "submitted", header: "Soumise le", render: (version) => offerFormatDate(version.submittedAt) },
  {
    key: "decision",
    header: "Décision",
    render: (version) => (version.lastDecision ? `${version.lastDecision === "validated" ? "Validée" : "Refusée"} le ${offerFormatDate(version.decidedAt)}` : "-")
  },
  { key: "reason", header: "Motif", render: (version) => version.decisionReason ?? "-" },
  { key: "completeness", header: "Complétude", render: (version) => `${version.completeness.score} %`, numeric: true, align: "right" }
];

const diffColumns: Array<DataTableColumn<OfferVersionDiffEntryData>> = [
  { key: "field", header: "Champ", render: (entry) => <strong>{offerFieldLabel(entry.field)}</strong> },
  { key: "published", header: "Version publiée", render: (entry) => formatDiffValue(entry.published) },
  { key: "pending", header: "Version en cours", render: (entry) => formatDiffValue(entry.pending) }
];

function offerTitle(offer: AdminOfferDetailView): string {
  return offer.published?.content.name ?? offer.pending?.content.name ?? offer.publicKey;
}

export default async function AdminOfferPage({ params, searchParams }: OfferPageProps) {
  const { offerId } = await params;
  const query = searchParams ? await searchParams : {};
  const path = `/offers/${encodeURIComponent(offerId)}`;
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect(path, session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent(path)}`);
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) redirect(`/login?error=access_denied&returnTo=${encodeURIComponent(path)}`);
  const roles = session.profile.roles;
  const canPrepare = canPrepareOffer(roles);
  const canDecide = canDecideOffer(roles);

  const [offerResult, countries, products, partners, aiSummary] = await Promise.all([
    readAdminOffer(offerId),
    readAdminCountries(),
    readAdminProducts(),
    canPrepare ? readAdminPartners() : Promise.resolve({ status: "success" as const, data: [] }),
    readAdminOfferAiSummary(offerId)
  ]);
  if (offerResult.unauthenticated) redirect(loginRedirect(path, offerResult.error ?? "session_required"));
  const offer = offerResult.data;
  const breadcrumb = [{ label: "Catalogue" }, { label: "Offres indicatives", href: "/offers" }, { label: offer ? offerTitle(offer) : "Offre" }];
  if (!offer) {
    return (
      <PageStack>
        <PageHeader breadcrumb={breadcrumb} title="Offre introuvable" />
        <StateMessage tone="danger">{adminReadErrorMessage(offerResult.forbidden ? "access_denied" : offerResult.error ?? "api_404")}</StateMessage>
      </PageStack>
    );
  }

  const country = countries.data.find((item) => item.id === offer.countryId);
  const product = products.data.find((item) => item.id === offer.productId);
  const pending = offer.pending;
  const published = offer.published;
  const editable = offer.status !== "withdrawn";
  const editContent = (pending ?? published)?.content;
  const insurers = canPrepare && editable ? await readAdminInsurers({ countryId: offer.countryId, status: "active" }) : undefined;
  const canGenerateSummary = roles.some((role) => role === "super_admin" || role === "ai_admin");
  const aiParam = Array.isArray(query.ai) ? query.ai[0] : query.ai;
  const partnerChoices = partners.data.map((partner) => ({ value: partner.id, label: partner.tradeName || partner.legalName }));
  const notice = query.notice === "created" ? "Offre créée en brouillon (version 1). Soumettez-la à la conformité quand elle est complète." : undefined;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={breadcrumb}
        kicker={offerTypeLabel(offer.offerType)}
        title={offerTitle(offer)}
        description={`${offer.partnerName ?? "Aucun courtier rattaché"} · ${country ? `${country.name} (${country.isoCode})` : "Pays inconnu"} · ${product?.name ?? "Produit inconnu"}. Offre indicative : prix à confirmer par le courtier partenaire.`}
        actions={
          <Cluster>
            <StatusBadge status={offer.status} labels={OFFER_STATUS_LABELS} tones={OFFER_STATUS_TONES} />
            {offer.offerType === "private" ? <Badge tone="warning">{PRIVATE_OFFER_BADGE}</Badge> : null}
            {offer.isSponsored ? <Badge tone="warning">Sponsorisé</Badge> : null}
            {offer.expiringSoon ? <Badge tone="warning">{`Expire dans ${offer.expiresInDays ?? 0} j`}</Badge> : null}
          </Cluster>
        }
      />
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {offer.suspensionReason ? <Notice tone="danger" title="Offre suspendue">{offer.suspensionReason}</Notice> : null}
      {offer.lastDecisionReason && !offer.suspensionReason ? <Notice tone="warning" title="Dernier motif communiqué au courtier">{offer.lastDecisionReason}</Notice> : null}

      <Card title="Actions" description="Validation, refus et suspension : conformité uniquement (compliance_admin, super_admin). Chaque action est auditée avec son motif.">
        <Cluster>
          {canSubmitOffer(roles) && pending?.status === "draft" ? <OfferDecisionForm offerId={offer.id} action="submit" /> : null}
          {canDecide && (pending?.status === "submitted" || offer.status === "suspended") ? <OfferDecisionForm offerId={offer.id} action="validate" /> : null}
          {canDecide && pending?.status === "submitted" ? <OfferDecisionForm offerId={offer.id} action="reject" /> : null}
          {canDecide && published && offer.status !== "suspended" && offer.status !== "withdrawn" ? <OfferDecisionForm offerId={offer.id} action="suspend" /> : null}
          {!canDecide ? <Badge tone="disabled">Décisions réservées à la conformité</Badge> : null}
        </Cluster>
      </Card>

      {offer.offerType === "private" ? (
        <Notice tone="warning" title={PRIVATE_OFFER_BADGE}>
          Offre privée : visible uniquement du courtier propriétaire, jamais affichée au public ni comparée.
        </Notice>
      ) : null}

      <OfferAiSummaryCard offerId={offer.id} result={aiSummary} canGenerate={canGenerateSummary} aiNotice={aiParam} />

      <Grid columns="two">
        <Card title="Version publiée" description="Seule cette version est visible du public.">
          {published ? <VersionSummary version={published} /> : <p className="bo-description">Aucune version publiée.</p>}
        </Card>
        <Card title="Version en cours" description="Brouillon ou version soumise ; elle ne change rien au public avant validation.">
          {pending ? (
            <>
              <VersionSummary version={pending} />
              <CompletenessChecklist completeness={pending.completeness} />
            </>
          ) : <p className="bo-description">Aucune version en cours.</p>}
        </Card>
      </Grid>

      {published && pending ? (
        <Card title="Différences entre la version publiée et la version en cours">
          <DataTable
            columns={diffColumns}
            items={offer.diff}
            getKey={(entry) => entry.field}
            emptyLabel="Aucune différence de contenu."
            aria-label="Différences entre versions"
          />
        </Card>
      ) : null}

      <Card title="Historique des versions" description="Chaque version est conservée avec son auteur, ses dates et le motif de décision.">
        <DataTable
          columns={versionColumns}
          items={offer.versions}
          getKey={(version) => version.id}
          emptyLabel="Aucune version."
          aria-label="Historique des versions"
        />
      </Card>

      {canPrepare && editable ? (
        <EditOfferForm
          offer={{ id: offer.id, offerType: offer.offerType, countryId: offer.countryId, productId: offer.productId, partnerTenantId: offer.partnerTenantId, concurrencyToken: offer.concurrencyToken }}
          content={editContent}
          hasPending={Boolean(pending)}
          partners={partnerChoices}
          insurers={(insurers?.data ?? []).map((insurer) => ({ id: insurer.id, name: insurer.name, countryId: insurer.countryId }))}
        />
      ) : null}
    </PageStack>
  );
}
