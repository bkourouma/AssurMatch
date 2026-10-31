import { formatDateTime, pageHref, pageNumber, readQuoteReviewQueue } from "../../lib/operations-api";
import { Badge, Button, Card, Cluster, DescriptionList, EmptyState, Grid, PageHeader, PageStack, StateMessage, Stack } from "../../lib/ui/admin-ui";
import { QuoteReviewForm } from "../../lib/ui/operations-forms";
import { OperationsTabs } from "../../lib/ui/operations-tabs";
import { quoteStatusTones } from "../../lib/ui/operations-tones";
import { productLabel } from "../../lib/ui/operations-labels";

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
        breadcrumb={[{ label: "Pilotage" }, { label: "Opérations", href: "/operations" }, { label: "Revue devis" }]}
        title="Revue opérationnelle devis"
        description="Décidez des demandes retenues en revue, sans contourner consentement, licence ou autorisation. Chaque décision est motivée et auditée."
        actions={queue.status === "success" ? <Badge tone={queue.data.total > 0 ? "warning" : "neutral"}>{`${queue.data.total} demande(s) en revue`}</Badge> : null}
      />
      <OperationsTabs current="/operations/quote-review" />

      {queue.status === "unauthenticated" ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {queue.status === "forbidden" ? <StateMessage tone="danger">File de revue non accessible pour ce rôle admin.</StateMessage> : null}
      {queue.status === "error" ? <StateMessage tone="danger">File de revue indisponible : {queue.error}</StateMessage> : null}

      <StateMessage>
        Router ou assigner exige le droit d'affectation (Super Admin, Admin Pays) et un consentement accordé; marquer non routable ou doublon est ouvert à la conformité. Le support consulte sans décider.
      </StateMessage>

      {items.length === 0 && queue.status === "success" ? (
        <EmptyState
          icon="check"
          title="Aucune demande en attente de revue dans votre périmètre."
          description="Les demandes arrivent ici quand le produit impose une revue ou qu'une règle de routage manuelle les met de côté."
        />
      ) : null}

      <Stack as="section" aria-label="File de revue">
        {items.map((item) => {
          const eligible = item.candidates.filter((candidate) => candidate.eligible);
          const excluded = item.candidates.filter((candidate) => !candidate.eligible);
          return (
            <Card
              key={item.id}
              title={item.publicReference}
              description={`${item.countryCode ?? "-"} / ${productLabel(item.productKey)} - reçue le ${formatDateTime(item.createdAt)}`}
              actions={<Button href={`/quote-requests/${item.id}`} variant="tertiary" size="sm">Ouvrir la fiche</Button>}
            >
              <Grid columns="two">
                <Stack>
                  <Cluster>
                    <Badge tone={quoteStatusTones[item.status] ?? "neutral"}>{item.status}</Badge>
                    <Badge tone="warning">{item.routingStatus}</Badge>
                  </Cluster>
                  <DescriptionList
                    items={[
                      { term: "Courtiers partenaires évalués", value: `${eligible.length} éligible(s) sur ${item.candidates.length}` },
                      {
                        term: "Exclus",
                        value: excluded.length > 0 ? excluded.map((candidate) => `${candidate.legalName} (${candidate.reasons.join(", ")})`).join(" ; ") : "-"
                      }
                    ]}
                  />
                </Stack>
                <QuoteReviewForm quoteRequestId={item.id} candidates={item.candidates} />
              </Grid>
            </Card>
          );
        })}
      </Stack>

      {lastPage > 1 ? (
        <nav aria-label="Pagination de la file de revue">
          <Cluster>
            {page > 1 ? <Button href={pageHref("/operations/quote-review", {}, page - 1)} variant="secondary" size="sm">Page précédente</Button> : null}
            <span className="bo-description">{`Page ${page} sur ${lastPage}`}</span>
            {page < lastPage ? <Button href={pageHref("/operations/quote-review", {}, page + 1)} variant="secondary" size="sm">Page suivante</Button> : null}
          </Cluster>
        </nav>
      ) : null}
    </PageStack>
  );
}
