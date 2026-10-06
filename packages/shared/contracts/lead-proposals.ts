import { z } from "zod";
import { dateTimeStringSchema } from "../validation/common.schemas";

/**
 * Spec 055: the broker's answer to the visitor (proposal) and the visitor's follow-up (response).
 * Shared by the API, the broker back-office and the public tracking space. A proposal always comes
 * from the named broker, is indicative and non-contractual, and is never compared, ranked or
 * recommended by AssurMatch.
 */

export const LEAD_PROPOSAL_MESSAGE_MAX = 2000;
export const LEAD_PROPOSAL_GUARANTEES_MAX = 20;
export const LEAD_PROPOSAL_GUARANTEE_MAX_LENGTH = 160;
/** FR edge case: more than 10 active proposals per lead is refused. */
export const LEAD_PROPOSAL_MAX_ACTIVE = 10;
export const LEAD_PROPOSAL_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
export const LEAD_PROPOSAL_DOCUMENT_MIME_TYPES = ["application/pdf"] as const;
/** Internal CRM documents (FR-010): same 5 MB limit, PDF or image. */
export const LEAD_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
export const LEAD_DOCUMENT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export const VISITOR_RESPONSE_CALLBACK_SLOT_MAX = 100;
export const VISITOR_RESPONSE_QUESTION_MAX = 500;

/** FR-004: mention carried by every proposal, in the language of the reader. */
export const LEAD_PROPOSAL_NON_CONTRACTUAL_NOTICE = {
  fr: "Proposition indicative non contractuelle, à confirmer par le courtier",
  en: "Indicative, non-contractual proposal, to be confirmed by the broker"
} as const;

/** Persisted statuses; `expired` is computed from `validUntil` and never stored. */
export const LEAD_PROPOSAL_STORED_STATUSES = ["sent", "viewed", "responded", "withdrawn"] as const;
/** FR-003: statuses the broker sees. */
export const LEAD_PROPOSAL_STATUSES = ["sent", "viewed", "responded", "withdrawn", "expired"] as const;
/**
 * Statuses the visitor sees. A withdrawn proposal is never shown; `closed` marks the proposal of a
 * broker the request was taken from (reassignment) or of a lead closed since: no response possible.
 */
export const PUBLIC_PROPOSAL_STATUSES = ["sent", "viewed", "responded", "expired", "closed"] as const;
export const VISITOR_RESPONSE_TYPES = ["interested", "declined", "question"] as const;
export const VISITOR_DECLINE_REASONS = ["price", "guarantees", "delay", "already_insured", "other"] as const;
/** Why the broker cannot send a proposal right now (list endpoint, UI hints). */
export const LEAD_PROPOSAL_BLOCKERS = ["not_accepted", "lead_closed", "consent_withdrawn", "limit_reached"] as const;

export const leadProposalStatusSchema = z.enum(LEAD_PROPOSAL_STATUSES);
export const publicProposalStatusSchema = z.enum(PUBLIC_PROPOSAL_STATUSES);
export const visitorResponseTypeSchema = z.enum(VISITOR_RESPONSE_TYPES);
export const visitorDeclineReasonSchema = z.enum(VISITOR_DECLINE_REASONS);
export const leadProposalBlockerSchema = z.enum(LEAD_PROPOSAL_BLOCKERS);

export type LeadProposalStatus = z.output<typeof leadProposalStatusSchema>;
export type PublicProposalStatus = z.output<typeof publicProposalStatusSchema>;
export type VisitorResponseType = z.output<typeof visitorResponseTypeSchema>;
export type VisitorDeclineReason = z.output<typeof visitorDeclineReasonSchema>;
export type LeadProposalBlocker = z.output<typeof leadProposalBlockerSchema>;

const amountSchema = z.coerce.number().nonnegative().max(1_000_000_000_000);

/**
 * `POST /broker/{starter|crm}/leads/:leadId/proposals` (JSON body, or multipart with a `payload`
 * JSON field and an optional `file` PDF). The forbidden-wording guard runs in the service so the
 * refusal names the wording (`FORBIDDEN_WORDING`).
 */
export const leadProposalCreateSchema = z.object({
  message: z.string().trim().min(1).max(LEAD_PROPOSAL_MESSAGE_MAX),
  priceMin: amountSchema.optional(),
  priceMax: amountSchema.optional(),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "currency must be an ISO 4217 code").transform((value) => value.toUpperCase()).default("XOF"),
  guarantees: z.array(z.string().trim().min(1).max(LEAD_PROPOSAL_GUARANTEE_MAX_LENGTH)).max(LEAD_PROPOSAL_GUARANTEES_MAX).default([]),
  validUntil: dateTimeStringSchema
}).strict().superRefine((value, ctx) => {
  if (value.priceMin === undefined && value.priceMax === undefined) {
    ctx.addIssue({ code: "custom", path: ["priceMin"], message: "an indicative premium or range is required" });
  }
  if (value.priceMin !== undefined && value.priceMax !== undefined && value.priceMin > value.priceMax) {
    ctx.addIssue({ code: "custom", path: ["priceMax"], message: "priceMin must not exceed priceMax" });
  }
  if (new Date(value.validUntil).getTime() <= Date.now()) {
    ctx.addIssue({ code: "custom", path: ["validUntil"], message: "validUntil must be in the future" });
  }
});

export const leadProposalWithdrawSchema = z.object({ reason: z.string().trim().max(500).optional() }).strict();

