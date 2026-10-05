import { redirect } from "next/navigation";
import {
  readAdminCountries,
  readAdminOfferList,
  readAdminPartners,
  readAdminProducts,
  type AdminOfferListItem,
  type OfferEffectiveStatus
} from "../lib/admin-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { adminReadErrorMessage } from "../lib/catalog-messages";
import {
  OFFER_STATUS_LABELS,
  OFFER_STATUS_OPTIONS,
  OFFER_STATUS_TONES,
  canDecideOffer,
  canPrepareOffer,
  offerFormatDate
} from "../lib/offer-messages";
import {
  Badge,
  Button,
  Card,
  Cluster,
  DataTable,
  Field,
  FilterBar,
  Input,
  Notice,
  PageHeader,
  PageStack,
  Select,
  StateMessage,
  StatusBadge,
  Tabs,
  fieldControlProps,
  paginateItems,
  readTableParams,
  sortItems
} from "../lib/ui/admin-ui";
import type { DataTableColumn } from "../lib/ui/admin-ui";

/**
 * Spec 052 US2/US5 (FR-010): offres indicatives. Filtered list restricted by the API to the
 * operator's country scope, and the « À valider » queue (`queue=submitted`, oldest submission
 * first). Validation, refusal and suspension stay on the offer page, for compliance only.
 */
const UUID = /^[0-9a-f-]{36}$/i;

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function offerName(offer: AdminOfferListItem): string {
  return offer.published?.content.name ?? offer.pending?.content.name ?? offer.publicKey;
}

function ExpiryCell({ offer }: { offer: AdminOfferListItem }) {
  if (!offer.expiresAt) return <>-</>;
  return (
    <>
      {offerFormatDate(offer.expiresAt)}
      {offer.expiresInDays !== undefined && offer.expiresInDays < 0 ? <> <Badge tone="danger">Expirée</Badge></> : null}
      {offer.expiringSoon && (offer.expiresInDays ?? 0) >= 0 ? <> <Badge tone="warning">{`Expire dans ${offer.expiresInDays} j`}</Badge></> : null}
    </>
  );
}

