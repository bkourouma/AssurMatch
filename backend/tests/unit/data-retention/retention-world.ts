import type { AiInteractionRecord } from "../../../src/modules/ai/core/ai-interactions.repository";
import type { QuoteAISummaryRecord } from "../../../src/modules/ai/quote-summary/quote-ai-summary.service";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import type { ContactMessageRecord } from "../../../src/modules/contact-messages/contact-messages.repository";
import { DataRetentionModule } from "../../../src/modules/data-retention/data-retention.module";
import type { LeadAssignmentRecord } from "../../../src/modules/leads/lead-assignment.service";
import { MemoryCrmActivityRepository } from "../../../src/modules/leads/crm-activity.repository";
import type { MessagingDeliveryRecord } from "../../../src/modules/notifications/messaging.repository";
import type { NotificationRecord } from "../../../src/modules/notifications/notifications.module";
import type { PartnerApplicationRecord } from "../../../src/modules/partner-applications/partner-applications.repository";
import type { PartnerWebhookDeliveryRecord } from "../../../src/modules/partner-integrations/partner-integrations.repository";
import { ProspectIdentityService } from "../../../src/modules/prospects/prospect-identity.service";
import type { ProspectRecord } from "../../../src/modules/prospects/prospects.service";
import { MemoryDocumentStorage } from "../../../src/modules/quote-documents/document-storage.port";
import type { QuoteDocumentRecord } from "../../../src/modules/quote-documents/quote-documents.repository";
import type { QuoteRequestRecord } from "../../../src/modules/quote-requests/quote-submission.service";
import type { WaitlistEntryRecord } from "../../../src/modules/waitlist/waitlist.repository";

/**
 * Spec 046 unit world: plain arrays standing for the memory repositories, wired into a
 * `DataRetentionModule` through its memory sources, with a controllable clock.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const NOW = new Date("2026-09-24T12:00:00.000Z");
export const CI = "00000000-0000-4000-8000-0000000000c1";
export const SN = "00000000-0000-4000-8000-0000000000c2";
export const PRODUCT = "00000000-0000-4000-8000-0000000000a1";
export const TENANT_A = "00000000-0000-4000-8000-0000000000b1";
export const TENANT_B = "00000000-0000-4000-8000-0000000000b2";

export const compliance: ActorContext = { actorId: "compliance-1", roles: ["compliance_admin"], mfaVerified: true, correlationId: "retention-test" };
export const secondCompliance: ActorContext = { actorId: "compliance-2", roles: ["compliance_admin"], mfaVerified: true };

export function daysAgo(days: number, from = NOW): Date {
  return new Date(from.getTime() - days * DAY_MS);
}

/** The domain records as the retention anonymizer sees them: plus `anonymizedAt` / `anonymizationBatchId`. */
export type Anonymizable<T> = T & { anonymizedAt?: Date | null; anonymizationBatchId?: string | null };

export interface ConsentRow {
  id: string;
  subjectReference: string;
  status: string;
  grantedAt: Date;
}

