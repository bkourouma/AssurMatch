import { readAdminQuoteDocuments } from "../../lib/admin-api";
import { formatDateTime, readQuoteRequestDetail, readQuoteReviewQueue } from "../../lib/operations-api";
import { Badge, Card, DataTable, DescriptionList, Grid, PageHeader, PageStack, StateMessage, documentScanTones } from "../../lib/ui/admin-ui";
import { QuoteReviewForm } from "../../lib/ui/operations-forms";
import { assignmentStatusTones, quoteStatusTones, routingResultTones } from "../../lib/ui/operations-tones";

/**
 * Spec 056 (H-01): quote request record. Consent summary, every routing decision with the excluded
 * candidates and their reasons, assignments with the partner's name, documents (metadata only) and
 * the selected offer's outcome. Support admins receive contact and answers masked by the API.
 */
export default async function AdminQuoteRequestDetailPage({ params }: { params: Promise<{ quoteRequestId: string }> }) {
  const { quoteRequestId } = await params;
  const [detailResult, documents] = await Promise.all([readQuoteRequestDetail(quoteRequestId), readAdminQuoteDocuments(quoteRequestId)]);
  const detail = detailResult.data;
  const review = detail?.reviewOpen ? await readQuoteReviewQueue() : undefined;
  const reviewItem = review?.data.items.find((item) => item.id === quoteRequestId);

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

      {detailResult.status === "unauthenticated" ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {detailResult.status === "forbidden" ? <StateMessage tone="danger">Acces refuse : role non autorise ou demande hors de votre perimetre pays (refus audite).</StateMessage> : null}
      {detailResult.status === "not_found" ? <StateMessage tone="danger">Demande de devis introuvable.</StateMessage> : null}
      {detailResult.status === "error" ? <StateMessage tone="danger">Fiche indisponible : {detailResult.error}</StateMessage> : null}

      <Card title="Identification">
        <DescriptionList
          columns={2}
          items={[
            { term: "Demande de devis", value: <code>{quoteRequestId}</code> },
            { term: "Reference", value: detail ? <code>{detail.publicReference}</code> : "-" },
            { term: "Pays / produit", value: detail ? `${detail.countryCode ?? "-"} / ${detail.productKey ?? "-"}` : "-" },
            { term: "Statut", value: detail ? <Badge tone={quoteStatusTones[detail.status] ?? "neutral"}>{detail.status}</Badge> : "-" },
            { term: "Routage", value: detail?.routingStatus ?? "-" },
            { term: "Doublon", value: detail ? `${detail.duplicateStatus}${detail.duplicateOfQuoteRequestId ? ` (origine ${detail.duplicateOfQuoteRequestId.slice(0, 8)})` : ""}` : "-" },
            { term: "Motif de refus", value: detail?.refusalReason ?? "-" },
            { term: "Recue le", value: formatDateTime(detail?.createdAt) },
            { term: "Documents references", value: documents.status === "success" ? documents.data.items.length : "-" }
          ]}
        />
      </Card>

      {detail ? (
        <>
          <Grid columns="two">
            <Card title="Consentement de transmission" description="Historise dans ConsentRecord; aucune transmission sans consentement accorde.">
              <DescriptionList
                items={[
                  { term: "Statut", value: <Badge tone={detail.consent.status === "granted" ? "success" : "danger"}>{detail.consent.status ?? "inconnu"}</Badge> },
                  { term: "Destinataire prevu", value: detail.consent.intendedRecipient ?? "-" },
                  { term: "Accorde le", value: formatDateTime(detail.consent.grantedAt) },
                  { term: "Retire le", value: formatDateTime(detail.consent.withdrawnAt) },
                  { term: "Canal", value: detail.consent.channel ?? "-" }
                ]}
              />
            </Card>
            <Card title="Prospect" description={detail.piiMasked ? "Coordonnees masquees pour votre role (support)." : "Donnees personnelles : usage strictement operationnel."}>
              {detail.anonymized ? <StateMessage>Demande anonymisee (politique de conservation) : coordonnees supprimees.</StateMessage> : null}
              <DescriptionList
                items={[
                  { term: "Nom", value: detail.contact?.displayName ?? "-" },
                  { term: "E-mail", value: detail.contact?.email ?? "-" },
                  { term: "Telephone", value: detail.contact?.phone ?? "-" },
                  ...Object.entries(detail.answers).map(([key, value]) => ({ term: key, value: typeof value === "string" ? value : JSON.stringify(value) }))
                ]}
              />
            </Card>
          </Grid>

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
            ) : <p>Aucune offre choisie : le routage standard s'applique.</p>}
          </Card>

          <Card title="Decisions de routage" description="Chaque decision liste les courtiers partenaires retenus, les candidats exclus et les raisons (journal opposable).">
            <DataTable
              columns={[
                { key: "date", header: "Date", render: (decision) => formatDateTime(decision.createdAt) },
                { key: "result", header: "Resultat", render: (decision) => <Badge tone={routingResultTones[decision.result] ?? "neutral"}>{decision.result}</Badge> },
                { key: "candidates", header: "Candidats", render: (decision) => decision.candidateCount, numeric: true, align: "right" },
                { key: "selected", header: "Retenus", render: (decision) => decision.selectedPartners.map((partner) => partner.legalName ?? partner.partnerTenantId.slice(0, 8)).join(", ") || "-" },
                {
                  key: "excluded",
                  header: "Exclus et raisons",
                  render: (decision) => decision.excludedCandidates.length === 0
                    ? "-"
                    : decision.excludedCandidates.map((candidate) => `${candidate.legalName ?? candidate.partnerTenantId.slice(0, 8)} : ${candidate.reasons.join(", ")}`).join(" ; ")
                },
                { key: "reasons", header: "Raisons", render: (decision) => decision.reasons.join(", ") || "-" }
              ]}
              items={detail.routingDecisions}
              getKey={(decision) => decision.id}
              emptyLabel="Aucune decision de routage enregistree."
              aria-label="Decisions de routage"
            />
          </Card>

          <Card title="Affectations">
            <DataTable
              columns={[
                { key: "partner", header: "Courtier partenaire", render: (assignment) => assignment.partnerLegalName ?? assignment.partnerTenantId.slice(0, 8) },
                { key: "status", header: "Statut", render: (assignment) => <Badge tone={assignmentStatusTones[assignment.status] ?? "neutral"}>{assignment.status}</Badge> },
                { key: "reason", header: "Motif", render: (assignment) => assignment.assignmentReason },
                { key: "recipients", header: "Destinataires", render: (assignment) => assignment.recipientCount, numeric: true, align: "right" },
                { key: "assigned", header: "Affecte le", render: (assignment) => formatDateTime(assignment.assignedAt) },
                { key: "action", header: "Derniere action", render: (assignment) => formatDateTime(assignment.lastBrokerActionAt) }
              ]}
              items={detail.assignments}
              getKey={(assignment) => assignment.id}
              emptyLabel="Aucune affectation."
              aria-label="Affectations de la demande"
            />
          </Card>

          <Card title="Revue manuelle" description="Decision persistee et auditee : router, assigner, marquer non routable ou doublon.">
            {detail.reviewedAt ? (
              <DescriptionList
                items={[
                  { term: "Revue le", value: formatDateTime(detail.reviewedAt) },
                  { term: "Par", value: detail.reviewedById ? <code>{detail.reviewedById}</code> : "-" },
                  { term: "Motif", value: detail.manualReviewReason ?? "-" }
                ]}
              />
            ) : null}
            {detail.reviewOpen && reviewItem ? <QuoteReviewForm quoteRequestId={detail.id} candidates={reviewItem.candidates} /> : null}
            {detail.reviewOpen && !reviewItem ? <StateMessage>Demande en revue : traitez-la depuis la file de revue.</StateMessage> : null}
            {!detail.reviewOpen && !detail.reviewedAt ? <p>Cette demande n'est pas en revue manuelle.</p> : null}
          </Card>
        </>
      ) : null}

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
