/**
 * The environment object this codebase reads and mutates.
 *
 * `NodeJS.ProcessEnv` is augmented by the Next.js types that the public app pulls into the shared
 * TypeScript program: there, `NODE_ENV` is a required, read-only union of "development" |
 * "production" | "test". The platform legitimately runs under other values (`runtime-smoke`), and
 * several helpers take a partial environment and fill in defaults, so the augmented type does not
 * describe what these functions accept. This alias states what they really need: a mutable bag of
 * optional strings.
 */
export type ProcessEnvLike = Record<string, string | undefined>;
