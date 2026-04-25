export interface WorkDeclaration {
  publicEndpoint: boolean;
  heavySynchronousWork: boolean;
}

export function assertNoHeavyPublicSynchronousWork(work: WorkDeclaration): void {
  if (work.publicEndpoint && work.heavySynchronousWork) {
    throw new Error("Public endpoints must not run heavy synchronous work");
  }
}
