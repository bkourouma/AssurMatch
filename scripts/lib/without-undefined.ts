/**
 * Object type with every key that may hold `undefined` made optional and
 * narrowed, and every other key left untouched.
 */
export type WithoutUndefined<T extends object> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K];
} & {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined>;
};

/**
 * Returns a shallow copy of `value` without the keys whose value is `undefined`.
 *
 * Prisma already treats an explicit `undefined` exactly like an absent key, so
 * this does not change what is written. It only produces an object that the
 * generated Prisma input types accept under `exactOptionalPropertyTypes`.
 */
export function withoutUndefined<T extends object>(value: T): WithoutUndefined<T> {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) result[key] = entry;
  }
  return result as WithoutUndefined<T>;
}
