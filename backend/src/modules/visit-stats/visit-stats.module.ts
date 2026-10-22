import { VisitStatsService, type VisitStatsOptions } from "./visit-stats.service";
import type { VisitStatsRepository } from "./visit-stats.repository";

/** Spec 073 (hypothesis H5): aggregated page-view counter, no cookie and no personal data. */
export class VisitStatsModule {
  readonly service: VisitStatsService;

  constructor(readonly repository?: VisitStatsRepository, options?: VisitStatsOptions) {
    this.service = new VisitStatsService(repository, options);
  }
}
