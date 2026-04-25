import { IndicativeOfferNotice } from "../../components/public-journey";

export default function PublicQuoteConfirmationPage({ params }: { params: { publicReference: string } }) {
  return (
    <main>
      <h1>Demande recue {params.publicReference}</h1>
      <IndicativeOfferNotice />
      <p>Votre demande sera traitee par un courtier partenaire identifie lorsque le routage est possible.</p>
      <p>Si aucun courtier partenaire eligible n'est disponible, aucune promesse de rappel n'est faite.</p>
    </main>
  );
}
