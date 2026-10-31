import { formatDateTime, readProspectDetail } from "../../lib/operations-api";
import { Badge, Card, DataTable, DescriptionList, PageHeader, PageStack, StateMessage, type DataTableColumn } from "../../lib/ui/admin-ui";
import { OperationsTabs } from "../../lib/ui/operations-tabs";
import { productLabel } from "../../lib/ui/operations-labels";

/**
 * Spec 073 (FR-002, FR-005): prospect record. Clear contact values are returned by the API only to
 * the super admin and the support admin (reading audited); everyone else sees masked values.
 */

interface LinkedQuote {
  id: string;
  publicReference: string;
  status: string;
  createdAt: string;
}

const quoteColumns: Array<DataTableColumn<LinkedQuote>> = [
  { key: "reference", header: "Référence", render: (row) => <code>{row.publicReference}</code> },
  { key: "status", header: "Statut", render: (row) => row.status },
  { key: "created", header: "Reçue le", render: (row) => formatDateTime(row.createdAt) }
];

export default async function AdminProspectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await readProspectDetail(id);
  const detail = result.data;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Pilotage" }, { label: "Opérations", href: "/operations" }, { label: "Prospects", href: "/prospects" }, { label: "Détail" }]}
        kicker="Opérations"
        title="Détail prospect"
        description="Coordonnées en clair réservées au super admin et au support admin; chaque consultation est enregistrée dans le journal d'audit."
      />
      <OperationsTabs current="/prospects" />

      {result.status === "unauthenticated" ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {result.status === "forbidden" ? <StateMessage tone="danger">Accès refusé : rôle non autorisé ou prospect hors de votre périmètre (refus audité).</StateMessage> : null}
      {result.status === "not_found" ? <StateMessage tone="danger">Prospect introuvable.</StateMessage> : null}
      {result.status === "error" ? <StateMessage tone="danger">Fiche indisponible : {result.error}</StateMessage> : null}
      {detail?.anonymized ? <StateMessage tone="warning">Prospect anonymisé : aucune coordonnée n'est conservée.</StateMessage> : null}
      {detail && !detail.anonymized && !detail.piiRevealed ? <StateMessage tone="info">Coordonnées masquées pour votre rôle.</StateMessage> : null}

      <Card title="Identification">
        <DescriptionList
          columns={2}
          items={[
            { term: "Identifiant", value: <code>{id}</code> },
            { term: "Nom", value: detail?.displayName ?? "-" },
            { term: "E-mail", value: detail?.email ?? "-" },
            { term: "Téléphone", value: detail?.phone ?? "-" },
            { term: "Pays / produit", value: detail ? `${detail.countryCode ?? "-"} / ${productLabel(detail.productKey)}` : "-" },
            { term: "État", value: detail ? <Badge tone={detail.anonymized ? "neutral" : "success"}>{detail.anonymized ? "Anonymisé" : "Actif"}</Badge> : "-" },
            { term: "Consentements", value: detail?.consentCount ?? "-" },
            { term: "Créé le", value: formatDateTime(detail?.createdAt) },
            { term: "Mis à jour le", value: formatDateTime(detail?.updatedAt) },
            { term: "Conservation jusqu'au", value: formatDateTime(detail?.retentionUntil) },
            { term: "Anonymisé le", value: formatDateTime(detail?.anonymizedAt) }
          ]}
        />
      </Card>

      <Card as="section" aria-label="Demandes de devis liées" title="Demandes de devis liées">
        <DataTable
          columns={quoteColumns}
          items={detail?.quoteRequests ?? []}
          getKey={(row) => row.id}
          getRowHref={(row) => `/quote-requests/${row.id}`}
          emptyLabel="Aucune demande de devis liée."
          aria-label="Demandes de devis liées"
        />
      </Card>
    </PageStack>
  );
}