export function createRetentionWorld() {
  const audit = new AuditLogWriter();
  const identity = new ProspectIdentityService();
  const storage = new MemoryDocumentStorage();
  const crm = new MemoryCrmActivityRepository();
  const flags = new Map<string, boolean>();
  const clock = { now: NOW };
  const notices: Array<{ scopeId: string; template: string; title?: string; body: string; targetType?: string; targetId?: string }> = [];
  const data = {
    countries: [
      { id: CI, publicSince: daysAgo(900) as Date | null },
      { id: SN, publicSince: null as Date | null }
    ],
    prospects: [] as Array<Anonymizable<ProspectRecord>>,
    quoteRequests: [] as Array<Anonymizable<QuoteRequestRecord>>,
    documents: [] as Array<Anonymizable<QuoteDocumentRecord>>,
    assignments: [] as LeadAssignmentRecord[],
    history: [] as Array<{ leadAssignmentId: string; comment?: string }>,
    summaries: [] as Array<QuoteAISummaryRecord & { aiInteractionId?: string }>,
    aiInteractions: [] as AiInteractionRecord[],
    contactMessages: [] as Array<Anonymizable<ContactMessageRecord>>,
    partnerApplications: [] as Array<Anonymizable<PartnerApplicationRecord>>,
    waitlist: [] as Array<Anonymizable<WaitlistEntryRecord>>,
    webhooks: [] as PartnerWebhookDeliveryRecord[],
    notifications: [] as NotificationRecord[],
    deliveries: [] as MessagingDeliveryRecord[],
    consentRecords: [] as ConsentRow[]
  };

  const module = new DataRetentionModule({
    audit,
    identity,
    storage,
    featureFlags: { isEnabled: (key) => flags.get(key) === true },
    requireCountry: async (countryId) => {
      const country = data.countries.find((candidate) => candidate.id === countryId);
      if (!country) throw new Error(`Country ${countryId} not found`);
      return country;
    },
    inApp: {
      publishInApp: async (request) => {
        notices.push(request);
        return request;
      }
    },
    memorySources: {
      countries: async () => data.countries,
      prospects: async () => data.prospects,
      quoteRequests: async () => data.quoteRequests,
      quoteDocuments: async () => data.documents,
      leadAssignments: async () => data.assignments,
      leadHistory: async (leadAssignmentId) => data.history.filter((event) => event.leadAssignmentId === leadAssignmentId),
      crmActivity: crm,
      quoteAiSummaries: async () => data.summaries,
      aiInteractions: async () => data.aiInteractions,
      contactMessages: async () => data.contactMessages,
      partnerApplications: async () => data.partnerApplications,
      waitlistEntries: async () => data.waitlist,
      webhookDeliveries: async () => data.webhooks,
      notifications: async () => data.notifications,
      messagingDeliveries: async () => data.deliveries
    },
    clock: () => clock.now
  });

  function enablePurge(value = true): void {
    flags.set("retention_purge_enabled", value);
  }

  function addProspect(email: string, countryId = CI): Anonymizable<ProspectRecord> {
    const contact = identity.normalize({ displayName: "Ama Kouassi", email, phone: "+2250102030405" });
    const prospect: Anonymizable<ProspectRecord> = {
      id: crypto.randomUUID(),
      countryId,
      productId: PRODUCT,
      ...contact,
      consentRecordIds: [],
      retentionUntil: daysAgo(-3650),
      createdAt: daysAgo(1000),
      updatedAt: daysAgo(1000)
    };
    data.prospects.push(prospect);
    return prospect;
  }

  /** A quote request whose last update is `ageDays` old, with its consent record and optional leads. */
  async function addQuote(options: { prospect: Anonymizable<ProspectRecord>; ageDays: number; countryId?: string; tenants?: string[]; withDocument?: boolean; withAi?: boolean }) {
    const countryId = options.countryId ?? options.prospect.countryId;
    const consent: ConsentRow = { id: crypto.randomUUID(), subjectReference: `quote:${data.quoteRequests.length + 1}`, status: "granted", grantedAt: daysAgo(options.ageDays) };
    data.consentRecords.push(consent);
    options.prospect.consentRecordIds.push(consent.id);
    const quote: Anonymizable<QuoteRequestRecord> = {
      id: crypto.randomUUID(),
      publicReference: `AM-${String(data.quoteRequests.length + 1).padStart(6, "0")}`,
      verificationTokenHash: "token-hash",
      countryId,
      countryCode: countryId === CI ? "CI" : "SN",
      productId: PRODUCT,
      productKey: "auto",
      quoteFormDefinitionId: crypto.randomUUID(),
      prospectId: options.prospect.id,
      consentRecordId: consent.id,
      source: "public_web",
      payload: { contact: { email: options.prospect.emailNormalized, displayName: "Ama Kouassi" }, answers: { vehicle_use: "prive" } },
      status: "routed",
      duplicateStatus: "not_checked",
      routingStatus: "assigned",
      retentionUntil: daysAgo(-3650),
      createdAt: daysAgo(options.ageDays),
      updatedAt: daysAgo(options.ageDays)
    };
    data.quoteRequests.push(quote);

    const assignments: LeadAssignmentRecord[] = [];
    for (const partnerTenantId of options.tenants ?? []) {
      const assignment = {
        id: crypto.randomUUID(),
        quoteRequestId: quote.id,
        partnerTenantId,
        status: "contacted",
        assignedAt: daysAgo(options.ageDays),
        assignmentReason: "routing",
        contact: { email: options.prospect.emailNormalized },
        answers: { vehicle_use: "prive" },
        actionComment: "Client rappele a 18h, prefere WhatsApp",
        lastBrokerActionAt: daysAgo(options.ageDays),
        createdAt: daysAgo(options.ageDays),
        updatedAt: daysAgo(options.ageDays)
      } as LeadAssignmentRecord;
      data.assignments.push(assignment);
      assignments.push(assignment);
      data.history.push({ leadAssignmentId: assignment.id, comment: "Echange avec Ama au telephone" });
      const createdAt = daysAgo(options.ageDays).toISOString();
      await crm.addNote({ id: crypto.randomUUID(), leadAssignmentId: assignment.id, body: "Ama souhaite une franchise basse", createdAt });
      await crm.addTask({ id: crypto.randomUUID(), leadAssignmentId: assignment.id, title: "Rappeler Ama Kouassi", createdAt });
      await crm.addReminder({ id: crypto.randomUUID(), leadAssignmentId: assignment.id, remindAt: createdAt, message: "Relancer Ama", createdAt });
      await crm.addProposal({ id: crypto.randomUUID(), leadAssignmentId: assignment.id, reference: "PROP-1", amountIndicative: 120_000, currency: "XOF", notes: "Pour Ama", nonContractual: true, createdAt });
      await crm.addDispute({ id: crypto.randomUUID(), leadAssignmentId: assignment.id, reason: "duplicate", comment: "Ama deja cliente", status: "opened", createdAt });
      await crm.addDocument({ id: crypto.randomUUID(), leadAssignmentId: assignment.id, label: "Carte grise Ama", storageKey: "crm-key-1", visibility: "internal", createdAt });
    }

    let document: Anonymizable<QuoteDocumentRecord> | undefined;
    if (options.withDocument) {
      document = {
        id: crypto.randomUUID(),
        quoteRequestId: quote.id,
        prospectId: options.prospect.id,
        label: "Permis de Ama",
        documentKind: "driving_license",
        fileName: "permis-ama-kouassi.pdf",
        mimeType: "application/pdf",
        sizeBytes: 8,
        checksum: "sha256-abc",
        storageKey: `qd-${crypto.randomUUID()}`,
        scanStatus: "clean",
        scanEngine: "eicar-signature",
        scanSignature: null,
        scannedAt: daysAgo(options.ageDays),
        status: "available",
        sharedLeadAssignmentId: null,
        sharedAt: null,
        retentionUntil: daysAgo(-1825),
        createdAt: daysAgo(options.ageDays),
        updatedAt: daysAgo(options.ageDays)
      } as Anonymizable<QuoteDocumentRecord>;
      data.documents.push(document);
      await storage.put(document.storageKey, Buffer.from("%PDF-1.4"), "application/pdf");
    }

    let interaction: AiInteractionRecord | undefined;
    if (options.withAi) {
      interaction = aiInteraction({ targetType: "QuoteRequest", targetId: quote.id, countryId, occurredAt: daysAgo(options.ageDays) });
      data.aiInteractions.push(interaction);
      data.summaries.push({ id: crypto.randomUUID(), quoteRequestId: quote.id, aiInteractionId: interaction.id, summaryReference: "Ama, 34 ans, vehicule prive", guardrailResult: "approved", visibleToBroker: true, createdAt: daysAgo(options.ageDays) });
    }
    return { quote, consent, assignments, document, interaction };
  }

  function aiInteraction(overrides: Partial<AiInteractionRecord>): AiInteractionRecord {
    return {
      id: crypto.randomUUID(),
      moduleConfigId: "quote_summary",
      actorId: null,
      scope: {},
      minimizedInputReference: "minimized",
      outputReference: "output-ref",
      guardrailResult: "approved",
      humanValidationStatus: "not_required",
      occurredAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
      assistType: "quote_summary",
      surface: "admin_platform",
      status: "completed",
      provider: "template",
      model: null,
      fallback: false,
      promptHash: null,
      outputHash: null,
      outputText: "Ama Kouassi souhaite une assurance auto",
      outputData: { name: "Ama" },
      refusalReason: null,
      minimizationReport: { removed: ["email"] },
      inputTokens: null,
      outputTokens: null,
      latencyMs: null,
      targetType: null,
      targetId: null,
      partnerTenantId: null,
      countryId: CI,
      productId: PRODUCT,
      correlationId: null,
      completedAt: NOW,
      ...overrides
    } as AiInteractionRecord;
  }

  function addContactMessage(email: string, ageDays: number, countryId: string | undefined = CI): Anonymizable<ContactMessageRecord> {
    const message: Anonymizable<ContactMessageRecord> = {
      id: crypto.randomUUID(),
      publicReference: `CT-${data.contactMessages.length + 1}`,
      audience: "visitor",
      name: "Ama Kouassi",
      emailNormalized: email,
      emailFingerprint: identity.fingerprint(email),
      phone: "+2250102030405",
      ...(countryId ? { countryId } : {}),
      subject: "Question",
      message: "Bonjour, je suis Ama",
      consentVersion: "v1",
      status: "handled",
      ipHash: "ip-hash",
      retentionUntil: daysAgo(-365),
      createdAt: daysAgo(ageDays),
      updatedAt: daysAgo(ageDays)
    };
    data.contactMessages.push(message);
    return message;
  }

  function addWaitlistEntry(email: string, countryId: string, ageDays: number, retentionUntil = daysAgo(-1000)): Anonymizable<WaitlistEntryRecord> {
    const entry: Anonymizable<WaitlistEntryRecord> = {
      id: crypto.randomUUID(),
      countryId,
      emailNormalized: email,
      emailFingerprint: identity.fingerprint(email),
      consentVersion: "v1",
      status: "active",
      ipHash: "ip-hash",
      source: "public_web",
      retentionUntil,
      createdAt: daysAgo(ageDays),
      updatedAt: daysAgo(ageDays)
    };
    data.waitlist.push(entry);
    return entry;
  }

  function addPartnerApplication(email: string, status: PartnerApplicationRecord["status"], reviewedDaysAgo: number): Anonymizable<PartnerApplicationRecord> {
    const application: Anonymizable<PartnerApplicationRecord> = {
      id: crypto.randomUUID(),
      publicReference: `PA-${data.partnerApplications.length + 1}`,
      countryId: CI,
      legalName: "Cabinet Kouassi",
      licenseNumber: "LIC-123",
      licenseExpiresAt: daysAgo(-365),
      productIds: [PRODUCT],
      monthlyCapacity: 10,
      contactName: "Ama Kouassi",
      contactEmailNormalized: email,
      contactEmailFingerprint: identity.fingerprint(email),
      contactPhone: "+2250102030405",
      desiredPlan: "starter",
      message: "Nous voulons rejoindre",
      consentVersion: "v1",
      status,
      reviewedAt: daysAgo(reviewedDaysAgo),
      reviewNote: "Licence non verifiable",
      retentionUntil: daysAgo(-1000),
      createdAt: daysAgo(reviewedDaysAgo + 10),
      updatedAt: daysAgo(reviewedDaysAgo)
    };
    data.partnerApplications.push(application);
    return application;
  }

  return { audit, identity, storage, crm, flags, clock, notices, data, module, service: module.service, enablePurge, addProspect, addQuote, addContactMessage, addWaitlistEntry, addPartnerApplication, aiInteraction };
}

export type RetentionWorld = ReturnType<typeof createRetentionWorld>;
