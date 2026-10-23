import { redirect } from "next/navigation";
import { loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { TENANT_SUSPENDED_MESSAGE, canMutateOffers, canReadOffers, isTenantReadOnly } from "../lib/broker-permissions";
import { readOfferScopeChoices, OFFER_SCOPE_OUTSIDE_COVERAGE, type BrokerOfferView, type OfferEffectiveStatus } from "../lib/offer-api";
import { readBrokerOffersByType } from "../lib/lot4-offers-api";
import {
  OFFER_STATUS_LABELS,
  OFFER_STATUS_OPTIONS,
  OFFER_STATUS_TONES,
  OFFER_TYPE_FILTER_OPTIONS,
  OFFER_TYPE_SHORT_LABELS,
  PRIVATE_OFFER_BADGE,
  offerDisplayName,
  offerFormatDate,
  offerTypeLabel
} from "../lib/offer-messages";
import type { OfferType } from "../../../../packages/shared/contracts/offer-content";
import {
  Badge,
  Button,
  Cluster,
  DataTable,
  Field,
  FilterBar,
  Notice,
  PageHeader,
  PageStack,
  Select,
  StatusBadge,
  fieldControlProps
} from "../lib/ui/broker-ui";
import type { DataTableColumn } from "../lib/ui/broker-ui";
import styles from "../lib/ui/broker-screens.module.css";

/**
 * Spec 052 US1/US3 (FR-006): « Mes offres ». Every broker role reads its own partner's offers;
 * only the owner and the managers create and edit them (never while the partner is suspended).
 * Offres indicatives : prix à confirmer par le courtier partenaire.
 */
const BREADCRUMB = [{ label: "Activite" }, { label: "Mes offres" }];

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function ExpiryBadge({ offer }: { offer: BrokerOfferView }) {
  if (offer.expiresInDays === undefined) return <>-</>;
  if (offer.expiresInDays < 0 || offer.status === "expired") return <Badge tone="danger">Expirée : à renouveler</Badge>;
  return (
    <>
      {offerFormatDate(offer.expiresAt)}
      {offer.expiringSoon ? <> <Badge tone="warning">{`Expire dans ${offer.expiresInDays} jours`}</Badge></> : null}
    </>
  );
}

export default async function BrokerOffersPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/offers", session.status));
  if (session.status !== "authenticated" || !canReadOffers(session.profile)) {
    return (
      <PageStack>
        <PageHeader breadcrumb={BREADCRUMB} title="Acces refuse" description="La consultation des offres exige une session courtier authentifiee et la MFA verifiee." />
      </PageStack>
    );
  }
  const readOnlyTenant = isTenantReadOnly(session.profile);
  const canWrite = canMutateOffers(session.profile);

  const params = searchParams ? await searchParams : {};
  const statusParam = firstParam(params.status);
  const status = (OFFER_STATUS_OPTIONS as readonly string[]).includes(statusParam) ? statusParam as OfferEffectiveStatus : undefined;
  const typeParam = firstParam(params.offerType);
  const offerType = (OFFER_TYPE_FILTER_OPTIONS as readonly string[]).includes(typeParam) ? typeParam as OfferType : undefined;
  const [offers, scopes] = await Promise.all([readBrokerOffersByType({ status, offerType }), readOfferScopeChoices()]);
  if (offers.status === "unauthenticated") redirect(loginRedirect("/offers", offers.error ?? "session_required"));
  const scopeLabel = new Map(scopes.map((scope) => [`${scope.countryId}:${scope.productId}`, `${scope.countryLabel} · ${scope.productLabel}`]));

  const columns: Array<DataTableColumn<BrokerOfferView>> = [
    {
      key: "name",
      header: "Offre",
      render: (offer) => (
        <>
          <a href={`/offers/${encodeURIComponent(offer.id)}`}><strong>{offerDisplayName(offer)}</strong></a>
          <div className={styles.entryMeta}>{scopeLabel.get(`${offer.countryId}:${offer.productId}`) ?? OFFER_SCOPE_OUTSIDE_COVERAGE}</div>
          <div className={styles.entryMeta}>
            {offerTypeLabel(offer.offerType)}
            {offer.offerType === "private" ? <> <Badge tone="warning">{PRIVATE_OFFER_BADGE}</Badge></> : null}
          </div>
        </>
      ),
      sortable: true,
      sortValue: offerDisplayName
    },
    {
      key: "status",
      header: "Statut",
      render: (offer) => (
        <Cluster>
          <StatusBadge status={offer.status} labels={OFFER_STATUS_LABELS} tones={OFFER_STATUS_TONES} />
          {offer.pending && offer.published ? <Badge tone="info">{`v${offer.pending.versionNumber} ${offer.pending.status === "submitted" ? "en attente de validation" : "en brouillon"}`}</Badge> : null}
          {offer.isSponsored ? <Badge tone="warning">Sponsorisé</Badge> : null}
        </Cluster>
      ),
      sortable: true,
      sortValue: (offer) => offer.status
    },
    {
      key: "completeness",
      header: "Complétude",
      render: (offer) => {
        const completeness = (offer.pending ?? offer.published)?.completeness;
        return completeness ? <Badge tone={completeness.complete ? "success" : "warning"}>{`${completeness.score} %`}</Badge> : "-";
      },
      numeric: true,
      align: "right",
      sortable: true,
      sortValue: (offer) => (offer.pending ?? offer.published)?.completeness.score ?? 0
    },
    { key: "expiry", header: "Expiration", render: (offer) => <ExpiryBadge offer={offer} />, sortable: true, sortValue: (offer) => offer.expiresAt ?? "" },
    {
      key: "reason",
      header: "Dernier motif",
      render: (offer) => offer.suspensionReason ?? offer.lastDecisionReason ?? "-"
    }
  ];

  return (
    <PageStack>
      <PageHeader
        breadcrumb={BREADCRUMB}
        title="Mes offres"
        description="Vos offres indicatives et leurs versions. Une offre n'est visible du public qu'après validation par AssurMatch ; une modification crée une nouvelle version à valider."
        actions={canWrite ? <Button href="/offers/new">Nouvelle offre</Button> : null}
      />
      {readOnlyTenant ? <Notice tone="warning">{TENANT_SUSPENDED_MESSAGE}</Notice> : null}
      {!canWrite && !readOnlyTenant ? (
        <Notice tone="info">Consultation seule : seuls le propriétaire et les managers du cabinet créent et modifient les offres.</Notice>
      ) : null}
      <Notice tone="neutral">Offre indicative : prix à confirmer par le courtier partenaire. Aucune offre ne vaut devis ferme ni contrat.</Notice>

      <FilterBar action="/offers" label="Filtres offres" submitLabel="Filtrer" resetLabel="Reinitialiser" resetHref="/offers" activeCount={(status ? 1 : 0) + (offerType ? 1 : 0)} autoSubmit>
        <Field id="broker-offers-status" label="Statut">
          <Select {...fieldControlProps("broker-offers-status")} name="status" defaultValue={status ?? ""}>
            <option value="">Tous</option>
            {OFFER_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{OFFER_STATUS_LABELS[option]}</option>)}
          </Select>
        </Field>
        <Field id="broker-offers-type" label="Type d'offre">
          <Select {...fieldControlProps("broker-offers-type")} name="offerType" defaultValue={offerType ?? ""}>
            <option value="">Tous</option>
            {OFFER_TYPE_FILTER_OPTIONS.map((option) => <option key={option} value={option}>{OFFER_TYPE_SHORT_LABELS[option]}</option>)}
          </Select>
        </Field>
      </FilterBar>
      {offers.status === "forbidden" ? <Notice tone="danger">Accès aux offres refusé pour ce compte.</Notice> : null}
      {offers.status === "error" ? <Notice tone="danger">Offres temporairement indisponibles ({offers.error ?? "erreur inconnue"}).</Notice> : null}
      <DataTable
        columns={columns}
        items={offers.data}
        getKey={(offer) => offer.id}
        aria-label="Mes offres"
        emptyLabel={status || offerType ? "Aucune offre avec ce filtre." : "Aucune offre pour le moment."}
        emptyDescription={
          status || offerType
            ? "Choisissez un autre filtre ou reinitialisez le filtre."
            : canWrite
              ? "Créez une offre indicative : elle est enregistrée en brouillon puis publiée après validation par AssurMatch."
              : "Le propriétaire ou un manager du cabinet crée les offres ; elles apparaîtront ici."
        }
        emptyAction={!status && !offerType && canWrite ? <Button href="/offers/new" variant="secondary" size="sm">Créer une offre</Button> : undefined}
      />
    </PageStack>
  );
}
