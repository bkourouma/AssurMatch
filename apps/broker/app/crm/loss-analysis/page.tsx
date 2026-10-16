import { redirect } from "next/navigation";
import { isStarterCrmDenied, loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { readBrokerAIAssistance, readBrokerAiOptOut, readLossAnalyses } from "../../lib/broker-api";
import type { BrokerAiInteraction } from "../../lib/broker-api";
import { TENANT_SUSPENDED_MESSAGE, canRequestLossAnalysis, isTenantReadOnly } from "../../lib/broker-permissions";
import { requestLossAnalysisAction, validateLossAnalysisAction } from "../../lib/loss-analysis-actions";
import { Badge, Button, Card, Cluster, Notice, PageHeader, PageStack, Stack, TenantWriteGuard } from "../../lib/ui/broker-ui";
import { formatDate } from "../../lib/ui/broker-view-models";

/**
 * Spec 064 FR-003: « Analyse des pertes » (assistance IA, Enterprise). The page reads the tenant's
 * recent analyses and lets a broker with CRM access request one and validate the result. The API
 * stays the authority (plan, flags, partner opt-out, quota, CRM permission, tenant, audit); the page
 * only reflects it: when the assistance is unavailable the card stays visible with a disabled button
 * and the reason, instead of hiding the feature. An analysis is indicative and never decides anything.
 */
const BREADCRUMB = [{ label: "CRM", href: "/crm" }, { label: "Analyse des pertes" }];
const PAGE_PATH = "/crm/loss-analysis";
const LOSS_ANALYSIS_ASSIST_TYPE = "loss_analysis";

const NOTICES: Record<string, string> = {
  queued: "Analyse demandée. Rechargez la page dans quelques secondes pour la consulter.",
  validated: "Décision de validation humaine enregistrée et auditée.",
  quota: "Quota quotidien d'assistance IA atteint pour votre cabinet.",
  disabled: "Assistance IA indisponible pour l'analyse des pertes (fonctionnalité fermée, opt-out du cabinet ou plan).",
  forbidden: "Action refusée par vos permissions CRM.",
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

const VALIDATION_LABELS: Record<BrokerAiInteraction["humanValidationStatus"], string> = {
  not_required: "Validation non requise",
  pending: "À valider",
  approved: "Validée",
  rejected: "Écartée"
};

function statusTone(status: BrokerAiInteraction["status"]): "success" | "warning" | "info" {
  if (status === "completed") return "success";
  if (status === "refused" || status === "failed") return "warning";
  return "info";
}

/** Explains, in words, why the request button is disabled. Empty when the assistance is available. */
function unavailableReason(args: {
  assistanceOk: boolean;
  enabled: boolean;
  hasLossAnalysisType: boolean;
  optedOut: boolean;
}): string | undefined {
  if (args.optedOut) return "Le cabinet a refusé l'assistance IA (opt-out). Le propriétaire peut la réactiver depuis le pipeline CRM.";
  if (!args.assistanceOk) return "L'état de l'assistance IA n'a pas pu être lu. Réessayez dans quelques instants.";
  if (!args.enabled) return "L'assistance IA est désactivée pour le moment (fonctionnalité fermée par AssurMatch).";
  if (!args.hasLossAnalysisType) return "L'analyse des pertes n'est pas disponible pour votre cabinet (plan ou périmètre).";
  return undefined;
}

export default async function BrokerLossAnalysisPage({ searchParams }: { searchParams: Promise<{ ai?: string }> }) {
  const { ai: aiNotice } = await searchParams;
  const session = await readBackOfficeSession();
  if (session.status !== "authenticated") {
    if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect(PAGE_PATH, session.error ?? "session_required"));
    if (session.status === "mfa_required") redirect(loginRedirect(PAGE_PATH, "mfa_required"));
    if (session.status === "forbidden") {
      return (
        <PageStack>
          <PageHeader
            breadcrumb={BREADCRUMB}
            kicker="CRM"
            title="Accès CRM refusé"
            description="L'analyse des pertes exige un courtier authentifié, la MFA vérifiée et les permissions CRM."
          />
        </PageStack>
      );
    }
    return <Notice tone="warning">Analyse des pertes indisponible : {session.error ?? "erreur inconnue"}.</Notice>;
  }

  const { profile } = session;
  if (isStarterCrmDenied(profile)) {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={BREADCRUMB}
          kicker="CRM"
          title="CRM complet indisponible"
          description="Le portail Starter reste centré sur les leads reçus et leurs actions autorisées."
          actions={<Badge tone="disabled">Module indisponible</Badge>}
        />
        <Notice tone="info" title="Plan Starter">
          Le CRM complet est disponible avec le plan Pro. L&apos;analyse des pertes est réservée au plan Enterprise.
        </Notice>
      </PageStack>
    );
  }
  if (profile.partnerPlan !== "enterprise") {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={BREADCRUMB}
          kicker="Assistance IA"
          title="Analyse des pertes réservée au plan Enterprise"
          description="L'analyse des motifs de perte fait partie des options du plan Enterprise."
          actions={<Badge tone="disabled">Plan Enterprise requis</Badge>}
        />
        <Notice tone="info">Votre plan actuel donne accès au CRM selon vos permissions, sans l&apos;analyse des pertes.</Notice>
      </PageStack>
    );
  }

  const suspended = isTenantReadOnly(profile);
  // The suspension is shown by TenantWriteGuard (disabled fieldset); the role rule is evaluated without it.
  const roleMayAct = canRequestLossAnalysis({ ...profile, tenantReadOnly: false, partnerTenantStatus: "active" });

  const [assistance, optOut, analyses] = await Promise.all([readBrokerAIAssistance(), readBrokerAiOptOut(), readLossAnalyses()]);
  if (analyses.unauthenticated) redirect(loginRedirect(PAGE_PATH, analyses.error ?? "session_required"));

  const assistanceOk = assistance.status === "success";
  const reason = unavailableReason({
    assistanceOk,
    enabled: assistanceOk && assistance.data.enabled,
    hasLossAnalysisType: assistanceOk && assistance.data.availableAssistTypes.includes(LOSS_ANALYSIS_ASSIST_TYPE),
    optedOut: optOut.status === "success" && optOut.data.optedOut
  });
  const items = analyses.status === "success" ? analyses.data : [];

  return (
    <PageStack>
      <PageHeader
        breadcrumb={BREADCRUMB}
        kicker="Assistance IA"
        title="Analyse des pertes"
        description="Regroupe les motifs des leads perdus sur les 90 derniers jours. Résultat indicatif, à valider par un humain : aucune donnée de contact n'est transmise et aucune décision n'est prise automatiquement."
        actions={<Badge tone="info">Assistance IA</Badge>}
      />

      {aiNotice && NOTICES[aiNotice] ? (
        <Notice tone={SUCCESS_NOTICES.has(aiNotice) ? "success" : aiNotice === "error" ? "danger" : "warning"}>{NOTICES[aiNotice]}</Notice>
      ) : null}

      <Card title="Lancer une analyse" description="L'analyse est préparée en arrière-plan, puis proposée à votre validation.">
        {reason ? (
          <Notice tone="warning" title="Assistance IA indisponible">{reason}</Notice>
        ) : null}
        {roleMayAct ? (
          <TenantWriteGuard readOnly={suspended}>
            <form action={requestLossAnalysisAction}>
              <Cluster>
                <Button type="submit" variant="secondary" disabled={reason !== undefined || suspended}>
                  Lancer l&apos;analyse des pertes
                </Button>
                {suspended ? <Badge tone="disabled">Compte suspendu : consultation seule</Badge> : null}
              </Cluster>
            </form>
          </TenantWriteGuard>
        ) : (
          <Cluster>
            <Button type="button" variant="secondary" disabled>Lancer l&apos;analyse des pertes</Button>
            <Badge tone="disabled">Lecture seule pour votre rôle</Badge>
          </Cluster>
        )}
        <p>Le contenu produit est une aide à la lecture. Le courtier valide ou écarte chaque analyse ; rien n&apos;est modifié sur vos leads.</p>
      </Card>

      <Card title="Analyses récentes" description="Les 10 dernières analyses de votre cabinet, de la plus récente à la plus ancienne.">
        {analyses.status === "forbidden" ? (
          <Notice tone="danger">Accès refusé aux analyses : vérifiez le plan, la MFA et vos permissions CRM.</Notice>
        ) : analyses.status === "error" ? (
          <Notice tone="warning">Les analyses n&apos;ont pas pu être chargées. Réessayez dans quelques instants.</Notice>
        ) : items.length === 0 ? (
          <p>Aucune analyse des pertes pour le moment.</p>
        ) : (
          <Stack>
            {items.map((interaction) => (
              <Card key={interaction.id} muted>
                <Cluster>
                  <strong>Analyse du {formatDate(interaction.createdAt)}</strong>
                  <Badge tone={statusTone(interaction.status)}>{STATUS_LABELS[interaction.status] ?? interaction.status}</Badge>
                  {interaction.fallback ? <Badge tone="neutral">mode simplifié</Badge> : null}
                  {interaction.humanValidationStatus !== "not_required" ? (
                    <Badge tone={interaction.humanValidationStatus === "pending" ? "warning" : "info"}>
                      {VALIDATION_LABELS[interaction.humanValidationStatus] ?? interaction.humanValidationStatus}
                    </Badge>
                  ) : null}
                </Cluster>
                {interaction.status === "completed" && interaction.outputText ? <p>{interaction.outputText}</p> : null}
                {interaction.status === "queued" ? <p>Analyse en cours de préparation.</p> : null}
                {interaction.status === "refused" ? (
                  <p>Analyse retenue par les garde-fous ou assistance désactivée ({interaction.refusalReason ?? "refus"}).</p>
                ) : null}
                {interaction.status === "failed" ? <p>L&apos;analyse n&apos;a pas abouti. Vous pouvez en relancer une.</p> : null}
                {interaction.status === "completed" && interaction.disclaimer ? <p>{interaction.disclaimer}</p> : null}
                {interaction.status === "completed" && interaction.humanValidationStatus === "pending" && roleMayAct ? (
                  <TenantWriteGuard readOnly={suspended}>
                    <Cluster>
                      {(["approved", "rejected"] as const).map((decision) => (
                        <form key={decision} action={validateLossAnalysisAction}>
                          <input type="hidden" name="interactionId" value={interaction.id} />
                          <input type="hidden" name="decision" value={decision} />
                          <Button type="submit" variant="secondary" size="sm">
                            {decision === "approved" ? "Valider l'analyse" : "Écarter l'analyse"}
                          </Button>
                        </form>
                      ))}
                    </Cluster>
                  </TenantWriteGuard>
                ) : null}
              </Card>
            ))}
          </Stack>
        )}
      </Card>
    </PageStack>
  );
}
