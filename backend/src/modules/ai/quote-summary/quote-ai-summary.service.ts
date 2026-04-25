import { AuditLogWriter } from "../../audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../../audit-logs/quote-audit-actions";
import { InMemoryQueue } from "../../common/queues/queues.module";
import type { ActorContext } from "../../common/types";
import type { QuoteRequestRecord } from "../../quote-requests/quote-submission.service";
import type { AIModuleConfig } from "../ai.module";
import { AISummaryFlagPolicy } from "./ai-summary-flag-policy";
import { QuoteAISummaryGuardrails } from "./quote-ai-summary-guardrails";

export interface QuoteAISummaryRecord {
  id: string;
  quoteRequestId: string;
  summaryReference?: string;
  guardrailResult: string;
  visibleToBroker: boolean;
  createdAt: Date;
}

export class QuoteAISummaryService {
  private readonly summaries: QuoteAISummaryRecord[] = [];
  private readonly policy = new AISummaryFlagPolicy();
  private readonly guardrails = new QuoteAISummaryGuardrails();

  constructor(
    private readonly queue: InMemoryQueue,
    private readonly audit: AuditLogWriter,
    private readonly moduleConfig: AIModuleConfig,
    private readonly flags: { globalFlags?: Partial<Record<string, boolean>>; countryFlags?: Partial<Record<string, boolean>>; productFlags?: Partial<Record<string, boolean>> } = {}
  ) {}

  async enqueueIfAllowed(quote: QuoteRequestRecord, actor: ActorContext): Promise<QuoteAISummaryRecord | undefined> {
    if (!this.policy.canRun({ ...this.flags, moduleConfig: this.moduleConfig })) {
      this.audit.write({
        actor,
        action: QuoteAuditActions.aiSummarySkipped,
        targetType: "QuoteRequest",
        targetId: quote.id,
        scope: { countryId: quote.countryId, productId: quote.productId },
        result: "refused",
        reason: "ai_disabled",
        context: {}
      });
      return undefined;
    }
    this.queue.add("ai-quote-summary", "ai_quote_summary", quote.id, actor.correlationId);
    this.audit.write({
      actor,
      action: QuoteAuditActions.aiSummaryQueued,
      targetType: "QuoteRequest",
      targetId: quote.id,
      scope: { countryId: quote.countryId, productId: quote.productId },
      result: "success",
      context: { minimizedInputReference: quote.id }
    });
    const output = `Assistance: demande ${quote.publicReference} pour traitement par un courtier partenaire.`;
    const guardrail = this.guardrails.evaluate(output);
    if (!guardrail.approved) {
      this.audit.write({
        actor,
        action: QuoteAuditActions.aiSummaryGuardrailRefused,
        targetType: "QuoteRequest",
        targetId: quote.id,
        result: "refused",
        reason: guardrail.reasons.join(","),
        context: {}
      });
      return undefined;
    }
    this.moduleConfig.modelCallCount += 1;
    const record: QuoteAISummaryRecord = {
      id: crypto.randomUUID(),
      quoteRequestId: quote.id,
      summaryReference: output,
      guardrailResult: "approved",
      visibleToBroker: true,
      createdAt: new Date()
    };
    this.summaries.push(record);
    this.audit.write({
      actor,
      action: QuoteAuditActions.aiSummaryGenerated,
      targetType: "QuoteAISummary",
      targetId: record.id,
      result: "success",
      context: { assistanceOnly: true }
    });
    return record;
  }

  list(): QuoteAISummaryRecord[] {
    return [...this.summaries];
  }
}
