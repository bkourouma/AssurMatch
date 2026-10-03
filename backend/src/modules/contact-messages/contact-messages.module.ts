import {
  contactMessageCreateSchema,
  type ContactAudience,
  type ContactMessageResponse,
  type PublicLocale
} from "../../../../packages/shared/contracts/public-site.contracts";
import type { AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { ADMIN_OPERATIONS_AUDIT_ACTIONS } from "../audit-logs/admin-operations-audit-actions";
import { PUBLIC_SITE_AUDIT_ACTIONS } from "../audit-logs/public-site-audit-actions";
import { RetentionPolicyService } from "../audit-logs/retention-policy.service";
import { PublicAbuseGuardService } from "../common/abuse/public-abuse-guard.service";
import { InMemoryRedisClient, type RedisClientPort } from "../common/redis/redis.module";
import { QuoteRedisKeys } from "../common/redis/quote-redis-keys";
import type { ActorContext } from "../common/types";
import type { Country } from "../countries/countries.module";
import type { PublicFormNotificationPort } from "../notifications/public-form-notification.service";
import { ProspectIdentityService } from "../prospects/prospect-identity.service";
import {
  MemoryContactMessagesRepository,
  type ContactMessageRecord,
  type ContactMessagesFilter,
  type ContactMessagesRepository,
  type ContactMessageStatus
} from "./contact-messages.repository";

/** Roles allowed to read the contact inbox: the same support/compliance/super-admin set `assertAnyRole`
 *  grants for audit-log reads at the HTTP wiring layer (see `runtime-http-wiring.module.ts`). */
const CONTACT_MESSAGE_ADMIN_ROLES = new Set<AssurMatchRole>(["super_admin", "support_admin", "compliance_admin"]);

const CONTACT_RATE_LIMIT_PER_WINDOW = 5;
const CONTACT_RATE_LIMIT_WINDOW_SECONDS = 3600;
const CONTACT_CONSENT_VERSION = "contact-v1";
const CONTACT_RETENTION_YEARS = 2;

/** A contact-inbox row with the fields an admin never needs to see stripped out. */
export type ContactMessageAdminRow = Omit<ContactMessageRecord, "emailFingerprint" | "ipHash">;

export interface ContactMessagesDependencies {
  /** Resolves an ISO country code to its record; only `id` is used. Left undefined when the
   *  submission carries no `countryCode` at all. */
  findCountryByCode: (countryCode: string) => Country | undefined | Promise<Country | undefined>;
  /** Spec 047. Left out and no confirmation is sent; a submission still succeeds. */
  notifications?: PublicFormNotificationPort;
}

export class ContactMessagesService {
  private readonly abuseGuard: PublicAbuseGuardService;
  private readonly identity = new ProspectIdentityService();
  private readonly retention = new RetentionPolicyService();

  constructor(
    private readonly deps: ContactMessagesDependencies,
    private readonly audit: AuditLogWriter,
    redis: RedisClientPort = new InMemoryRedisClient(),
    private readonly repository: ContactMessagesRepository = new MemoryContactMessagesRepository()
  ) {
    this.abuseGuard = new PublicAbuseGuardService(redis);
  }

  async submit(rawInput: unknown, context: { ipAddress: string; actor: ActorContext }): Promise<ContactMessageResponse> {
    // Read the honeypot/session fields straight off the raw payload rather than through
    // `publicSubmissionGuardFieldsSchema`: that schema's `website` field is `max(0)`, so a *filled*
    // honeypot (the case we actually want to catch) would fail it and vanish before the abuse
    // guard ever sees it.
    const rawRecord = typeof rawInput === "object" && rawInput !== null ? (rawInput as Record<string, unknown>) : {};
    const website = typeof rawRecord.website === "string" ? rawRecord.website : undefined;
    const sessionId = typeof rawRecord.sessionId === "string" ? rawRecord.sessionId : undefined;

    await this.abuseGuard.assertAllowed({
      scope: "contact",
      ipAddress: context.ipAddress,
      ...(sessionId ? { sessionId } : {}),
      ...(website ? { honeypot: website } : {}),
      limitPerWindow: CONTACT_RATE_LIMIT_PER_WINDOW,
      windowSeconds: CONTACT_RATE_LIMIT_WINDOW_SECONDS
    });

    const parsedResult = contactMessageCreateSchema.safeParse(rawInput);
    if (!parsedResult.success) {
      this.audit.write({
        actor: context.actor,
        action: PUBLIC_SITE_AUDIT_ACTIONS.contactMessageRefused,
        targetType: "ContactMessage",
        targetId: "draft",
        result: "refused",
        reason: "validation_failed",
        context: {}
      });
      throw new Error("Contact message validation failed");
    }
    const parsed = parsedResult.data;

    let countryId: string | undefined;
    if (parsed.countryCode) {
      const country = await this.deps.findCountryByCode(parsed.countryCode);
      if (!country) {
        this.audit.write({
          actor: context.actor,
          action: PUBLIC_SITE_AUDIT_ACTIONS.contactMessageRefused,
          targetType: "ContactMessage",
          targetId: "draft",
          result: "refused",
          reason: "country_not_found",
          context: { audience: parsed.audience }
        });
        throw new Error("Country not found");
      }
      countryId = country.id;
    }

    const emailNormalized = parsed.email.trim().toLowerCase();
    const emailFingerprint = this.identity.fingerprint(emailNormalized);
    const now = new Date();
    const record: ContactMessageRecord = {
      id: crypto.randomUUID(),
      publicReference: `CM-${now.getFullYear()}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`,
      audience: parsed.audience,
      name: parsed.name,
      emailNormalized,
      emailFingerprint,
      ...(parsed.phone ? { phone: parsed.phone } : {}),
      ...(countryId ? { countryId } : {}),
      subject: parsed.subject,
      message: parsed.message,
      consentVersion: CONTACT_CONSENT_VERSION,
      status: "new",
      ipHash: QuoteRedisKeys.ipHash(context.ipAddress),
      retentionUntil: this.retention.retentionUntil(now, CONTACT_RETENTION_YEARS),
      createdAt: now,
      updatedAt: now
    };
    await this.repository.create(record);

    // Never log the raw e-mail or the message body: the audit context carries only the
    // fingerprint (already one-way hashed) and the subject's length.
    this.audit.write({
      actor: context.actor,
      action: PUBLIC_SITE_AUDIT_ACTIONS.contactMessageReceived,
      targetType: "ContactMessage",
      targetId: record.id,
      ...(countryId ? { scope: { countryId } } : {}),
      result: "success",
      context: {
        audience: record.audience,
        ...(countryId ? { countryId } : {}),
        emailFingerprint: record.emailFingerprint,
        subjectLength: record.subject.length
      }
    });

    // Spec 047: the confirmation goes out through the audited e-mail delivery path used by the
    // activation and password-reset messages, not through `Notification`: that table is typed by
    // the `NotificationType` enum, which has no value for a contact message, and adding one would
    // mean a migration for a row nothing reads. The rendered message carries the reference and
    // never the submitted body.
    await this.sendConfirmation(record, parsed.locale);

    return {
      status: "received",
      publicReference: record.publicReference,
      message: "Votre message a bien ete recu et sera lu par notre equipe."
    };
  }

  /**
   * Runs after the message is stored and audited, and never changes the caller's outcome. The port
   * reports its own outcome and `RuntimeEmailDeliveryService` audits it under `email.delivery.*`;
   * the catch here only covers an unexpected throw, which must not undo a recorded message.
   */
  private async sendConfirmation(record: ContactMessageRecord, locale: PublicLocale | undefined): Promise<void> {
    if (!this.deps.notifications) return;
    try {
      await this.deps.notifications.confirmContact({
        to: record.emailNormalized,
        name: record.name,
        publicReference: record.publicReference,
        ...(locale ? { locale } : {})
      });
    } catch {
      // Intentionally ignored: see above.
    }
  }

  async listForAdmin(actor: ActorContext, filter: ContactMessagesFilter = {}): Promise<ContactMessageAdminRow[]> {
    if (!actor.roles.some((role) => CONTACT_MESSAGE_ADMIN_ROLES.has(role))) {
      throw new Error("Contact message access denied");
    }
    const rows = await this.repository.list(filter);
    this.audit.write({
      actor,
      action: PUBLIC_SITE_AUDIT_ACTIONS.contactMessageAdminListed,
      targetType: "ContactMessage",
      targetId: "list",
      result: "success",
      context: { count: rows.length, ...filter }
    });
    return rows.map((row) => this.toAdminRow(row));
  }

  /**
   * Spec 056: the admin inbox moves a message between `new`, `handled` and `spam`. Only the status,
   * who changed it and when are stored; the audit carries the transition, never the message body.
   */
  async updateStatus(actor: ActorContext, id: string, input: { status: ContactMessageStatus; reason?: string | undefined }): Promise<ContactMessageAdminRow & { previousStatus: ContactMessageStatus }> {
    if (actor.mfaVerified !== true || !actor.roles.some((role) => CONTACT_MESSAGE_ADMIN_ROLES.has(role))) {
      this.audit.write({
        actor,
        action: ADMIN_OPERATIONS_AUDIT_ACTIONS.contactMessageStatusRefused,
        targetType: "ContactMessage",
        targetId: id,
        scope: { roles: actor.roles },
        result: "refused",
        reason: actor.mfaVerified !== true ? "mfa_required" : "forbidden_role",
        context: {}
      });
      throw new Error("Contact message access denied");
    }
    const existing = await this.repository.findById(id);
    if (!existing) throw new Error("Contact message not found");
    // Captured before the write: the memory repository updates the very record it returned.
    const previousStatus = existing.status;
    const reason = input.reason?.trim() ? input.reason.trim().slice(0, 500) : null;
    const updated = await this.repository.updateStatus(id, {
      status: input.status,
      handledAt: input.status === "new" ? null : new Date(),
      handledById: input.status === "new" ? null : actor.actorId ?? null,
      statusReason: reason
    });
    this.audit.write({
      actor,
      action: ADMIN_OPERATIONS_AUDIT_ACTIONS.contactMessageStatusUpdated,
      targetType: "ContactMessage",
      targetId: id,
      ...(existing.countryId ? { scope: { countryId: existing.countryId } } : {}),
      result: "success",
      ...(reason ? { reason } : {}),
      context: { previousStatus, status: updated.status, audience: existing.audience }
    });
    return { ...this.toAdminRow(updated), previousStatus };
  }

  /**
   * Explicit allow-list rather than a rest-spread that drops two keys: a column added to the record
   * later must be opted in here to reach an administrator, instead of leaking by default.
   */
  private toAdminRow(record: ContactMessageRecord): ContactMessageAdminRow {
    return {
      id: record.id,
      publicReference: record.publicReference,
      audience: record.audience,
      name: record.name,
      emailNormalized: record.emailNormalized,
      ...(record.phone === undefined ? {} : { phone: record.phone }),
      ...(record.countryId === undefined ? {} : { countryId: record.countryId }),
      subject: record.subject,
      message: record.message,
      consentVersion: record.consentVersion,
      status: record.status,
      ...(record.handledAt === undefined ? {} : { handledAt: record.handledAt }),
      ...(record.handledById === undefined ? {} : { handledById: record.handledById }),
      ...(record.statusReason === undefined ? {} : { statusReason: record.statusReason }),
      retentionUntil: record.retentionUntil,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
  }
}

export class ContactMessagesModule {
  readonly service: ContactMessagesService;

  constructor(
    deps: ContactMessagesDependencies,
    audit = new AuditLogWriter(),
    redis: RedisClientPort = new InMemoryRedisClient(),
    repository?: ContactMessagesRepository
  ) {
    this.service = new ContactMessagesService(deps, audit, redis, repository);
  }
}

export {
  CONTACT_MESSAGES_REPOSITORY,
  MemoryContactMessagesRepository,
  PrismaContactMessagesRepository,
  type ContactMessageRecord,
  type ContactMessagesFilter,
  type ContactMessagesRepository,
  type ContactMessageStatus
} from "./contact-messages.repository";
export type { ContactAudience };
