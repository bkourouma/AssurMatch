/**
 * Spec 060 domain errors. The HTTP wiring maps them explicitly (404, 409, 422) so the status never
 * depends on the wording of the message.
 */
export class InvoiceNotFoundError extends Error {
  constructor(public readonly reason: string) {
    super(`Invoice document not found: ${reason}`);
    this.name = "InvoiceNotFoundError";
  }
}

export class InvoiceConflictError extends Error {
  constructor(public readonly reason: string) {
    super(`Invoice conflict: ${reason}`);
    this.name = "InvoiceConflictError";
  }
}

export class InvoicingConfigurationError extends Error {
  constructor(public readonly reason: string) {
    super(`Invoicing configuration incomplete: ${reason}`);
    this.name = "InvoicingConfigurationError";
  }
}

export class InvoiceIntegrityError extends Error {
  constructor(public readonly reason: string) {
    super(`Invoice document integrity check failed: ${reason}`);
    this.name = "InvoiceIntegrityError";
  }
}
