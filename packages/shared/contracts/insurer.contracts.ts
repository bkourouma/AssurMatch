import { z } from "zod";
import { dateTimeStringSchema, nonEmptyStringSchema, reasonSchema, uuidSchema } from "../validation/common.schemas";
import { findForbiddenWording } from "./content-safety";

/**
 * Spec 070 (PRD section 8): the insurer referential, per country. An offer links to an insurer
 * optionally (`insurerId`); `insurerName` stays the displayed, denormalised name.
 */

export const insurerStatusSchema = z.enum(["active", "suspended", "retired"]);
export type InsurerStatus = z.output<typeof insurerStatusSchema>;

/** Kebab-case or alphanumeric short code, unique within a country and immutable. */
export const insurerCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "code must be kebab-case or alphanumeric");

const insurerNameSchema = nonEmptyStringSchema.max(120);
const approvalNumberSchema = z.string().trim().max(60);

function refineInsurerText(value: { name?: string | undefined; approvalNumber?: string | undefined }, ctx: z.RefinementCtx): void {
  const forbidden = findForbiddenWording([value.name, value.approvalNumber].filter(Boolean).join(" "));
  if (forbidden.length > 0) ctx.addIssue({ code: "custom", message: `Forbidden regulated wording: ${forbidden.join(", ")}` });
}

/** POST /admin/insurers */
export const insurerCreateSchema = z.object({
  countryId: uuidSchema,
  name: insurerNameSchema,
  code: insurerCodeSchema,
  approvalNumber: approvalNumberSchema.optional(),
  reason: reasonSchema
}).strict().superRefine(refineInsurerText);

/** PATCH /admin/insurers/:id (the code and the country never change). An empty `approvalNumber` clears it. */
export const insurerUpdateSchema = z.object({
  name: insurerNameSchema,
  approvalNumber: approvalNumberSchema.optional(),
  status: insurerStatusSchema,
  expectedUpdatedAt: dateTimeStringSchema,
  reason: reasonSchema
}).strict().superRefine(refineInsurerText);

/** POST /admin/insurers/:id/retire */
export const insurerRetireSchema = z.object({ reason: reasonSchema }).strict();

export const insurerListQuerySchema = z.object({
  countryId: uuidSchema.optional(),
  status: insurerStatusSchema.optional()
});

/** GET /broker/insurers?countryId= (choice list for the offer form). */
export const insurerChoiceQuerySchema = z.object({ countryId: uuidSchema });

export type InsurerCreateDto = z.input<typeof insurerCreateSchema>;
export type InsurerUpdateDto = z.input<typeof insurerUpdateSchema>;
export type InsurerRetireDto = z.input<typeof insurerRetireSchema>;
export type InsurerListQuery = z.output<typeof insurerListQuerySchema>;

/** Admin view; dates are ISO strings. `concurrencyToken` is sent back as `expectedUpdatedAt`. */
export interface AdminInsurerView {
  id: string;
  countryId: string;
  name: string;
  code: string;
  approvalNumber?: string;
  status: InsurerStatus;
  concurrencyToken: string;
  createdAt: string;
  updatedAt: string;
}

/** Light view for the choice lists (active insurers only). */
export interface InsurerChoice {
  id: string;
  name: string;
  code: string;
  countryId: string;
}
