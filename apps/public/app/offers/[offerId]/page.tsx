import { OfferCriteria, SponsoredBadge } from "../../components/offer-cards";
import { IndicativeOfferNotice, TechnicalRoleNotice } from "../../components/public-journey";
import { getPublicOffer } from "../../lib/public-api";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PublicOfferDetailPage({ params, searchParams }: { params: Promise<{ offerId: string }>; searchParams?: Promise<SearchParams> }) {
  const { offerId } = await params;
  const query = searchParams ? await searchParams : {};
  const countryCode = first(query.country);
  const productKey = first(query.product);
  const offer = await getPublicOffer(offerId);

  return (
    <main className="pub-page">
      <section className="pub-section">
        <h1>Detail de l'offre indicative</h1>
        <TechnicalRoleNotice />
        <IndicativeOfferNotice />
      </section>
      {offer.status !== "success" || !offer.data ? (
        <p role="alert">Cette offre n'est pas disponible publiquement (expiree, non validee ou courtier partenaire non eligible).</p>
      ) : (
        <article className="pub-card pub-offer" aria-label={offer.data.name}>
          <div className="pub-offer__header">
            <h2 className="pub-offer__title">{offer.data.name}</h2>
            <SponsoredBadge offer={offer.data} />
          </div>
          {offer.data.shortDescription ? <p className="pub-offer__summary">{offer.data.shortDescription}</p> : null}
          {offer.data.guaranteeSummary ? <p className="pub-offer__summary">{offer.data.guaranteeSummary}</p> : null}
          <OfferCriteria offer={offer.data} />
          {offer.data.exclusionsSummary ? (
            <section aria-label="Exclusions principales">
              <h3>Exclusions principales</h3>
              <p className="pub-meta">{offer.data.exclusionsSummary}</p>
            </section>
          ) : null}
          {offer.data.requiredDocuments.length > 0 ? (
            <section aria-label="Documents requis">
              <h3>Documents requis</h3>
              <ul className="pub-list">{offer.data.requiredDocuments.map((document) => <li key={document}>{document}</li>)}</ul>
            </section>
          ) : null}
          <p className="pub-meta">Validite jusqu'au {offer.data.validUntil.slice(0, 10)}. {offer.data.sourceOfInformation ? `Source: ${offer.data.sourceOfInformation}.` : ""}</p>
          <ul className="pub-list">{offer.data.publicDisclaimers.map((disclaimer) => <li key={disclaimer}>{disclaimer}</li>)}</ul>
          <p className="pub-fineprint">Validite, garanties principales, limites et responsabilite du courtier partenaire. La sponsorisation est indiquee lorsqu'elle existe.</p>
          <nav className="pub-actions" aria-label="Actions">
            {countryCode && productKey ? (
              <>
                <a className="pub-button" href={`/countries/${encodeURIComponent(countryCode)}/products/${encodeURIComponent(productKey)}/offers`}>Comparer les offres</a>
                <a className="pub-button pub-button--primary" href={`/countries/${encodeURIComponent(countryCode)}/products/${encodeURIComponent(productKey)}/quote?offerId=${offer.data.id}`}>Demander un devis</a>
              </>
            ) : (
              <a className="pub-button" href="/catalog">Comparer les offres</a>
            )}
          </nav>
        </article>
      )}
    </main>
  );
}
