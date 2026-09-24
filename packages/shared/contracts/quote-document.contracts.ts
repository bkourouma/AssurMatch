import { z } from "zod";
import { dateTimeStringSchema, nonEmptyStringSchema, uuidSchema } from "../validation/common.schemas";

export const quoteDocumentKinds = ["identity", "vehicle_registration", "driving_license", "proof_of_address", "medical_form", "existing_policy", "other"] as const;
export const quoteDocumentKindSchema = z.enum(quoteDocumentKinds);
export const quoteDocumentScanStatusSchema = z.enum(["pending", "clean", "infected", "failed"]);
export const quoteDocumentStatusSchema = z.enum(["uploaded", "available", "quarantined", "removed"]);

/** Allow-listed MIME types for visitor uploads (PDF and common image formats). */
export const quoteDocumentMimeTypes = ["application/pdf", "image/jpeg", "image/png"] as const;
export const QUOTE_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
export const QUOTE_DOCUMENT_MAX_PER_REQUEST = 5;

export const quoteDocumentUploadMetadataSchema = z.object({
  label: z.string().trim().min(1).max(120),
  documentKind: quoteDocumentKindSchema.default("other")
});

export const quoteDocumentSchema = z.object({
  id: uuidSchema,
  label: nonEmptyStringSchema,
  documentKind: quoteDocumentKindSchema,
  fileName: nonEmptyStringSchema,
  mimeType: z.enum(quoteDocumentMimeTypes),
  sizeBytes: z.number().int().positive(),
  scanStatus: quoteDocumentScanStatusSchema,
  status: quoteDocumentStatusSchema,
  sharedWithBroker: z.boolean(),
  createdAt: dateTimeStringSchema,
  updatedAt: dateTimeStringSchema
});

export const quoteDocumentsResponseSchema = z.object({
  generatedAt: dateTimeStringSchema,
  publicReference: nonEmptyStringSchema,
  uploadEnabled: z.boolean(),
  remainingSlots: z.number().int().min(0),
  items: z.array(quoteDocumentSchema),
  total: z.number().int().min(0)
});

export const adminQuoteDocumentSchema = quoteDocumentSchema.extend({
  quoteRequestId: uuidSchema,
  checksum: nonEmptyStringSchema,
  scanEngine: z.string().nullable(),
  scanSignature: z.string().nullable(),
  retentionUntil: dateTimeStringSchema
});

export const adminQuoteDocumentsResponseSchema = z.object({
  generatedAt: dateTimeStringSchema,
  quoteRequestId: uuidSchema,
  items: z.array(adminQuoteDocumentSchema),
  total: z.number().int().min(0)
});

export type QuoteDocumentKind = z.output<typeof quoteDocumentKindSchema>;
export type QuoteDocumentScanStatus = z.output<typeof quoteDocumentScanStatusSchema>;
export type QuoteDocumentStatus = z.output<typeof quoteDocumentStatusSchema>;
export type QuoteDocumentMimeType = (typeof quoteDocumentMimeTypes)[number];
export type QuoteDocumentUploadMetadata = z.input<typeof quoteDocumentUploadMetadataSchema>;
export type QuoteDocument = z.output<typeof quoteDocumentSchema>;
export type QuoteDocumentsResponse = z.output<typeof quoteDocumentsResponseSchema>;
export type AdminQuoteDocument = z.output<typeof adminQuoteDocumentSchema>;
export type AdminQuoteDocumentsResponse = z.output<typeof adminQuoteDocumentsResponseSchema>;
