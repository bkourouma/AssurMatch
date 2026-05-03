import { z } from "zod";
import { dateTimeStringSchema, nonEmptyStringSchema } from "../validation/common.schemas";

export const messagingChannelSchema = z.enum(["sms", "whatsapp"]);
export const messagingProviderStatusSchema = z.object({
  channel: messagingChannelSchema,
  enabled: z.literal(false),
  configured: z.boolean(),
  provider: nonEmptyStringSchema,
  flagKey: nonEmptyStringSchema,
  secretConfigured: z.boolean(),
  sendCapable: z.literal(false),
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
