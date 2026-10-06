import { formatDateTime, pageHref, pageNumber, readQuoteReviewQueue } from "../../lib/operations-api";
import { Badge, Button, Card, KpiCard, Grid, PageHeader, PageStack, StateMessage, Stack } from "../../lib/ui/admin-ui";
import { QuoteReviewForm } from "../../lib/ui/operations-forms";
import { OperationsTabs } from "../../lib/ui/operations-tabs";
import { quoteStatusTones } from "../../lib/ui/operations-tones";

/**
 * Spec 056 (H-02): queue of requests held for manual review, either because the product forces a
 * review (`manual_review`) or because a `manual` routing rule parked them
 * (`pending_manual_assignment`). Every decision is persisted with its reason and audited.
 */
export default async function AdminQuoteReviewPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = searchParams ? await searchParams : {};
  const page = pageNumber(params.page);
  const queue = await readQuoteReviewQueue(page);
  const items = queue.data.items;
  const lastPage = Math.max(1, Math.ceil(queue.data.total / Math.max(queue.data.pageSize, 1)));

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Pilotage" }, { label: "Operations", href: "/operations" }, { label: "Revue devis" }]}
        kicker="Operations"
        title="Revue operationnelle devis"
        description="Les demandes non routables ou doublons peuvent etre marquees sans contourner consentement, licence ou autorisation. Chaque decision est persistee, motivee et auditee."
      />
      <OperationsTabs current="/operations/quote-review" />

      {queue.status === "unauthenticated" ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {queue.status === "forbidden" ? <StateMessage tone="danger">File de revue non accessible pour ce role admin.</StateMessage> : null}
      {queue.status === "error" ? <StateMessage tone="danger">File de revue indisponible : {queue.error}</StateMessage> : null}

      <Grid columns="kpi" as="section" aria-label="Synthese revue">
        <KpiCard label="Demandes en revue" value={queue.data.total} tone={queue.data.total > 0 ? "warning" : "neutral"} />
      </Grid>

      <StateMessage>
        Router ou assigner exige le droit d'affectation (Super Admin, Admin Pays) et un consentement accorde; marquer non routable ou doublon est ouvert a la conformite. Le support consulte sans decider.
      </StateMessage>

      {items.length === 0 && queue.status === "success" ? <StateMessage>Aucune demande en attente de revue dans votre perimetre.</StateMessage> : null}

      <Stack>
        {items.map((item) => (
          <Card
            key={item.id}
            title={item.publicReference}
            description={`${item.countryCode ?? "-"} / ${item.productKey ?? "-"} - recue le ${formatDateTime(item.createdAt)}`}
            actions={<Button href={`/quote-requests/${item.id}`} variant="tertiary" size="sm">Ouvrir la fiche</Button>}
          >
            <p>
              <Badge tone={quoteStatusTones[item.status] ?? "neutral"}>{item.status}</Badge> <Badge tone="warning">{item.routingStatus}</Badge>
            </p>
            <p>
              Courtiers partenaires evalues : {item.candidates.filter((candidate) => candidate.eligible).length} eligible(s) sur {item.candidates.length}.
              {item.candidates.filter((candidate) => !candidate.eligible).length > 0
                ? ` Exclus : ${item.candidates.filter((candidate) => !candidate.eligible).map((candidate) => `${candidate.legalName} (${candidate.reasons.join(", ")})`).join(" ; ")}.`
                : ""}
            </p>
            <QuoteReviewForm quoteRequestId={item.id} candidates={item.candidates} />
          </Card>
        ))}
      </Stack>

      {lastPage > 1 ? (
        <p>
          {page > 1 ? <a href={pageHref("/operations/quote-review", {}, page - 1)}>Page precedente</a> : null}
          {` Page ${page} sur ${lastPage} `}
          {page < lastPage ? <a href={pageHref("/operations/quote-review", {}, page + 1)}>Page suivante</a> : null}
        </p>
      ) : null}
    </PageStack>
  );
}
