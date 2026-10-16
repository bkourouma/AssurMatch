import { DataRequestsService, type DataRequestsServiceDeps } from "./data-requests.service";
import { MemoryDataRequestsRepository, type DataRequestsRepository } from "./data-requests.repository";

export interface DataRequestsModuleDeps extends Omit<DataRequestsServiceDeps, "repository"> {
  /** Left out in the test runtime, where the in-memory repository is used. */
  repository?: DataRequestsRepository | undefined;
}

/** Spec 062 (D-10): visitor data-subject requests and the compliance workflow that processes them. */
export class DataRequestsModule {
  readonly repository: DataRequestsRepository;
  readonly service: DataRequestsService;

  constructor(deps: DataRequestsModuleDeps) {
    this.repository = deps.repository ?? new MemoryDataRequestsRepository();
    this.service = new DataRequestsService({ ...deps, repository: this.repository });
  }
}

export { DataRequestsService } from "./data-requests.service";
export {
  DATA_REQUESTS_REPOSITORY,
  DuplicateDataRequestReferenceError,
  MemoryDataRequestsRepository,
  OpenDataRequestExistsError,
  PrismaDataRequestsRepository,
  type DataRequestRecord,
  type DataRequestRetentionSource,
  type DataRequestsRepository
} from "./data-requests.repository";
