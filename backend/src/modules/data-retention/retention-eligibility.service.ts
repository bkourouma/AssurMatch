import { RETENTION_BATCH_CAP_PER_CATEGORY, type RetentionCategory } from "../../../../packages/shared/contracts/data-retention.contracts";
import type { RetentionSubjectCount, RetentionTargets } from "./data-retention.repository";
import { COUNTRY_LESS_CATEGORIES, cutoffResolver, latestCutoff, type RetentionPolicyRecord } from "./retention-policies";
import type { RetentionCandidate, RetentionSubjectsRepository } from "./retention-subjects.repository";

const PAGE_SIZE = 200;

export interface EligibilityInput {
  categories: readonly RetentionCategory[];
  countryId?: string | undefined;
  policies: readonly RetentionPolicyRecord[];
  now: Date;
  cap?: number;
}

export interface EligibilityResult {
  targets: RetentionTargets;
  counts: Partial<Record<RetentionCategory, Pick<RetentionSubjectCount, "selected" | "moreRemaining">>>;
}

/**
 * FR-004 / D1: which rows of each category are past their effective retention, anchored as D1
 * says, capped at 500 subjects per category. The database query is a superset prefilter; the exact
 * per-country cutoff is applied here so memory and Prisma adapters decide identically.
 */
export class RetentionEligibilityService {
  constructor(private readonly subjects: RetentionSubjectsRepository) {}

  async compute(input: EligibilityInput): Promise<EligibilityResult> {
    const cap = input.cap ?? RETENTION_BATCH_CAP_PER_CATEGORY;
    const result: EligibilityResult = { targets: {}, counts: {} };
    for (const category of input.categories) {
      if (input.countryId && COUNTRY_LESS_CATEGORIES.has(category)) {
        result.targets[category] = [];
        result.counts[category] = { selected: 0, moreRemaining: false };
        continue;
      }
      const eligible = await this.collect(category, input, cap + 1);
      const ids = eligible.slice(0, cap);
      result.targets[category] = ids;
      result.counts[category] = { selected: ids.length, moreRemaining: eligible.length > cap };
    }
    return result;
  }

  /**
   * D2 approval re-check: the frozen ids that are still eligible today (not anonymized since, and
   * not refreshed by a later activity such as a broker action on the lead).
   */
  async stillEligible(category: RetentionCategory, ids: readonly string[], input: Omit<EligibilityInput, "categories" | "cap">): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const isEligible = this.predicate(category, input);
    const candidates = await this.subjects.listCandidates(category, {
      mode: "retention",
      now: input.now,
      anchorBefore: latestCutoff(category, input.now, input.policies, input.countryId),
      countryId: input.countryId,
      onlyIds: ids,
      skip: 0,
      take: ids.length
    });
    return new Set(candidates.filter(isEligible).map((candidate) => candidate.id));
  }

  /** Erasure re-check: retention durations do not apply, only "not anonymized since the preview". */
  async stillPresent(category: RetentionCategory, ids: readonly string[], now: Date): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const candidates = await this.subjects.listCandidates(category, { mode: "erasure", now, anchorBefore: now, onlyIds: ids, skip: 0, take: ids.length });
    return new Set(candidates.map((candidate) => candidate.id));
  }

  private async collect(category: RetentionCategory, input: EligibilityInput, limit: number): Promise<string[]> {
    const isEligible = this.predicate(category, input);
    const anchorBefore = latestCutoff(category, input.now, input.policies, input.countryId);
    const collected: string[] = [];
    for (let skip = 0; collected.length < limit; skip += PAGE_SIZE) {
      const page = await this.subjects.listCandidates(category, { mode: "retention", now: input.now, anchorBefore, countryId: input.countryId, skip, take: PAGE_SIZE });
      for (const candidate of page) {
        if (isEligible(candidate)) collected.push(candidate.id);
        if (collected.length >= limit) break;
      }
      if (page.length < PAGE_SIZE) break;
    }
    return collected;
  }

  private predicate(category: RetentionCategory, input: Pick<EligibilityInput, "countryId" | "policies" | "now">): (candidate: RetentionCandidate) => boolean {
    const cutoffFor = cutoffResolver(category, input.now, input.policies, input.countryId);
    return (candidate) => {
      const cutoff = cutoffFor(candidate.countryId);
      if (!cutoff) return false;
      if (candidate.expired) return true;
      return candidate.anchor !== null && candidate.anchor < cutoff;
    };
  }
}
