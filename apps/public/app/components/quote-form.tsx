import { IndicativeOfferNotice } from "./public-journey";

export function QuoteFormShell() {
  return (
    <form>
      <label>
        Nom
        <input name="displayName" autoComplete="name" />
      </label>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Telephone
        <input name="phone" type="tel" autoComplete="tel" required />
      </label>
      <label>
        <input name="consent" type="checkbox" required />
        J'accepte que ma demande soit transmise a un courtier partenaire eligible pour ce pays et ce produit.
      </label>
      <IndicativeOfferNotice />
      <p role="alert">Les erreurs de saisie sont affichees sans information sensible.</p>
      <button type="submit">Demander un devis</button>
    </form>
  );
}

export function QuoteBlockedState() {
  return <p>La demande de devis n'est pas disponible pour ce pays ou ce produit.</p>;
}
