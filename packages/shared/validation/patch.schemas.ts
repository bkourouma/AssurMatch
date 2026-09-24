import { z } from "zod";

type StripDefault<T extends z.core.$ZodType> = (T extends z.ZodDefault<infer Inner> ? Inner : T) & z.core.$ZodType;

type PatchShape<Shape extends z.core.$ZodShape> = { [K in keyof Shape]: z.ZodOptional<StripDefault<Shape[K]>> };

function stripDefault(schema: z.core.$ZodType): z.core.$ZodType {
  return schema instanceof z.ZodDefault ? stripDefault(schema.unwrap()) : schema;
}

/**
 * Builds a PATCH shaped schema out of a create schema.
 *
 * `ZodObject.partial()` only makes keys optional: any `.default()` declared on a
 * field survives, so an absent key still parses to its default and a partial
 * update silently rewrites state the caller never mentioned. This drops the
 * defaults first, so an absent key stays absent in the parse output and the
 * service can leave the stored value alone.
 *
 * Only the top level is rewritten. Nested objects that must accept partial
 * payloads are patched explicitly by the caller, so replace or merge semantics
 * stay a deliberate choice per field.
 */
export function toPatchSchema<Shape extends z.core.$ZodShape>(schema: z.ZodObject<Shape>): z.ZodObject<PatchShape<Shape>> {
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([key, field]) => [key, z.optional(stripDefault(field))])
  );
  return z.object(shape) as unknown as z.ZodObject<PatchShape<Shape>>;
}

type Defined<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

/**
 * Drops the keys whose value is `undefined`.
 *
 * A parsed patch is applied over stored state with `Object.assign` or a spread,
 * where an explicit `undefined` overwrites the stored value instead of leaving
 * it alone. Zod already omits absent optional keys, so this is belt and braces
 * against a caller that spells an omission as `{ name: undefined }`.
 */
export function pickDefined<T extends object>(patch: T | undefined): Defined<T> {
  const defined: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (value !== undefined) defined[key] = value;
  }
  return defined as Defined<T>;
}
