import { AssurMatchRuntime } from "../backend/src/runtime/assurmatch-runtime";

const limit = Number(process.env.ASSURMATCH_PARTNER_WEBHOOK_DELIVERY_LIMIT ?? "25");
if (!Number.isInteger(limit) || limit <= 0 || limit > 100) throw new Error("ASSURMATCH_PARTNER_WEBHOOK_DELIVERY_LIMIT must be between 1 and 100");

const runtime = new AssurMatchRuntime();

try {
  await runtime.onModuleInit();
  const result = await runtime.partnerIntegrations.service.processDueWebhookDeliveries({ limit });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await runtime.onModuleDestroy();
}
