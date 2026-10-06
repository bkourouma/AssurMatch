import {
  adminConsentRecordSearchQuerySchema,
  type AdminConsentRecordSearchQuery,
  type AdminConsentRecordSearchResult,
  type AdminConsentRecordView
} from "../../../../packages/shared/contracts/compliance.contracts";
import type { ActorContext } from "../common/types";
import { ProspectIdentityService } from "../prospects/prospect-identity.service";
import type { ConsentRecord, ConsentService, ConsentText } from "./consent.module";

export interface AdminConsentRecordsDeps {
  /** Consent record ids of a quote request (lead transmission and survey), by public reference. */
  quoteConsentIds(publicReference: string): Promise<string[] | undefined>;
}

/**
 * Spec 059 follow-up: compliance consent-proof search (`POST /admin/consent-records/search`). The visitor
 * e-mail is turned into the same fingerprint the submission recorded and is never echoed; the
 * response carries the consent text version and hash (the evidence) and a truncated fingerprint.
 */
export class AdminConsentRecordsController {
  private readonly identity = new ProspectIdentityService();

  constructor(private readonly consent: ConsentService, private readonly deps?: AdminConsentRecordsDeps) {}

  async search(actor: ActorContext, query: AdminConsentRecordSearchQuery): Promise<AdminConsentRecordSearchResult> {
    const parsed = adminConsentRecordSearchQuerySchema.parse(query);
    const criteria = (["publicReference", "email", "countryId", "purpose", "status"] as const).filter((key) => parsed[key] !== undefined);
    let ids: string[] | undefined;
    if (parsed.publicReference) {
      // An unknown reference is an empty result, never an error that would confirm anything.
      ids = (await this.deps?.quoteConsentIds(parsed.publicReference).catch(() => undefined)) ?? [];
    }
    const page = await this.consent.searchRecordsPage(actor, {
      ...(ids ? { ids } : {}),
      ...(parsed.email ? { subjectReference: this.identity.fingerprint(parsed.email) } : {}),
      ...(parsed.countryId ? { countryId: parsed.countryId } : {}),
      ...(parsed.purpose ? { purpose: parsed.purpose } : {}),
      ...(parsed.status ? { status: parsed.status } : {}),
      skip: (parsed.page - 1) * parsed.pageSize,
      take: parsed.pageSize
    }, criteria);
    const texts = new Map((await this.consent.listTexts()).map((text) => [text.id, text]));
    return {
      items: page.items.map((record) => toView(record, texts.get(record.consentTextId))),
      total: page.total,
      page: parsed.page,
      pageSize: parsed.pageSize
    };
  }
}

function iso(value: Date | string | undefined | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toView(record: ConsentRecord, text: ConsentText | undefined): AdminConsentRecordView {
  return {
    id: record.id,
    consentTextId: record.consentTextId,
    consentTextVersion: text?.version ?? null,
    consentTextLanguage: text?.language ?? null,
    consentTextHash: text?.contentHash ?? null,
    purpose: record.purpose,
    countryId: record.countryId,
    productId: record.productId ?? null,
    channel: record.channel,
    intendedRecipient: record.intendedRecipient,
    status: record.status ?? "granted",
    grantedAt: iso(record.grantedAt) ?? "",
    withdrawnAt: iso(record.withdrawnAt),
    retentionUntil: iso(record.retentionUntil) ?? "",
    subjectFingerprint: `${record.subjectReference.slice(0, 8)}…`
  };
}
