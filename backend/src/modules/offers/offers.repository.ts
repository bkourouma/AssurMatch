import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { OfferHistoryRecord, OfferRecord } from "./offers.module";

export const OFFERS_REPOSITORY = Symbol("OFFERS_REPOSITORY");

export interface OffersRepository extends RuntimeRepository {
  create(offer: OfferRecord): OfferRecord;
  update(id: string, update: Partial<OfferRecord>): OfferRecord;
  appendHistory(history: OfferHistoryRecord): OfferHistoryRecord;
  list(): OfferRecord[];
  history(): OfferHistoryRecord[];
  require(id: string): OfferRecord;
}

export class MemoryOffersRepository implements OffersRepository {
  readonly mode = "memory-test" as const;
  private readonly offers: OfferRecord[] = [];
  private readonly offerHistory: OfferHistoryRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "OffersRepository");
  }

  create(offer: OfferRecord): OfferRecord {
    this.offers.push(offer);
    return offer;
  }

  update(id: string, update: Partial<OfferRecord>): OfferRecord {
    const offer = this.require(id);
    Object.assign(offer, update);
    return offer;
  }

  appendHistory(history: OfferHistoryRecord): OfferHistoryRecord {
    this.offerHistory.push(history);
    return history;
  }

  list(): OfferRecord[] {
    return [...this.offers];
  }

  history(): OfferHistoryRecord[] {
    return [...this.offerHistory];
  }

  require(id: string): OfferRecord {
    const offer = this.offers.find((candidate) => candidate.id === id);
    if (!offer) throw new Error(`Offer ${id} not found`);
    return offer;
  }
}
