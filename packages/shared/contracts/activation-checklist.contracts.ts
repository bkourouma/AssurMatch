import { z } from "zod";
import { dateTimeStringSchema, isoCountrySchema, nonEmptyStringSchema, reasonSchema, uuidSchema } from "../validation/common.schemas";

export const activationChecklistQuerySchema = z.object({
  country: isoCountrySchema.optional(),
  product: nonEmptyStringSchema.optional(),
  partnerId: uuidSchema.optional()
});

export const activationChecklistStatusSchema = z.enum(["passed", "warning", "blocked"]);

/** Spec 070 PRD 35/36: attestations are recorded for a country or for a product. */
export const activationAttestationScopeTypeSchema = z.enum(["country", "product"]);

export const activationAttestationScopeSchema = z.object({
  scopeType: activationAttestationScopeTypeSchema,
  scopeId: uuidSchema
});

/** What the UI attests for a manual control: the scope plus the control key (the control's own key). */
export const activationChecklistAttestationTargetSchema = activationAttestationScopeSchema.extend({
  controlKey: nonEmptyStringSchema
});

export const activationChecklistAttestationSchema = z.object({
  attestedById: nonEmptyStringSchema,
  attestedAt: dateTimeStringSchema,
  note: nonEmptyStringSchema
});

export const activationChecklistControlSchema = z.object({
  key: nonEmptyStringSchema,
  label: nonEmptyStringSchema,
  status: activationChecklistStatusSchema,
  evidence: nonEmptyStringSchema,
  blocking: z.boolean(),
  /** Spec 070: true for a control that a compliance admin attests by hand (no automatic computation). */
  manual: z.boolean().optional(),
  /** Spec 070: where the attestation of a manual control is recorded (absent on automatic controls). */
  attestationTarget: activationChecklistAttestationTargetSchema.optional(),
  /** Spec 070: the active attestation behind a passed manual control (author, date, note). */
  attestation: activationChecklistAttestationSchema.optional()
});

export const activationChecklistScopeSchema = z.object({
  countryId: uuidSchema.nullable(),
  countryCode: isoCountrySchema.nullable(),
  productId: uuidSchema.nullable(),
  productKey: nonEmptyStringSchema.nullable(),
  partnerId: uuidSchema.nullable()
});

export const activationChecklistSectionSchema = z.object({
  key: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  status: activationChecklistStatusSchema,
  scope: activationChecklistScopeSchema,
  controls: z.array(activationChecklistControlSchema)
});

export const activationChecklistResponseSchema = z.object({
  generatedAt: dateTimeStringSchema,
  summary: z.object({
    passed: z.number().int().min(0),
    warning: z.number().int().min(0),
    blocked: z.number().int().min(0)
  }),
  sections: z.array(activationChecklistSectionSchema)
});

/**
 * Spec 070 PRD 35/36: manual controls (attestations) per scope type. Only these keys can be attested.
 * `minNoteLength`: the note must reference the evidence (document or link), never personal data.
 * Labels are French without accents, like the other checklist labels.
 */
export const ACTIVATION_ATTESTABLE_CONTROLS = {
  country: {
    country_notifications_tested: { label: "Notifications testees", minNoteLength: 10 },
    country_support_ready: { label: "Support pret a traiter les demandes", minNoteLength: 10 },
    country_deactivation_plan: { label: "Plan de desactivation rapide documente", minNoteLength: 30 },
    country_ai_decision_explicit: { label: "Decision explicite sur les modules IA autorises", minNoteLength: 10 }
  },
  product: {
    product_routing_tested: { label: "Routage teste pour ce produit", minNoteLength: 10 },
    product_user_journey_tested: { label: "Parcours utilisateur teste", minNoteLength: 10 },
    product_ai_guardrails_configured: { label: "Garde-fous IA configures", minNoteLength: 10 },
    product_dashboard_metrics: { label: "Indicateurs de tableau de bord definis", minNoteLength: 10 }
  }
} as const;

export const ACTIVATION_ATTESTATION_NOTE_MAX_LENGTH = 1000;

export const activationAttestationRecordSchema = activationAttestationScopeSchema.extend({
  controlKey: nonEmptyStringSchema,
  note: nonEmptyStringSchema,
  attestedById: nonEmptyStringSchema,
  attestedAt: dateTimeStringSchema,
  revokedById: nonEmptyStringSchema.nullable(),
  revokedAt: dateTimeStringSchema.nullable()
});

export const activationAttestationListQuerySchema = activationAttestationScopeSchema;

export const activationAttestationCreateSchema = activationAttestationScopeSchema.extend({
  controlKey: nonEmptyStringSchema,
  note: z.string().trim().min(10).max(ACTIVATION_ATTESTATION_NOTE_MAX_LENGTH)
});

export const activationAttestationRevokeSchema = activationAttestationScopeSchema.extend({
  controlKey: nonEmptyStringSchema,
  reason: reasonSchema
});

export const activationAttestationListResponseSchema = z.object({
  scopeType: activationAttestationScopeTypeSchema,
  scopeId: uuidSchema,
  attestations: z.array(activationAttestationRecordSchema)
});

export type ActivationChecklistQuery = z.infer<typeof activationChecklistQuerySchema>;
export type ActivationChecklistStatus = z.infer<typeof activationChecklistStatusSchema>;
export type ActivationChecklistControl = z.infer<typeof activationChecklistControlSchema>;
export type ActivationChecklistSection = z.infer<typeof activationChecklistSectionSchema>;
export type ActivationChecklistResponse = z.infer<typeof activationChecklistResponseSchema>;
export type ActivationAttestationScopeType = z.infer<typeof activationAttestationScopeTypeSchema>;
export type ActivationAttestationScope = z.infer<typeof activationAttestationScopeSchema>;
export type ActivationAttestationRecord = z.infer<typeof activationAttestationRecordSchema>;
export type ActivationAttestationCreateDto = z.input<typeof activationAttestationCreateSchema>;
export type ActivationAttestationRevokeDto = z.input<typeof activationAttestationRevokeSchema>;
export type ActivationAttestationListResponse = z.infer<typeof activationAttestationListResponseSchema>;
