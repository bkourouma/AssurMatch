import { IndicativeOfferNotice } from "../../components/public-journey";
import { QuoteDocumentUpload } from "../../components/quote-document-upload";
import { listQuoteDocuments } from "../../lib/public-api";

type SearchParams = Record<string, string | string[] | undefined>;

const scanLabels: Record<string, string> = {
  pending: "verification en cours",
  clean: "verifie",
  infected: "refuse (fichier non sain, mis en quarantaine)",
  failed: "verification a relancer"
};

export default async function PublicQuoteConfirmationPage({ params, searchParams }: { params: Promise<{ publicReference: string }>; searchParams?: Promise<SearchParams> }) {
  const { publicReference } = await params;
  const query = searchParams ? await searchParams : {};
  const tokenParam = Array.isArray(query.token) ? query.token[0] : query.token;
  const token = tokenParam && /^[A-Za-z0-9_-]{16,}$/.test(tokenParam) ? tokenParam : undefined;
  const documents = token ? await listQuoteDocuments(publicReference, token) : undefined;

  return (
    <main className="pub-page">
      <section className="pub-hero">
        <p className="pub-kicker">Demande de devis</p>
        <h1>Demande recue {publicReference}</h1>
        <IndicativeOfferNotice />
        <p>Votre demande sera traitee par un courtier partenaire identifie lorsque le routage est possible.</p>
        <p className="pub-fineprint">Si aucun courtier partenaire eligible n'est disponible, aucune promesse de rappel n'est faite.</p>
      </section>

      {token ? (
        <section className="pub-section" aria-label="Documents optionnels">
          <h2>Documents optionnels</h2>
          {documents?.status === "success" && documents.data ? (
            <>
              {documents.data.items.length > 0 ? (
                <ul className="pub-list">
                  {documents.data.items.map((document) => (
                    <li key={document.id}>
                      {document.label} ({document.fileName}, {Math.ceil(document.sizeBytes / 1024)} Ko): {scanLabels[document.scanStatus] ?? document.scanStatus}
                      {document.sharedWithBroker ? " - transmis au courtier partenaire" : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pub-meta">Aucun document ajoute.</p>
              )}
              {documents.data.uploadEnabled ? (
                <QuoteDocumentUpload publicReference={publicReference} token={token} remainingSlots={documents.data.remainingSlots} />
              ) : (
                <p role="status">L'ajout de documents n'est pas disponible pour ce produit.</p>
              )}
            </>
          ) : (
            <p role="alert">Le suivi de cette demande n'est pas disponible avec ce lien.</p>
          )}
        </section>
      ) : (
        <p className="pub-meta">Le lien de suivi transmis a la fin de votre demande permet d'ajouter des documents optionnels.</p>
      )}

      <nav className="pub-actions" aria-label="Parcours public">
        <a className="pub-button" href="/catalog">Retour au catalogue indicatif</a>
      </nav>
    </main>
  );
}
