export type RuntimeRepositoryMode = "memory-test" | "prisma-runtime";

export interface RuntimeRepository {
  readonly mode: RuntimeRepositoryMode;
}

export function assertRuntimeRepository(mode: RuntimeRepositoryMode, context: string): void {
  if (process.env.NODE_ENV !== "test" && mode === "memory-test") {
    throw new Error(`${context} memory repository is test-only`);
  }
}
