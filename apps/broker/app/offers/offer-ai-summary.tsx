import type { BrokerOfferReadState } from "../lib/offer-api";
import type { OfferAiSummaryView } from "../lib/lot4-offers-api";
import { offerFormatDate } from "../lib/offer-messages";
import { Badge, Card, Cluster, Stack } from "../lib/ui/broker-ui";

/**
 * Spec 070 OFFER-010: « Résumé IA » of an offer, broker side. STRICTLY READ ONLY: the broker has no
 * generation button and no edition. Closed by default (`enabled` false: a discreet mention, never a
 * text). The text shown is the last summary validated by a human administrator; it always carries
 * the generation label, the disclaimer and the validation date.
 */
export const OFFER_AI_SUMMARY_TITLE = "Résumé IA";
export const OFFER_AI_DISABLED_NOTE = "Assistance IA désactivée pour cette offre";
export const OFFER_AI_NO_SUMMARY_NOTE = "Aucun résumé validé";

export function OfferAiSummaryCard({ result }: { result: BrokerOfferReadState<OfferAiSummaryView> }) {
  const summary = result.data;
  const state = result.status !== "success" || !summary.enabled ? "disabled" : summary.available && summary.summary ? "available" : "none";
  return (
    <Card title={OFFER_AI_SUMMARY_TITLE} description="Aide à la lecture de l'offre, rédigée par l'IA puis validée par AssurMatch. Lecture seule.">
      <div data-offer-ai-summary={state}>
        <Stack>
          {result.status !== "success" ? (
            <p className="bo-description">Résumé IA indisponible pour le moment.</p>
          ) : !summary.enabled ? (
            <p className="bo-description">{OFFER_AI_DISABLED_NOTE}</p>
          ) : !summary.available || !summary.summary ? (
            <p className="bo-description">{OFFER_AI_NO_SUMMARY_NOTE}</p>
          ) : (
            <>
              <Cluster>
                <Badge tone="info">{summary.label}</Badge>
                <span className="bo-description">{`Validé le ${offerFormatDate(summary.validatedAt)}`}</span>
              </Cluster>
              <p>{summary.summary}</p>
              <p className="bo-description">{summary.disclaimer}</p>
            </>
          )}
        </Stack>
      </div>
    </Card>
  );
}
