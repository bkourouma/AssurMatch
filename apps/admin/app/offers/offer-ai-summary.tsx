import { generateOfferSummaryAction } from "../lib/lot4-offers-actions";
import type { Lot4ReadState, OfferAiSummaryView } from "../lib/lot4-offers-api";
import {
  OFFER_AI_DISABLED_NOTE,
  OFFER_AI_NO_SUMMARY_NOTE,
  OFFER_AI_SUMMARY_NOTICES,
  OFFER_AI_SUMMARY_TITLE,
  offerFormatDate
} from "../lib/offer-messages";
import { Badge, Button, Card, Cluster, Form, Notice, Stack } from "../lib/ui/admin-ui";

/**
 * Spec 070 OFFER-010: « Résumé IA » of an offer, admin side. Reading is closed by default
 * (`enabled` false: only a discreet mention, never a text). The text shown is the last summary
 * VALIDATED by a human; it always carries the generation label, the disclaimer and the validation
 * date. The generation button (queues an `offer_summary` insight) exists only here, only when the
 * feature is enabled and only for the AI roles: the validation itself stays on /ai-assistance.
 */
export function OfferAiSummaryCard({ offerId, result, canGenerate, aiNotice }: {
  offerId: string;
  result: Lot4ReadState<OfferAiSummaryView>;
  canGenerate: boolean;
  aiNotice?: string | undefined;
}) {
  const summary = result.data;
  const enabled = result.status === "success" && summary.enabled;
  const noticeText = aiNotice ? OFFER_AI_SUMMARY_NOTICES[aiNotice] : undefined;
  return (
    <Card title={OFFER_AI_SUMMARY_TITLE} description="Aide à la lecture de l'offre : jamais une décision, jamais visible du public.">
      <div data-offer-ai-summary={enabled ? (summary.available ? "available" : "none") : "disabled"}>
        <Stack>
          {noticeText ? <Notice tone={aiNotice === "queued" ? "info" : "warning"}>{noticeText}</Notice> : null}
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
          {enabled && canGenerate ? (
            <Cluster>
              <Form action={generateOfferSummaryAction}>
                <input type="hidden" name="offerId" value={offerId} />
                <Button type="submit" variant="secondary" size="sm">Générer un résumé IA</Button>
              </Form>
              <Button href="/ai-assistance" variant="tertiary" size="sm">Valider dans l&apos;assistance IA</Button>
            </Cluster>
          ) : null}
        </Stack>
      </div>
    </Card>
  );
}
