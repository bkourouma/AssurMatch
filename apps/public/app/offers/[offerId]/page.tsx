import { OfferCriteria } from "../../components/offer-cards";
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
    <main>
      <h1>Detail de l'offre indicative</h1>
      <TechnicalRoleNotice />
      <IndicativeOfferNotice />
      {offer.status !== "success" || !offer.data ? (
        <p role="alert">Cette offre n'est pas disponible publiquement (expiree, non validee ou courtier partenaire non eligible).</p>
      ) : (
        <article aria-label={offer.data.name}>
          <h2>{offer.data.name}{offer.data.isSponsored ? ` - Sponsorise${offer.data.sponsorLabel ? ` (${offer.data.sponsorLabel})` : ""}` : ""}</h2>
          {offer.data.shortDescription ? <p>{offer.data.shortDescription}</p> : null}
          {offer.data.guaranteeSummary ? <p>{offer.data.guaranteeSummary}</p> : null}
          <OfferCriteria offer={offer.data} />
          {offer.data.exclusionsSummary ? (
            <section aria-label="Exclusions principales">
              <h3>Exclusions principales</h3>
              <p>{offer.data.exclusionsSummary}</p>
            </section>
          ) : null}
          {offer.data.requiredDocuments.length > 0 ? (
            <section aria-label="Documents requis">
              <h3>Documents requis</h3>
              <ul>{offer.data.requiredDocuments.map((document) => <li key={document}>{document}</li>)}</ul>
            </section>
          ) : null}
          <p>Validite jusqu'au {offer.data.validUntil.slice(0, 10)}. {offer.data.sourceOfInformation ? `Source: ${offer.data.sourceOfInformation}.` : ""}</p>
          <ul>{offer.data.publicDisclaimers.map((disclaimer) => <li key={disclaimer}>{disclaimer}</li>)}</ul>
          <p>Validite, garanties principales, limites et responsabilite du courtier partenaire. La sponsorisation est indiquee lorsqu'elle existe.</p>
          <nav aria-label="Actions">
            {countryCode && productKey ? (
              <>
                <a href={`/countries/${encodeURIComponent(countryCode)}/products/${encodeURIComponent(productKey)}/offers`}>Comparer les offres</a>
                <a href={`/countries/${encodeURIComponent(countryCode)}/products/${encodeURIComponent(productKey)}/quote?offerId=${offer.data.id}`}>Demander un devis</a>
              </>
            ) : (
              <a href="/countries/CI">Comparer les offres</a>
            )}
          </nav>
        </article>
      )}
    </main>
  );
}
