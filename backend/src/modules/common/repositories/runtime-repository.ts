export type RuntimeRepositoryMode = "memory-test" | "prisma-runtime";

export interface RuntimeRepository {
  readonly mode: RuntimeRepositoryMode;
}

export function assertRuntimeRepository(mode: RuntimeRepositoryMode, context: string): void {
  if (process.env.NODE_ENV !== "test" && mode === "memory-test") {
    throw new Error(`${context} memory repository is test-only`);
  }
}

export function assertRuntimeRepositories(repositories: Record<string, RuntimeRepository>): void {
  for (const [context, repository] of Object.entries(repositories)) {
    assertRuntimeRepository(repository.mode, context);
  }
}

export function isRuntimeMemoryAllowed(): boolean {
  return process.env.NODE_ENV === "test";
}
