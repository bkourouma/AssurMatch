import { readAdminQuoteDocuments } from "../../lib/admin-api";
import { formatDateTime, readQuoteRequestDetail, readQuoteReviewQueue } from "../../lib/operations-api";
import { Badge, Card, Cluster, DataTable, DescriptionList, PageHeader, PageStack, Split, Stack, StateMessage, documentScanTones } from "../../lib/ui/admin-ui";
import { QuoteReviewForm } from "../../lib/ui/operations-forms";
import { LeadConversationsCard } from "./lead-conversations-card";
import { assignmentStatusTones, quoteStatusTones, routingResultTones } from "../../lib/ui/operations-tones";
import {
  assignmentStatusLabel,
  consentChannelLabel,
  consentRecipientLabel,
  consentStatusLabel,
  documentKindLabel,
  documentScanLabel,
  documentStatusLabel,
  duplicateStatusLabel,
  productLabel,
  quoteAnswerLabel,
  quoteAnswerValueLabel,
  quoteStatusLabel,
  routingReasonLabel,
  routingReasonsLabel,
  routingResultLabel,
  routingStatusLabel
} from "../../lib/ui/operations-labels";

/**
 * Spec 056 (H-01): quote request record. Consent summary, every routing decision with the excluded
 * candidates and their reasons, assignments with the partner's name, documents (metadata only) and
 * the selected offer's outcome. Support admins receive contact and answers masked by the API.
 */
