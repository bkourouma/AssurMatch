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
    <main>
      <h1>Demande recue {publicReference}</h1>
      <IndicativeOfferNotice />
      <p>Votre demande sera traitee par un courtier partenaire identifie lorsque le routage est possible.</p>
      <p>Si aucun courtier partenaire eligible n'est disponible, aucune promesse de rappel n'est faite.</p>

      {token ? (
        <section aria-label="Documents optionnels">
          <h2>Documents optionnels</h2>
          {documents?.status === "success" && documents.data ? (
            <>
              <ul>
                {documents.data.items.map((document) => (
                  <li key={document.id}>
                    {document.label} ({document.fileName}, {Math.ceil(document.sizeBytes / 1024)} Ko): {scanLabels[document.scanStatus] ?? document.scanStatus}
                    {document.sharedWithBroker ? " - transmis au courtier partenaire" : ""}
                  </li>
                ))}
              </ul>
              {documents.data.items.length === 0 ? <p>Aucun document ajoute.</p> : null}
              {documents.data.uploadEnabled ? (
                <QuoteDocumentUpload publicReference={publicReference} token={token} remainingSlots={documents.data.remainingSlots} />
              ) : (
                <p>L'ajout de documents n'est pas disponible pour ce produit.</p>
              )}
            </>
          ) : (
            <p role="alert">Le suivi de cette demande n'est pas disponible avec ce lien.</p>
          )}
        </section>
      ) : (
        <p>Le lien de suivi transmis a la fin de votre demande permet d'ajouter des documents optionnels.</p>
      )}
    </main>
  );
}
