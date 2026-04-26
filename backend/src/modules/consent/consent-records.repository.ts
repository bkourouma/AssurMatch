import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { ConsentRecord, ConsentText } from "./consent.module";

export const CONSENT_RECORDS_REPOSITORY = Symbol("CONSENT_RECORDS_REPOSITORY");

export interface ConsentRecordsRepository extends RuntimeRepository {
  createText(text: ConsentText): ConsentText;
  updateText(id: string, update: Partial<ConsentText>): ConsentText;
  listTexts(): ConsentText[];
  createRecord(record: ConsentRecord): ConsentRecord;
  hasValidConsent(recordId: string | undefined, purpose: string, countryId: string, productId?: string): boolean;
  searchRecords(): ConsentRecord[];
  requireText(id: string): ConsentText;
}

export class MemoryConsentRecordsRepository implements ConsentRecordsRepository {
  readonly mode = "memory-test" as const;
  private readonly texts: ConsentText[] = [];
  private readonly records: ConsentRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "ConsentRecordsRepository");
  }

  createText(text: ConsentText): ConsentText {
    this.texts.push(text);
    return text;
  }

  updateText(id: string, update: Partial<ConsentText>): ConsentText {
    const text = this.requireText(id);
    Object.assign(text, update);
    return text;
  }

  listTexts(): ConsentText[] {
    return [...this.texts];
  }

  createRecord(record: ConsentRecord): ConsentRecord {
    this.records.push(record);
    return record;
  }

  hasValidConsent(recordId: string | undefined, purpose: string, countryId: string, productId?: string): boolean {
    if (!recordId) return false;
    return this.records.some((record) =>
      record.id === recordId &&
      record.purpose === purpose &&
      record.countryId === countryId &&
      (productId === undefined || record.productId === productId) &&
      record.status === "granted"
    );
  }

  searchRecords(): ConsentRecord[] {
    return [...this.records];
  }

  requireText(id: string): ConsentText {
    const text = this.texts.find((candidate) => candidate.id === id);
    if (!text) throw new Error(`Consent text ${id} not found`);
    return text;
  }
}