export default async function AdminOffersPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/offers", session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent("/offers")}`);
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) redirect("/login?error=access_denied&returnTo=%2Foffers");
  const canPrepare = canPrepareOffer(session.profile.roles);
  const canDecide = canDecideOffer(session.profile.roles);

  const params = searchParams ? await searchParams : {};
  const queue = firstParam(params.queue) === "submitted" ? "submitted" as const : undefined;
  const statusParam = firstParam(params.status);
  const status = (OFFER_STATUS_OPTIONS as readonly string[]).includes(statusParam) ? statusParam as OfferEffectiveStatus : undefined;
  const countryId = UUID.test(firstParam(params.countryId)) ? firstParam(params.countryId) : undefined;
  const productId = UUID.test(firstParam(params.productId)) ? firstParam(params.productId) : undefined;
  const partnerTenantId = UUID.test(firstParam(params.partnerTenantId)) ? firstParam(params.partnerTenantId) : undefined;
  const sponsoredParam = firstParam(params.sponsored);
  const sponsored = sponsoredParam === "true" ? true : sponsoredParam === "false" ? false : undefined;
  const expiringParam = Number.parseInt(firstParam(params.expiring), 10);
  const expiring = Number.isInteger(expiringParam) && expiringParam >= 0 && expiringParam <= 365 ? expiringParam : undefined;

  const [offers, countries, products, partners] = await Promise.all([
    readAdminOfferList({ countryId, productId, partnerTenantId, status, sponsored, expiringWithinDays: expiring, queue }),
    readAdminCountries(),
    readAdminProducts(),
    readAdminPartners()
  ]);
  if (offers.unauthenticated) redirect(loginRedirect("/offers", offers.error ?? "session_required"));

  const countryById = new Map(countries.data.map((country) => [country.id, country]));
  const productById = new Map(products.data.map((product) => [product.id, product]));

  const columns: Array<DataTableColumn<AdminOfferListItem>> = [
    {
      key: "name",
      header: "Offre",
      render: (offer) => (
        <>
          <a href={`/offers/${encodeURIComponent(offer.id)}`}><strong>{offerName(offer)}</strong></a>
          <div>{offer.offerType === "partner" ? "Offre partenaire" : "Offre indicative"}</div>
        </>
      ),
      sortable: true,
      sortValue: offerName
    },
    { key: "partner", header: "Courtier", render: (offer) => offer.partnerName ?? (offer.partnerTenantId ? offer.partnerTenantId.slice(0, 8) : <Badge tone="warning">Aucun courtier</Badge>), sortable: true, sortValue: (offer) => offer.partnerName ?? "" },
    {
      key: "scope",
      header: "Pays / produit",
      render: (offer) => `${countryById.get(offer.countryId)?.isoCode ?? "?"} · ${productById.get(offer.productId)?.name ?? "?"}`,
      sortable: true,
      sortValue: (offer) => `${countryById.get(offer.countryId)?.isoCode ?? ""}${productById.get(offer.productId)?.name ?? ""}`
    },
    {
      key: "status",
      header: "Statut",
      render: (offer) => (
        <Cluster>
          <StatusBadge status={offer.status} labels={OFFER_STATUS_LABELS} tones={OFFER_STATUS_TONES} />
          {offer.pending ? <Badge tone="info">{`v${offer.pending.versionNumber} ${offer.pending.status === "submitted" ? "soumise" : "en brouillon"}`}</Badge> : null}
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
        if (!completeness) return "-";
        return <Badge tone={completeness.complete ? "success" : "warning"}>{`${completeness.score} %`}</Badge>;
      },
      numeric: true,
      align: "right",
      sortable: true,
      sortValue: (offer) => (offer.pending ?? offer.published)?.completeness.score ?? 0
    },
    {
      key: "submitted",
      header: "Soumise le",
      render: (offer) => offerFormatDate(offer.pending?.submittedAt),
      sortable: true,
      sortValue: (offer) => offer.pending?.submittedAt ?? ""
    },
    { key: "expiry", header: "Expiration", render: (offer) => <ExpiryCell offer={offer} />, sortable: true, sortValue: (offer) => offer.expiresAt ?? "" }
  ];

  const table = readTableParams(params, {
    pathname: "/offers",
    defaultSort: queue ? { key: "submitted", direction: "asc" } : { key: "name", direction: "asc" },
    pageSize: 25
  });
  const rows = paginateItems(sortItems(offers.data, columns, table.sort), table.page, table.pageSize);
  const activeFilters = [countryId, productId, partnerTenantId, status, sponsoredParam || undefined, expiring].filter((value) => value !== undefined).length;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Catalogue" }, { label: "Catalogue", href: "/catalog" }, { label: "Offres indicatives" }]}
        kicker="Catalogue"
        title="Offres indicatives"
        description="Offres des courtiers partenaires, versions, file de validation et sponsorisation. Seule la version publiée est visible du public : offre indicative, prix à confirmer par le courtier partenaire."
        actions={canPrepare ? <Button href="/offers/new">Nouvelle offre</Button> : null}
      />
      <Notice tone="info">
        Aucune offre expirée, suspendue ou non validée n&apos;est publique. Validation, refus et suspension : conformité uniquement
        {canDecide ? " (vous en faites partie)." : "."}
      </Notice>

      <Tabs
        label="Vues des offres"
        items={[
          { label: "Toutes les offres", href: "/offers", current: !queue },
          { label: "À valider", href: "/offers?queue=submitted", current: Boolean(queue) }
        ]}
      />

      <Card title={queue ? "File « À valider »" : "Catalogue des offres"} description={queue ? "Versions soumises, de la plus ancienne à la plus récente." : undefined}>
        <FilterBar
          action="/offers"
          label="Filtres offres"
          submitLabel="Filtrer"
          resetLabel="Reinitialiser"
          resetHref={queue ? "/offers?queue=submitted" : "/offers"}
          activeCount={activeFilters}
        >
          {queue ? <input type="hidden" name="queue" value="submitted" /> : null}
          <Field id="offers-country" label="Pays">
            <Select {...fieldControlProps("offers-country")} name="countryId" defaultValue={countryId ?? ""}>
              <option value="">Tous</option>
              {countries.data.map((country) => <option key={country.id} value={country.id}>{`${country.name} (${country.isoCode})`}</option>)}
            </Select>
          </Field>
          <Field id="offers-product" label="Produit">
            <Select {...fieldControlProps("offers-product")} name="productId" defaultValue={productId ?? ""}>
              <option value="">Tous</option>
              {products.data.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </Select>
          </Field>
          <Field id="offers-partner" label="Courtier">
            <Select {...fieldControlProps("offers-partner")} name="partnerTenantId" defaultValue={partnerTenantId ?? ""}>
              <option value="">Tous</option>
              {partners.data.map((partner) => <option key={partner.id} value={partner.id}>{partner.tradeName || partner.legalName}</option>)}
            </Select>
          </Field>
          <Field id="offers-status" label="Statut">
            <Select {...fieldControlProps("offers-status")} name="status" defaultValue={status ?? ""}>
              <option value="">Tous</option>
              {OFFER_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{OFFER_STATUS_LABELS[option]}</option>)}
            </Select>
          </Field>
          <Field id="offers-sponsored" label="Sponsorisation">
            <Select {...fieldControlProps("offers-sponsored")} name="sponsored" defaultValue={sponsoredParam}>
              <option value="">Toutes</option>
              <option value="true">Sponsorisées</option>
              <option value="false">Non sponsorisées</option>
            </Select>
          </Field>
          <Field id="offers-expiring" label="Expire sous N jours">
            <Input {...fieldControlProps("offers-expiring")} name="expiring" type="number" min={0} max={365} defaultValue={expiring ?? ""} placeholder="15" />
          </Field>
        </FilterBar>
        {offers.forbidden ? <StateMessage tone="danger">{adminReadErrorMessage("access_denied")}</StateMessage> : null}
        {offers.status === "error" ? <StateMessage tone="danger">{adminReadErrorMessage(offers.error)}</StateMessage> : null}
        <DataTable
          columns={columns}
          items={rows}
          getKey={(offer) => offer.id}
          emptyLabel={queue ? "Aucune version en attente de validation." : "Aucune offre pour ces filtres."}
          aria-label="Offres indicatives"
          sort={table.sort}
          sortHref={table.sortHref}
          pagination={{
            page: table.page,
            pageSize: table.pageSize,
            total: offers.data.length,
            hrefFor: table.pageHref,
            label: (from, to, total) => `${from}-${to} sur ${total} offres`
          }}
        />
      </Card>
    </PageStack>
  );
}
