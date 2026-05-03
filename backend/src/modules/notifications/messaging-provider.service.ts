import type { MessagingProvidersResponse } from "../../../../packages/shared/contracts/messaging-provider.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import { MessagingProviderAuditActions } from "./messaging-provider-audit-actions";

export interface MessagingProviderConfig {
  smsProvider?: string | undefined;
  smsSecretConfigured?: boolean | undefined;
  whatsappProvider?: string | undefined;
  whatsappSecretConfigured?: boolean | undefined;
}

export interface MessagingFeatureFlags {
  isEnabled(key: string): boolean;
}

export class MessagingProviderAccessRefusedError extends Error {
  constructor(public readonly reason: string) {
    super(`Messaging provider access denied: ${reason}`);
    this.name = "MessagingProviderAccessRefusedError";
  }
}

export class MessagingProviderService {
  constructor(
    private readonly audit: AuditLogWriter,
    private readonly featureFlags: MessagingFeatureFlags,
    private readonly config: MessagingProviderConfig = {}
  ) {}

  status(actor: ActorContext): MessagingProvidersResponse {
    this.assertAccess(actor);
    const response: MessagingProvidersResponse = {
      generatedAt: new Date().toISOString(),
      providers: [
        this.provider("sms", "sms_enabled", this.config.smsProvider, this.config.smsSecretConfigured === true),
        this.provider("whatsapp", "whatsapp_enabled", this.config.whatsappProvider, this.config.whatsappSecretConfigured === true)
      ],
      restrictions: [
        "disabled_by_default",
        "no_send_without_explicit_flag",
        "no_marketing_claims",
        "no_provider_secrets_in_response",
        "channel_consent_required_before_future_delivery"
      ]
    };
    this.audit.write({
      actor,
      action: MessagingProviderAuditActions.statusRead,
      targetType: "MessagingProvider",
      targetId: "channels",
      result: "success",
      context: { providers: response.providers.map((provider) => ({ channel: provider.channel, enabled: provider.enabled, configured: provider.configured })) }
    });
    return response;
  }

  private provider(channel: "sms" | "whatsapp", flagKey: string, provider: string | undefined, secretConfigured: boolean) {
    const flagEnabled = this.featureFlags.isEnabled(flagKey);
    const configured = Boolean(provider) && secretConfigured;
    return {
      channel,
      enabled: false as const,
      configured,
      provider: provider ?? "not_configured",
      flagKey,
      secretConfigured,
      sendCapable: false as const,
      reason: flagEnabled && configured ? "provider_abstraction_only_disabled_for_v1" : "disabled_by_default"
    };
  }

  private assertAccess(actor: ActorContext): void {
    if (actor.mfaVerified !== true) this.refuse(actor, "mfa_required");
    if (!actor.roles.some((role) => role === "super_admin" || roleHasPermission(role, "audit_logs:read"))) {
      this.refuse(actor, "forbidden_role");
    }
  }

  private refuse(actor: ActorContext, reason: string): never {
    this.audit.write({
      actor,
      action: MessagingProviderAuditActions.statusRefused,
      targetType: "MessagingProvider",
      targetId: "channels",
      result: "refused",
      reason,
      context: { roles: actor.roles }
    });
    throw new MessagingProviderAccessRefusedError(reason);
  }
}
