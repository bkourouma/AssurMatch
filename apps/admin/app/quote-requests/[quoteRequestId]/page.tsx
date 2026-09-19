import { readAdminQuoteDocuments } from "../../lib/admin-api";
import { Badge, Card, DataTable, PageHeader, StateMessage } from "../../lib/ui/admin-ui";

function scanTone(status: string) {
  if (status === "clean") return "success";
  if (status === "infected") return "danger";
  if (status === "failed") return "warning";
  return "disabled";
}

export default async function AdminQuoteRequestDetailPage({ params }: { params: Promise<{ quoteRequestId: string }> }) {
  const { quoteRequestId } = await params;
  const documents = await readAdminQuoteDocuments(quoteRequestId);

  return (
    <div className="page-stack">
      <PageHeader
        kicker="Operations"
        title="Detail demande de devis"
        description="Consentement, decision de routage, audit, doublon, notifications et documents fournis par le prospect (metadonnees uniquement, aucun contenu de fichier)."
      />
      <Card>
        <h2 className="section-title">Documents du prospect</h2>
        {documents.unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
        {documents.forbidden ? <StateMessage tone="danger">Acces documents refuse pour ce role admin.</StateMessage> : null}
        {documents.status === "error" ? <StateMessage tone="danger">Documents indisponibles: {documents.error}</StateMessage> : null}
        <DataTable
          columns={[
            { header: "Libelle", render: (document) => document.label },
            { header: "Type", render: (document) => document.documentKind },
            { header: "Fichier", render: (document) => `${document.fileName} (${document.mimeType}, ${Math.ceil(document.sizeBytes / 1024)} Ko)` },
            { header: "Scan", render: (document) => <Badge tone={scanTone(document.scanStatus)}>{document.scanStatus}{document.scanSignature ? ` (${document.scanSignature})` : ""}</Badge> },
            { header: "Statut", render: (document) => document.status },
            { header: "Transmis", render: (document) => (document.sharedWithBroker ? "courtier partenaire assigne" : "non") },
            { header: "Retention", render: (document) => document.retentionUntil.slice(0, 10) },
            { header: "Empreinte", render: (document) => <code>{document.checksum.slice(0, 12)}</code> }
          ]}
          items={documents.data.items}
          getKey={(document) => document.id}
          emptyLabel="Aucun document fourni par le prospect."
        />
      </Card>
      <StateMessage>Les fichiers ne sont jamais telecharges depuis le back-office plateforme; seul le courtier partenaire assigne y accede via son CRM apres verification antivirus.</StateMessage>
    </div>
  );
}