const optionalText = (max: number) => z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), z.string().trim().max(max).optional());

/** `POST /quote-requests/:publicReference/proposals/:proposalId/responses?token=` */
export const visitorProposalResponseCreateSchema = z.object({
  type: visitorResponseTypeSchema,
  callbackSlot: optionalText(VISITOR_RESPONSE_CALLBACK_SLOT_MAX),
  declineReason: z.preprocess((value) => (value === "" ? undefined : value), visitorDeclineReasonSchema.optional()),
  question: optionalText(VISITOR_RESPONSE_QUESTION_MAX)
}).strict().superRefine((value, ctx) => {
  if (value.type !== "interested" && value.callbackSlot) ctx.addIssue({ code: "custom", path: ["callbackSlot"], message: "callbackSlot only goes with interested" });
  if (value.type !== "declined" && value.declineReason) ctx.addIssue({ code: "custom", path: ["declineReason"], message: "declineReason only goes with declined" });
  if (value.type === "question" && !value.question) ctx.addIssue({ code: "custom", path: ["question"], message: "question is required" });
  if (value.type !== "question" && value.question) ctx.addIssue({ code: "custom", path: ["question"], message: "question only goes with type question" });
});

export type LeadProposalCreateRequest = z.input<typeof leadProposalCreateSchema>;
export type LeadProposalCreate = z.output<typeof leadProposalCreateSchema>;
export type VisitorProposalResponseCreateRequest = z.input<typeof visitorProposalResponseCreateSchema>;
export type VisitorProposalResponseCreate = z.output<typeof visitorProposalResponseCreateSchema>;

// ---------------------------------------------------------------------------------------------
// Visitor view (tracking space, `GET /quote-requests/:publicReference?token=` -> `proposals`)
// ---------------------------------------------------------------------------------------------

export const publicVisitorResponseSchema = z.object({
  type: visitorResponseTypeSchema,
  callbackSlot: z.string().optional(),
  declineReason: visitorDeclineReasonSchema.optional(),
  question: z.string().optional(),
  at: z.string()
});

export const publicLeadProposalSchema = z.object({
  id: z.string(),
  partnerName: z.string(),
  message: z.string(),
  priceMin: z.number().optional(),
  priceMax: z.number().optional(),
  currency: z.string(),
  guarantees: z.array(z.string()),
  validUntil: z.string(),
  hasDocument: z.boolean(),
  status: publicProposalStatusSchema,
  sentAt: z.string(),
  nonContractualNotice: z.string(),
  /** False once expired, closed (reassignment, closed lead) or after a consent withdrawal. */
  canRespond: z.boolean(),
  /** Latest response only (US3-4: the last one prevails; every response is kept in history). */
  visitorResponse: publicVisitorResponseSchema.optional()
});

/** Body of `POST .../proposals/:proposalId/responses` on success. */
export const visitorProposalResponseResultSchema = z.object({
  recorded: z.literal(true),
  proposalId: z.string(),
  type: visitorResponseTypeSchema,
  at: z.string()
});

export type PublicVisitorResponse = z.output<typeof publicVisitorResponseSchema>;
export type PublicLeadProposal = z.output<typeof publicLeadProposalSchema>;
export type VisitorProposalResponseResult = z.output<typeof visitorProposalResponseResultSchema>;

// ---------------------------------------------------------------------------------------------
// Broker view (`GET /broker/{starter|crm}/leads/:leadId/proposals`)
// ---------------------------------------------------------------------------------------------

export const brokerLeadProposalResponseSchema = z.object({
  id: z.string(),
  type: visitorResponseTypeSchema,
  callbackSlot: z.string().optional(),
  declineReason: visitorDeclineReasonSchema.optional(),
  question: z.string().optional(),
  createdAt: z.string()
});

export const brokerLeadProposalSchema = z.object({
  id: z.string(),
  leadAssignmentId: z.string(),
  status: leadProposalStatusSchema,
  message: z.string(),
  priceMin: z.number().optional(),
  priceMax: z.number().optional(),
  currency: z.string(),
  guarantees: z.array(z.string()),
  validUntil: z.string(),
  document: z.object({ fileName: z.string(), mimeType: z.string(), sizeBytes: z.number().int() }).optional(),
  sentAt: z.string(),
  viewedAt: z.string().optional(),
  respondedAt: z.string().optional(),
  withdrawnAt: z.string().optional(),
  withdrawReason: z.string().optional(),
  authorId: z.string().optional(),
  nonContractualNotice: z.string(),
  responses: z.array(brokerLeadProposalResponseSchema)
});

export const brokerLeadProposalListSchema = z.object({
  items: z.array(brokerLeadProposalSchema),
  activeCount: z.number().int().nonnegative(),
  maxActive: z.number().int().positive(),
  canSend: z.boolean(),
  blockers: z.array(leadProposalBlockerSchema),
  /**
   * FR-007: the visitor's answer never moves the CRM status; the portal only suggests the next one
   * (CRM plans only, absent when nothing is suggested).
   */
  suggestedNextStatus: z.string().optional()
});

export type BrokerLeadProposalResponse = z.output<typeof brokerLeadProposalResponseSchema>;
export type BrokerLeadProposal = z.output<typeof brokerLeadProposalSchema>;
export type BrokerLeadProposalList = z.output<typeof brokerLeadProposalListSchema>;

/** Internal CRM document upload (multipart `file` + `label`). */
export const leadDocumentUploadSchema = z.object({ label: z.string().trim().min(1).max(120) });
