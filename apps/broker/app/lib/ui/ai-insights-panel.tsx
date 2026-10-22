import type { BackOfficeProfile } from "../backoffice-auth";
import { readBrokerAIAssistance, readBrokerAiOptOut, readBrokerManagerAnalyses, readBrokerPerformanceSummaries, readBrokerTeam } from "../broker-api";
import type { BrokerAIAssistanceData, BrokerAiInteraction, BrokerManagerAnalysis, BrokerTeamMemberData } from "../broker-api";
import { aiInsightsPrefetchAllowed, aiInsightsVisible, canWriteAiInsights, managerAssistantOpen } from "../ai-insights-access";
import { TENANT_SUSPENDED_MESSAGE, isTenantReadOnly } from "../broker-permissions";
import { requestManagerAssistantAction, requestPerformanceSummaryAction, validateTenantInsightAction } from "../crm-ai-actions";
import { Badge, Button, Card, Cluster, Field, Notice, Select, Stack, TenantWriteGuard } from "./broker-ui";
import { formatDate } from "./broker-view-models";

/**
 * Lot 3 (spec 069 FR-004, DASH-B-009, PRD §10.2): « Résumé IA de performance » et « Assistant manager »
 * (Enterprise) du tableau de bord courtier. Le panneau n'existe que si l'assistance IA est ouverte pour
 * le cabinet (statut d'assistance actif, drapeau `ai_summary_enabled` ouvert, pas d'opt-out) : sinon il
 * est masqué, sans appel supplémentaire à l'API. Chaque sortie est une suggestion à valider par un
 * humain ; rien ne modifie un lead. L'API reste l'autorité (plan, drapeaux, opt-out, quota, rôle).
 */
export const AI_INSIGHT_LABEL = "Assistance IA - suggestion à valider";

/** Pages that render the panel; the actions return to the page the form came from. */
export type InsightReturnPage = "/" | "/crm";

const WINDOW_OPTIONS = [
  { value: "7", label: "7 derniers jours" },
  { value: "30", label: "30 derniers jours" },
  { value: "90", label: "90 derniers jours" }
];

const NOTICES: Record<string, string> = {
  queued: "Demande enregistrée. Rechargez la page dans quelques secondes pour consulter la suggestion.",
  validated: "Décision de validation humaine enregistrée et auditée.",
  quota: "Quota quotidien d'assistance IA atteint pour votre cabinet.",
  disabled: "Assistance IA indisponible (fonctionnalité fermée, opt-out du cabinet ou plan).",
  forbidden: "Action refusée par vos permissions.",
  suspended: TENANT_SUSPENDED_MESSAGE,
  session: "Votre session a expiré. Reconnectez-vous pour continuer.",
  error: "Assistance IA temporairement indisponible."
};
const SUCCESS_NOTICES = new Set(["queued", "validated"]);

const STATUS_LABELS: Record<BrokerAiInteraction["status"], string> = {
  completed: "Terminée",
  queued: "En cours",
  refused: "Refusée",
  failed: "Échec"
};

export const VALIDATION_LABELS: Record<BrokerAiInteraction["humanValidationStatus"], string> = {
  not_required: "Validation non requise",
  pending: "Validation humaine : à valider",
  approved: "Validation humaine : validée",
  rejected: "Validation humaine : rejetée"
};

function statusTone(status: BrokerAiInteraction["status"]): "success" | "warning" | "info" {
  if (status === "completed") return "success";
  if (status === "refused" || status === "failed") return "warning";
  return "info";
}

/** Nom d'un conseiller à partir de l'équipe du cabinet ; jamais l'identifiant brut. */
function advisorName(members: readonly BrokerTeamMemberData[], id: string): string {
  return members.find((member) => member.id === id)?.displayName ?? "Conseiller hors équipe";
}

