import { IndicativeOfferNotice } from "../../../../../components/public-journey";

export default function PublicOffersPage() {
  return (
    <main>
      <h1>Comparer les offres</h1>
      <IndicativeOfferNotice />
      <section aria-label="Filtres">
        <label>Prix indicatif minimum<input name="minPrice" /></label>
        <label>Prix indicatif maximum<input name="maxPrice" /></label>
        <label>Courtier partenaire<input name="broker" /></label>
      </section>
      <section aria-label="Offres indicatives">
        <article>
          <h2>Offre indicative active</h2>
          <p>prix a confirmer</p>
          <p>courtier partenaire</p>
          <p>Offre sponsorisee si le libelle est affiche.</p>
        </article>
      </section>
    </main>
  );
}
