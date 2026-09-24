import { readAdminQuoteDocuments } from "../../lib/admin-api";
import { Badge, Card, DataTable, DescriptionList, PageHeader, PageStack, StateMessage, documentScanTones } from "../../lib/ui/admin-ui";

export default async function AdminQuoteRequestDetailPage({ params }: { params: Promise<{ quoteRequestId: string }> }) {
  const { quoteRequestId } = await params;
  const documents = await readAdminQuoteDocuments(quoteRequestId);

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[
          { label: "Pilotage" },
          { label: "Operations", href: "/operations" },
          { label: "Demandes de devis", href: "/quote-requests" },
          { label: "Detail" }
        ]}
        kicker="Operations"
        title="Detail demande de devis"
        description="Consentement, decision de routage, audit, doublon, notifications et documents fournis par le prospect (metadonnees uniquement, aucun contenu de fichier)."
      />
      <Card title="Identification">
        <DescriptionList
          columns={2}
          items={[
            { term: "Demande de devis", value: <code>{quoteRequestId}</code> },
            { term: "Documents references", value: documents.status === "success" ? documents.data.items.length : "-" }
          ]}
        />
      </Card>
      <Card title="Documents du prospect">
        {documents.unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
        {documents.forbidden ? <StateMessage tone="danger">Acces documents refuse pour ce role admin.</StateMessage> : null}
        {documents.status === "error" ? <StateMessage tone="danger">Documents indisponibles: {documents.error}</StateMessage> : null}
        <DataTable
          columns={[
            { key: "label", header: "Libelle", render: (document) => document.label },
            { key: "kind", header: "Type", render: (document) => document.documentKind },
            { key: "file", header: "Fichier", render: (document) => `${document.fileName} (${document.mimeType}, ${Math.ceil(document.sizeBytes / 1024)} Ko)` },
            {
              key: "scan",
              header: "Scan",
              render: (document) => (
                <Badge tone={documentScanTones[document.scanStatus] ?? "disabled"}>
                  {document.scanStatus}{document.scanSignature ? ` (${document.scanSignature})` : ""}
                </Badge>
              )
            },
            { key: "status", header: "Statut", render: (document) => document.status },
            { key: "shared", header: "Transmis", render: (document) => (document.sharedWithBroker ? "courtier partenaire assigne" : "non") },
            { key: "retention", header: "Retention", render: (document) => document.retentionUntil.slice(0, 10) },
            { key: "checksum", header: "Empreinte", render: (document) => <code>{document.checksum.slice(0, 12)}</code> }
          ]}
          items={documents.data.items}
          getKey={(document) => document.id}
          emptyLabel="Aucun document fourni par le prospect."
          aria-label="Documents du prospect"
        />
      </Card>
      <StateMessage>Les fichiers ne sont jamais telecharges depuis le back-office plateforme; seul le courtier partenaire assigne y accede via son CRM apres verification antivirus.</StateMessage>
    </PageStack>
  );
}