function InsightList({
  items,
  returnTo,
  canWrite,
  members,
  emptyLabel
}: {
  items: Array<BrokerAiInteraction | BrokerManagerAnalysis>;
  returnTo: InsightReturnPage;
  canWrite: boolean;
  members: readonly BrokerTeamMemberData[];
  emptyLabel: string;
}) {
  if (items.length === 0) return <p>{emptyLabel}</p>;
  return (
    <Stack>
      {items.map((interaction) => {
        const labels = "advisorLabels" in interaction ? interaction.advisorLabels : undefined;
        const labelEntries = labels ? Object.entries(labels) : [];
        return (
          <Card key={interaction.id} muted>
            <Cluster>
              <strong>Généré le {formatDate(interaction.createdAt)}</strong>
              <Badge tone="info">{AI_INSIGHT_LABEL}</Badge>
              <Badge tone={statusTone(interaction.status)}>{STATUS_LABELS[interaction.status] ?? interaction.status}</Badge>
              {interaction.fallback ? <Badge tone="neutral">mode simplifié</Badge> : null}
              {interaction.humanValidationStatus !== "not_required" ? (
                <Badge tone={interaction.humanValidationStatus === "pending" ? "warning" : "info"}>
                  {VALIDATION_LABELS[interaction.humanValidationStatus] ?? interaction.humanValidationStatus}
                </Badge>
              ) : null}
            </Cluster>
            {interaction.status === "completed" && interaction.outputText ? <p>{interaction.outputText}</p> : null}
            {interaction.status === "queued" ? <p>Suggestion en cours de préparation.</p> : null}
            {interaction.status === "refused" ? <p>Suggestion retenue par les garde-fous ou assistance désactivée.</p> : null}
            {interaction.status === "failed" ? <p>La suggestion n&apos;a pas abouti. Vous pouvez en demander une nouvelle.</p> : null}
            {interaction.status === "completed" && interaction.disclaimer ? <p>{interaction.disclaimer}</p> : null}
            {labelEntries.length > 0 ? (
              <details>
                <summary>Correspondance des libellés conseillers (visible par le manager uniquement)</summary>
                <ul>
                  {labelEntries.map(([label, advisorId]) => (
                    <li key={label}>
                      {label} : {advisorName(members, advisorId)}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {canWrite && interaction.status === "completed" && interaction.humanValidationStatus === "pending" ? (
              <Cluster>
                {(["approved", "rejected"] as const).map((decision) => (
                  <form key={decision} action={validateTenantInsightAction}>
                    <input type="hidden" name="interactionId" value={interaction.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <input type="hidden" name="decision" value={decision} />
                    <Button type="submit" variant="secondary" size="sm">
                      {decision === "approved" ? "Valider la suggestion" : "Rejeter la suggestion"}
                    </Button>
                  </form>
                ))}
              </Cluster>
            ) : null}
          </Card>
        );
      })}
    </Stack>
  );
}

function RequestForm({ action, id, buttonLabel, returnTo }: { action: (formData: FormData) => Promise<void>; id: string; buttonLabel: string; returnTo: InsightReturnPage }) {
  return (
    <form action={action}>
      <input type="hidden" name="returnTo" value={returnTo} />
      <Cluster>
        <Field id={id} label="Période analysée">
          <Select id={id} name="windowDays" defaultValue="30" options={WINDOW_OPTIONS} />
        </Field>
        <Button type="submit" variant="secondary">{buttonLabel}</Button>
      </Cluster>
    </form>
  );
}

/**
 * Server component. Rendered by the dashboard and the CRM pipeline only for Pro/Enterprise; returns nothing when the
 * assistance is closed, so a closed flag, an opt-out or a role without right leaks no AI surface.
 */
export async function AiInsightsPanel({
  profile,
  assistance,
  optedOut,
  notice,
  returnTo = "/crm"
}: {
  profile: BackOfficeProfile;
  assistance: BrokerAIAssistanceData | undefined;
  optedOut: boolean;
  notice?: string | undefined;
  returnTo?: InsightReturnPage | undefined;
}) {
  if (!aiInsightsVisible(profile, assistance, optedOut)) return null;

  const enterprise = managerAssistantOpen(profile, assistance);
  const canWrite = canWriteAiInsights(profile);
  const suspended = isTenantReadOnly(profile);
  const [summaries, analyses, team] = await Promise.all([
    readBrokerPerformanceSummaries(),
    enterprise ? readBrokerManagerAnalyses() : Promise.resolve(undefined),
    enterprise ? readBrokerTeam() : Promise.resolve(undefined)
  ]);
  const members = team?.status === "success" ? team.data : [];

  return (
    <section aria-label="Assistance IA du tableau de bord">
      {notice && NOTICES[notice] ? (
        <Notice tone={SUCCESS_NOTICES.has(notice) ? "success" : notice === "error" ? "danger" : "warning"}>{NOTICES[notice]}</Notice>
      ) : null}

      <Card
        title="Résumé IA de performance"
        description="Synthèse rédigée à partir d'indicateurs agrégés de votre cabinet. Aucune donnée de prospect n'est transmise au modèle."
        actions={<Badge tone="info">{AI_INSIGHT_LABEL}</Badge>}
      >
        {canWrite ? (
          <TenantWriteGuard readOnly={suspended}>
            <RequestForm action={requestPerformanceSummaryAction} id="ai-summary-window" buttonLabel="Générer le résumé IA" returnTo={returnTo} />
          </TenantWriteGuard>
        ) : (
          <Badge tone="disabled">Lecture seule pour votre rôle</Badge>
        )}
        {summaries.status === "forbidden" ? (
          <Notice tone="danger">Accès refusé aux résumés IA : vérifiez le plan, la MFA et vos permissions.</Notice>
        ) : summaries.status === "error" ? (
          <Notice tone="warning">Les résumés IA n&apos;ont pas pu être chargés. Réessayez dans quelques instants.</Notice>
        ) : (
          <InsightList returnTo={returnTo} items={summaries.data} canWrite={canWrite} members={members} emptyLabel="Aucun résumé IA pour le moment." />
        )}
      </Card>

      {enterprise ? (
        <Card
          title="Assistant manager"
          description="Charge de travail et retards par conseiller. Les conseillers sont transmis au modèle sous forme de libellés neutres (C1, C2...)."
          actions={<Badge tone="info">{AI_INSIGHT_LABEL}</Badge>}
        >
          {canWrite ? (
            <TenantWriteGuard readOnly={suspended}>
              <RequestForm action={requestManagerAssistantAction} id="ai-manager-window" buttonLabel="Lancer l'assistant manager" returnTo={returnTo} />
            </TenantWriteGuard>
          ) : (
            <Badge tone="disabled">Lecture seule pour votre rôle</Badge>
          )}
          {analyses?.status === "forbidden" ? (
            <Notice tone="danger">Accès refusé à l&apos;assistant manager : vérifiez le plan, la MFA et vos permissions.</Notice>
          ) : analyses?.status === "error" ? (
            <Notice tone="warning">Les analyses n&apos;ont pas pu être chargées. Réessayez dans quelques instants.</Notice>
          ) : (
            <InsightList returnTo={returnTo} items={analyses?.data ?? []} canWrite={canWrite} members={members} emptyLabel="Aucune analyse manager pour le moment." />
          )}
        </Card>
      ) : null}
    </section>
  );
}

/**
 * Dashboard entry (DASH-B-009): reads the assistance status and the cabinet opt-out, then renders the panel.
 * Starter and roles without CRM read right make no API call at all; the panel itself stays the single
 * visibility decision (closed flag, opt-out, inactive assistance render nothing and read no insight).
 */
export async function AiInsightsDashboardSection({ profile, notice }: { profile: BackOfficeProfile; notice?: string | undefined }) {
  if (!aiInsightsPrefetchAllowed(profile)) return null;
  const [assistance, optOut] = await Promise.all([readBrokerAIAssistance(), readBrokerAiOptOut()]);
  return (
    <AiInsightsPanel
      profile={profile}
      assistance={assistance.status === "success" ? assistance.data : undefined}
      optedOut={optOut.status === "success" && optOut.data.optedOut}
      notice={notice}
      returnTo="/"
    />
  );
}