export default async function AdminQuoteRequestDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ quoteRequestId: string }>;
  searchParams?: Promise<{ conversations?: string }>;
}) {
  const { quoteRequestId } = await params;
  // Conversation content is loaded (and audited by the API) only on an explicit action: `?conversations=1`.
  const showConversations = ((searchParams ? await searchParams : {}).conversations) === "1";
  const [detailResult, documents] = await Promise.all([readQuoteRequestDetail(quoteRequestId), readAdminQuoteDocuments(quoteRequestId)]);
  const detail = detailResult.data;
  const review = detail?.reviewOpen ? await readQuoteReviewQueue() : undefined;
  const reviewItem = review?.data.items.find((item) => item.id === quoteRequestId);

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[
          { label: "Pilotage" },
          { label: "Opérations", href: "/operations" },
          { label: "Demandes de devis", href: "/quote-requests" },
          { label: "Détail" }
        ]}
        title={detail ? `Demande ${detail.publicReference}` : "Détail demande de devis"}
        description="Consentement, routage, affectations et documents du prospect. Chaque décision affichée ici est journalisée."
        actions={
          detail ? (
            <Cluster>
              <Badge tone={quoteStatusTones[detail.status] ?? "neutral"} title={detail.status}>{quoteStatusLabel(detail.status)}</Badge>
              {detail.reviewOpen ? <Badge tone="warning">En revue manuelle</Badge> : null}
            </Cluster>
          ) : null
        }
      />

      {detailResult.status === "unauthenticated" ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {detailResult.status === "forbidden" ? <StateMessage tone="danger">Accès refusé : rôle non autorisé ou demande hors de votre périmètre pays (refus audité).</StateMessage> : null}
      {detailResult.status === "not_found" ? <StateMessage tone="danger">Demande de devis introuvable.</StateMessage> : null}
      {detailResult.status === "error" ? <StateMessage tone="danger">Fiche indisponible : {detailResult.error}</StateMessage> : null}

      <Split>
        <Stack>
          {detail && (detail.reviewOpen || detail.reviewedAt) ? (
            <Card title="Revue manuelle" description="Décision persistée et auditée : router, assigner, marquer non routable ou doublon.">
              {detail.reviewedAt ? (
                <DescriptionList
                  columns={2}
                  items={[
                    { term: "Revue le", value: formatDateTime(detail.reviewedAt) },
                    { term: "Par", value: detail.reviewedById ? <span className="bo-ref">{detail.reviewedById}</span> : "-" },
                    { term: "Motif", value: detail.manualReviewReason ?? "-" }
                  ]}
                />
              ) : null}
              {detail.reviewOpen && reviewItem ? <QuoteReviewForm quoteRequestId={detail.id} candidates={reviewItem.candidates} /> : null}
              {detail.reviewOpen && !reviewItem ? <StateMessage>Demande en revue : traitez-la depuis la file de revue.</StateMessage> : null}
            </Card>
          ) : null}
          <Card title="Identification">
            <DescriptionList
              columns={2}
              items={[
                { term: "Demande de devis", value: <code className="bo-break">{quoteRequestId}</code> },
                { term: "Référence", value: detail ? <span className="bo-ref">{detail.publicReference}</span> : "-" },
                { term: "Pays / produit", value: detail ? `${detail.countryCode ?? "-"} / ${productLabel(detail.productKey)}` : "-" },
                { term: "Statut", value: detail ? <Badge tone={quoteStatusTones[detail.status] ?? "neutral"} title={detail.status}>{quoteStatusLabel(detail.status)}</Badge> : "-" },
                { term: "Routage", value: detail ? routingStatusLabel(detail.routingStatus) : "-" },
                { term: "Doublon", value: detail ? `${duplicateStatusLabel(detail.duplicateStatus)}${detail.duplicateOfQuoteRequestId ? ` (origine ${detail.duplicateOfQuoteRequestId.slice(0, 8)})` : ""}` : "-" },
                { term: "Motif de refus", value: routingReasonLabel(detail?.refusalReason) },
                { term: "Reçue le", value: formatDateTime(detail?.createdAt) },
                { term: "Documents référencés", value: documents.status === "success" ? documents.data.items.length : "-" }
              ]}
            />
          </Card>
          {detail ? (
            <Card title="Offre choisie par le visiteur">
              {detail.selectedOffer ? (
                <DescriptionList
                  items={[
                    { term: "Offre", value: detail.selectedOffer.name ?? detail.selectedOffer.offerId },
                    { term: "Courtier de l'offre", value: detail.selectedOffer.partnerLegalName ?? "-" },
                    {
                      term: "Issue",
                      value: detail.selectedOffer.outcome === "retained"
                        ? <Badge tone="success">courtier de l'offre retenu</Badge>
                        : detail.selectedOffer.outcome === "not_retained"
                          ? <Badge tone="warning">autre courtier partenaire retenu</Badge>
                          : <Badge tone="info">en attente de routage</Badge>
                    }
                  ]}
                />
              ) : <p className="bo-description">Aucune offre choisie : le routage standard s'applique.</p>}
            </Card>
          ) : null}
        </Stack>
        <Stack>
          {detail ? (
            <>
              <Card title="Consentement de transmission" description="Historisé dans ConsentRecord; aucune transmission sans consentement accordé.">
                <DescriptionList
                  items={[
                    { term: "Statut", value: <Badge tone={detail.consent.status === "granted" ? "success" : "danger"} title={detail.consent.status ?? undefined}>{consentStatusLabel(detail.consent.status)}</Badge> },
                    { term: "Destinataire prévu", value: consentRecipientLabel(detail.consent.intendedRecipient) },
                    { term: "Accordé le", value: formatDateTime(detail.consent.grantedAt) },
                    { term: "Retiré le", value: formatDateTime(detail.consent.withdrawnAt) },
                    { term: "Canal", value: consentChannelLabel(detail.consent.channel) }
                  ]}
                />
              </Card>
              <Card title="Prospect" description={detail.piiMasked ? "Coordonnées masquées pour votre rôle (support)." : "Données personnelles : usage strictement opérationnel."}>
                {detail.anonymized ? <StateMessage>Demande anonymisée (politique de conservation) : coordonnées supprimées.</StateMessage> : null}
                <DescriptionList
                  items={[
                    { term: "Nom", value: detail.contact?.displayName ?? "-" },
                    { term: "E-mail", value: detail.contact?.email ?? "-" },
                    { term: "Téléphone", value: detail.contact?.phone ?? "-" },
                    ...Object.entries(detail.answers).map(([key, value]) => ({ term: quoteAnswerLabel(key), value: quoteAnswerValueLabel(key, value) }))
                  ]}
                />
              </Card>
            </>
          ) : null}
        </Stack>
      </Split>

      {detail ? (
        <>
          <Card title="Décisions de routage" description="Courtiers partenaires retenus, candidats exclus et raisons (journal opposable).">
            <DataTable
              columns={[
                { key: "date", header: "Date", render: (decision) => formatDateTime(decision.createdAt) },
                { key: "result", header: "Résultat", render: (decision) => <Badge tone={routingResultTones[decision.result] ?? "neutral"} title={decision.result}>{routingResultLabel(decision.result)}</Badge> },
                { key: "candidates", header: "Candidats", render: (decision) => decision.candidateCount, numeric: true, align: "right" },
                { key: "selected", header: "Retenus", render: (decision) => decision.selectedPartners.map((partner) => partner.legalName ?? partner.partnerTenantId.slice(0, 8)).join(", ") || "-" },
                {
                  key: "excluded",
                  header: "Exclus et raisons",
                  render: (decision) => decision.excludedCandidates.length === 0
                    ? "-"
                    : decision.excludedCandidates.map((candidate) => `${candidate.legalName ?? candidate.partnerTenantId.slice(0, 8)} : ${routingReasonsLabel(candidate.reasons)}`).join(" ; ")
                },
                { key: "reasons", header: "Raisons", render: (decision) => routingReasonsLabel(decision.reasons) }
              ]}
              items={detail.routingDecisions}
              getKey={(decision) => decision.id}
              emptyLabel="Aucune décision de routage enregistrée."
              emptyDescription="Le moteur de routage n'a pas encore traité cette demande."
              aria-label="Décisions de routage"
            />
          </Card>

          <Card title="Affectations">
            <DataTable
              columns={[
                { key: "partner", header: "Courtier partenaire", render: (assignment) => assignment.partnerLegalName ?? assignment.partnerTenantId.slice(0, 8) },
                { key: "status", header: "Statut", render: (assignment) => <Badge tone={assignmentStatusTones[assignment.status] ?? "neutral"} title={assignment.status}>{assignmentStatusLabel(assignment.status)}</Badge> },
                { key: "reason", header: "Motif", render: (assignment) => routingReasonLabel(assignment.assignmentReason) },
                { key: "recipients", header: "Destinataires", render: (assignment) => assignment.recipientCount, numeric: true, align: "right" },
                { key: "assigned", header: "Affecté le", render: (assignment) => formatDateTime(assignment.assignedAt) },
                { key: "action", header: "Dernière action", render: (assignment) => formatDateTime(assignment.lastBrokerActionAt) }
              ]}
              items={detail.assignments}
              getKey={(assignment) => assignment.id}
              emptyLabel="Aucune affectation."
              emptyDescription="Une affectation apparaît quand un courtier partenaire reçoit la demande."
              aria-label="Affectations de la demande"
            />
          </Card>
        </>
      ) : null}

      <LeadConversationsCard quoteRequestId={quoteRequestId} show={showConversations} />

      <Card title="Documents du prospect" description="Fichiers décrits par leurs métadonnées uniquement, aucun contenu de fichier.">
        {documents.unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
        {documents.forbidden ? <StateMessage tone="danger">Accès documents refusé pour ce rôle admin.</StateMessage> : null}
        {documents.status === "error" ? <StateMessage tone="danger">Documents indisponibles: {documents.error}</StateMessage> : null}
        <DataTable
          columns={[
            { key: "label", header: "Libellé", render: (document) => document.label },
            { key: "kind", header: "Type", render: (document) => documentKindLabel(document.documentKind) },
            { key: "file", header: "Fichier", render: (document) => `${document.fileName} (${document.mimeType}, ${Math.ceil(document.sizeBytes / 1024)} Ko)` },
            {
              key: "scan",
              header: "Scan",
              render: (document) => (
                <Badge tone={documentScanTones[document.scanStatus] ?? "disabled"}>
                  {documentScanLabel(document.scanStatus)}{document.scanSignature ? ` (${document.scanSignature})` : ""}
                </Badge>
              )
            },
            { key: "status", header: "Statut", render: (document) => documentStatusLabel(document.status) },
            { key: "shared", header: "Transmis", render: (document) => (document.sharedWithBroker ? "courtier partenaire assigné" : "non") },
            { key: "retention", header: "Rétention", render: (document) => document.retentionUntil.slice(0, 10) },
            { key: "checksum", header: "Empreinte", render: (document) => <span className="bo-ref">{document.checksum.slice(0, 12)}</span> }
          ]}
          items={documents.data.items}
          getKey={(document) => document.id}
          emptyLabel="Aucun document fourni par le prospect."
          aria-label="Documents du prospect"
        />
        <StateMessage>Les fichiers ne sont jamais téléchargés depuis le back-office plateforme; seul le courtier partenaire assigné y accède via son CRM après vérification antivirus.</StateMessage>
      </Card>
    </PageStack>
  );
}
