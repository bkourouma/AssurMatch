import { z } from "zod";
import { dateTimeStringSchema, nonEmptyStringSchema, uuidSchema } from "../validation/common.schemas";

export const messagingChannelSchema = z.enum(["sms", "whatsapp"]);
export const messagingProviderStatusSchema = z.object({
  channel: messagingChannelSchema,
  enabled: z.boolean(),
  configured: z.boolean(),
  provider: nonEmptyStringSchema,
  flagKey: nonEmptyStringSchema,
  secretConfigured: z.boolean(),
  sendCapable: z.boolean(),
  reason: nonEmptyStringSchema
});

export const messagingProvidersResponseSchema = z.object({
  generatedAt: dateTimeStringSchema,
  providers: z.array(messagingProviderStatusSchema),
  restrictions: z.array(nonEmptyStringSchema)
});

export type MessagingChannel = z.infer<typeof messagingChannelSchema>;
export type MessagingProviderStatus = z.infer<typeof messagingProviderStatusSchema>;
export type MessagingProvidersResponse = z.infer<typeof messagingProvidersResponseSchema>;

/** Email and in-app are the operational baseline and cannot be disabled by a recipient. */
export const notificationChannelSchema = z.enum(["email", "in_app", "sms", "whatsapp"]);
export const optionalChannelSchema = z.enum(["sms", "whatsapp"]);

export const messagingDeliveryStatusSchema = z.enum(["sent", "refused", "failed"]);

export const messagingDeliverySchema = z.object({
  id: uuidSchema,
  channel: notificationChannelSchema,
  status: messagingDeliveryStatusSchema,
  template: nonEmptyStringSchema,
  recipientMasked: nonEmptyStringSchema,
  provider: nonEmptyStringSchema,
  partnerTenantId: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: dateTimeStringSchema
});

export const notificationPreferencesSchema = z.object({
  scopeId: nonEmptyStringSchema,
  email: z.literal(true),
  inApp: z.literal(true),
  sms: z.boolean(),
  whatsapp: z.boolean(),
  updatedAt: dateTimeStringSchema.nullable()
});

export const notificationPreferencesUpdateSchema = z.object({
  sms: z.boolean().optional(),
  whatsapp: z.boolean().optional(),
  email: z.boolean().optional(),
  inApp: z.boolean().optional(),
  reason: z.string().trim().min(3).max(300)
});

export const inAppNotificationSchema = z.object({
  id: uuidSchema,
  recipientScopeId: nonEmptyStringSchema,
  type: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  body: nonEmptyStringSchema,
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  read: z.boolean(),
  createdAt: dateTimeStringSchema
});

export const messagingTestDispatchSchema = z.object({
  channel: optionalChannelSchema,
  recipient: z.string().trim().min(5).max(120),
  scopeId: nonEmptyStringSchema,
  reason: z.string().trim().min(3).max(300)
});

export type NotificationChannel = z.infer<typeof notificationChannelSchema>;
export type OptionalChannel = z.infer<typeof optionalChannelSchema>;
export type MessagingDelivery = z.infer<typeof messagingDeliverySchema>;
export type MessagingDeliveryStatus = z.infer<typeof messagingDeliveryStatusSchema>;
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
export type NotificationPreferencesUpdate = z.infer<typeof notificationPreferencesUpdateSchema>;
export type InAppNotification = z.infer<typeof inAppNotificationSchema>;
export type MessagingTestDispatch = z.infer<typeof messagingTestDispatchSchema>;
