import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { QuoteRequestRecord } from "./quote-submission.service";

export const QUOTE_REQUESTS_REPOSITORY = Symbol("QUOTE_REQUESTS_REPOSITORY");

export interface QuoteRequestsRepository extends RuntimeRepository {
  create(quote: QuoteRequestRecord): QuoteRequestRecord;
  update(id: string, update: Partial<QuoteRequestRecord>): QuoteRequestRecord;
  findByPublicReference(publicReference: string): QuoteRequestRecord | undefined;
  list(): QuoteRequestRecord[];
}

export class MemoryQuoteRequestsRepository implements QuoteRequestsRepository {
  readonly mode = "memory-test" as const;
  private readonly requests: QuoteRequestRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "QuoteRequestsRepository");
  }

  create(quote: QuoteRequestRecord): QuoteRequestRecord {
    this.requests.push(quote);
    return quote;
  }

  update(id: string, update: Partial<QuoteRequestRecord>): QuoteRequestRecord {
    const quote = this.requests.find((candidate) => candidate.id === id);
    if (!quote) throw new Error(`Quote request ${id} not found`);
    Object.assign(quote, update);
    return quote;
  }

  findByPublicReference(publicReference: string): QuoteRequestRecord | undefined {
    return this.requests.find((candidate) => candidate.publicReference === publicReference);
  }

  list(): QuoteRequestRecord[] {
    return [...this.requests];
  }
}
