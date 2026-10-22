/**
 * Lot 5 (spec 071) G-06 domain errors. The HTTP wiring maps them explicitly (404, 409) so the status
 * never depends on the wording of the message. Access refusals reuse `BillingAccessRefusedError`.
 */
export class PlanChangeNotFoundError extends Error {
  constructor(public readonly reason: string) {
    super(`Plan change request not found: ${reason}`);
    this.name = "PlanChangeNotFoundError";
  }
}

export class PlanChangeConflictError extends Error {
  constructor(public readonly reason: string) {
    super(`Plan change conflict: ${reason}`);
    this.name = "PlanChangeConflictError";
  }
}
