import { ContentCmsService, type ContentCmsServiceDeps } from "./content-cms.service";
import { MemoryContentCmsRepository, type ContentCmsRepository } from "./content-cms.repository";

export interface ContentCmsModuleDeps extends Omit<ContentCmsServiceDeps, "repository"> {
  /** Left out in the test runtime, where the in-memory repository is used. */
  repository?: ContentCmsRepository | undefined;
}

/** Lot 9 (spec 072): minimal CMS of the Content Admin role. */
export class ContentCmsModule {
  readonly repository: ContentCmsRepository;
  readonly service: ContentCmsService;

  constructor(deps: ContentCmsModuleDeps) {
    this.repository = deps.repository ?? new MemoryContentCmsRepository();
    this.service = new ContentCmsService({ ...deps, repository: this.repository });
  }
}

export { ContentCmsService } from "./content-cms.service";
export {
  CONTENT_CMS_REPOSITORY,
  MemoryContentCmsRepository,
  OpenContentEntryExistsError,
  PrismaContentCmsRepository,
  type ContentCmsRepository,
  type ContentEntryRecord
} from "./content-cms.repository";
