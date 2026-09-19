import { OfferCard } from "../../../../../components/offer-cards";
import { IndicativeOfferNotice, TechnicalRoleNotice } from "../../../../../components/public-journey";
import { listPublicOffers } from "../../../../../lib/public-api";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

const sortOptions = [
  ["updated_desc", "Derniere mise a jour"],
  ["price_asc", "Prix indicatif croissant"],
  ["price_desc", "Prix indicatif decroissant"],
  ["coverage_desc", "Niveau de garantie"],
  ["speed_asc", "Rapidite de traitement"],
  ["score_desc", "Score indicatif"],
  ["popularity_desc", "Popularite (demandes de devis)"],
  ["name_asc", "Nom"],
  ["sponsored_explicit", "Sponsorisees d'abord (mention visible)"]
] as const;

const priorityOptions = [
  ["", "Aucune priorite"],
  ["price", "Le prix"],
  ["guarantees", "Le niveau de garantie"],
  ["speed", "La rapidite de traitement"],
  ["deductible", "La franchise"],
  ["flexibility", "La flexibilite de paiement"]
] as const;

export default async function PublicOffersPage({ params, searchParams }: { params: Promise<{ countryCode: string; productKey: string }>; searchParams?: Promise<SearchParams> }) {
  const { countryCode, productKey } = await params;
  const filters = searchParams ? await searchParams : {};
  const offers = await listPublicOffers(countryCode, productKey, filters);
  const priority = first(filters.priority);

  return (
    <main className="pub-page">
      <section className="pub-section">
        <p className="pub-back">
          <a href={`/countries/${encodeURIComponent(countryCode)}/products/${encodeURIComponent(productKey)}`}>
            Retour au produit {productKey}
          </a>
        </p>
        <h1>Comparer les offres</h1>
        <TechnicalRoleNotice />
        <IndicativeOfferNotice />
      </section>

      <form className="pub-card pub-form" method="get" aria-label="Filtres">
        <fieldset>
          <legend>Filtres</legend>
          <div className="pub-form__grid">
            <label>Prix indicatif minimum<input name="minPrice" type="number" min="0" defaultValue={first(filters.minPrice)} /></label>
            <label>Prix indicatif maximum<input name="maxPrice" type="number" min="0" defaultValue={first(filters.maxPrice)} /></label>
            <label>
              Niveau de garantie minimum
              <select name="minGuaranteeLevel" defaultValue={first(filters.minGuaranteeLevel)}>
                <option value="">Tous</option>
                {[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>{level}/5</option>)}
              </select>
            </label>
            <label>Franchise maximale<input name="maxDeductible" type="number" min="0" defaultValue={first(filters.maxDeductible)} /></label>
            <label>Delai de traitement maximum (jours)<input name="maxProcessingDays" type="number" min="0" defaultValue={first(filters.maxProcessingDays)} /></label>
            <label>Assureur<input name="insurer" defaultValue={first(filters.insurer)} /></label>
            <label>Garantie incluse (cle)<input name="guarantee" defaultValue={first(filters.guarantee)} /></label>
            <label>
              Flexibilite de paiement
              <select name="paymentFlexibility" defaultValue={first(filters.paymentFlexibility)}>
                <option value="">Toutes</option>
                <option value="monthly">mensuel</option>
                <option value="quarterly">trimestriel</option>
                <option value="semiannual">semestriel</option>
                <option value="annual">annuel</option>
              </select>
            </label>
            <label>Courtier partenaire<input name="broker" defaultValue={first(filters.broker)} /></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Tri et priorite</legend>
          <div className="pub-form__grid pub-form__grid--two">
            <label>
              Trier par
              <select name="sort" defaultValue={first(filters.sort) || "updated_desc"}>
                {sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>
              Ce qui compte le plus pour vous
              <select name="priority" defaultValue={priority}>
                {priorityOptions.map(([value, label]) => <option key={value || "none"} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
        </fieldset>
        <div className="pub-form__actions">
          <button className="pub-button--primary" type="submit">Appliquer</button>
          <p className="pub-form__hint">Les filtres portent uniquement sur les offres indicatives affichees.</p>
        </div>
      </form>

      <form className="pub-card pub-card--plain pub-form" id="compare-form" method="get" action="/compare" aria-label="Comparer cote a cote">
        {priority ? <input type="hidden" name="priority" value={priority} /> : null}
        <div className="pub-form__actions">
          <p className="pub-form__hint">Cochez 2 a 4 offres puis comparez-les cote a cote.</p>
          <button type="submit">Comparer la selection</button>
        </div>
      </form>

      <section className="pub-section" aria-label="Offres indicatives">
        {offers.status === "error" ? <p role="alert">{offers.publicMessage}</p> : null}
        {offers.status === "empty" ? <p role="status">Aucune offre indicative disponible pour ces criteres. Offre sponsorisee affichee uniquement avec mention.</p> : null}
        {offers.data.map((offer) => <OfferCard key={offer.id} offer={offer} countryCode={countryCode} productKey={productKey} />)}
      </section>

      <p className="pub-fineprint">Le score est indicatif, calcule selon vos criteres par rapport aux offres affichees. Une offre sponsorisee est toujours signalee. Aucune offre expiree ou non validee n'est affichee.</p>
    </main>
  );
}
