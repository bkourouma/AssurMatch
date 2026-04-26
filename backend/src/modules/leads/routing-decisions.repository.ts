import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { RoutingDecisionRecord } from "./routing-decision.service";

export const ROUTING_DECISIONS_REPOSITORY = Symbol("ROUTING_DECISIONS_REPOSITORY");

export interface RoutingDecisionsRepository extends RuntimeRepository {
  create(decision: RoutingDecisionRecord): RoutingDecisionRecord;
  list(): RoutingDecisionRecord[];
}

export class MemoryRoutingDecisionsRepository implements RoutingDecisionsRepository {
  readonly mode = "memory-test" as const;
  private readonly decisions: RoutingDecisionRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "RoutingDecisionsRepository");
  }

  create(decision: RoutingDecisionRecord): RoutingDecisionRecord {
    this.decisions.push(decision);
    return decision;
  }

  list(): RoutingDecisionRecord[] {
    return [...this.decisions];
  }
}
