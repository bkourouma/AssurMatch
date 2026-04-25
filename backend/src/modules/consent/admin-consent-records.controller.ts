import type { ActorContext } from "../common/types";
import { ConsentService, type ConsentRecord } from "./consent.module";

export class AdminConsentRecordsController {
  constructor(private readonly consent: ConsentService) {}

  search(actor: ActorContext): ConsentRecord[] {
    return this.consent.searchRecords(actor);
  }
}
