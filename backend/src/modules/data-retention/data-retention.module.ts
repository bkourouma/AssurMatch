import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { DocumentStoragePort } from "../quote-documents/document-storage.port";
import { AnonymizationService, type RetentionInAppPort } from "./anonymization.service";
import { DataRetentionService } from "./data-retention.service";
import { MemoryDataRetentionRepository, type DataRetentionRepository } from "./data-retention.repository";
import { ErasureLookupService, type EmailFingerprintPort } from "./erasure-lookup.service";
import { RetentionEligibilityService } from "./retention-eligibility.service";
import { MemoryRetentionSubjectsRepository, type MemoryRetentionSources, type RetentionSubjectsRepository } from "./retention-subjects.repository";

export interface DataRetentionModuleDeps {
  audit: AuditLogWriter;
  featureFlags: { isEnabled(key: string): boolean };
  identity: EmailFingerprintPort;
  storage: DocumentStoragePort;
  requireCountry(countryId: string): Promise<unknown>;
  inApp?: RetentionInAppPort | undefined;
  repository?: DataRetentionRepository | undefined;
  subjects?: RetentionSubjectsRepository | undefined;
  /** Test runtime only: the live memory records the memory subjects adapter reads and scrubs. */
  memorySources?: MemoryRetentionSources | undefined;
  clock?: () => Date;
}

/** Spec 046: data retention policies, retention and erasure batches, and their anonymization. */
export class DataRetentionModule {
  readonly repository: DataRetentionRepository;
  readonly subjects: RetentionSubjectsRepository;
  readonly eligibility: RetentionEligibilityService;
  readonly erasure: ErasureLookupService;
  readonly anonymization: AnonymizationService;
  readonly service: DataRetentionService;

  constructor(deps: DataRetentionModuleDeps) {
    this.repository = deps.repository ?? new MemoryDataRetentionRepository();
    this.subjects = deps.subjects ?? new MemoryRetentionSubjectsRepository(deps.memorySources);
    this.eligibility = new RetentionEligibilityService(this.subjects);
    this.erasure = new ErasureLookupService(this.subjects, deps.identity);
    this.anonymization = new AnonymizationService({ audit: deps.audit, subjects: this.subjects, storage: deps.storage, inApp: deps.inApp });
    this.service = new DataRetentionService({
      audit: deps.audit,
      repository: this.repository,
      eligibility: this.eligibility,
      erasure: this.erasure,
      anonymization: this.anonymization,
      featureFlags: deps.featureFlags,
      requireCountry: deps.requireCountry,
      ...(deps.clock ? { clock: deps.clock } : {})
    });
  }
}

export { DataRetentionAuditActions } from "./data-retention-audit-actions";
export {
  DataRetentionService,
  RetentionAccessRefusedError,
  RetentionBatchConflictError,
  RetentionBatchNotFoundError,
  RetentionPurgeDisabledError
} from "./data-retention.service";
export { DATA_RETENTION_REPOSITORY, MemoryDataRetentionRepository, PrismaDataRetentionRepository, type DataRetentionRepository } from "./data-retention.repository";
export { MemoryRetentionSubjectsRepository, PrismaRetentionSubjectsRepository, type MemoryRetentionSources, type RetentionSubjectsRepository } from "./retention-subjects.repository";
export { DEFAULT_RETENTION_POLICIES, resolveRetentionPolicy } from "./retention-policies";
