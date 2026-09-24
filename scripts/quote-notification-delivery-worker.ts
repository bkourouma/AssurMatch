import { AssurMatchRuntime } from "../backend/src/runtime/assurmatch-runtime";

const limit = Number(process.env.ASSURMATCH_QUOTE_NOTIFICATION_DELIVERY_LIMIT ?? "25");
if (!Number.isInteger(limit) || limit <= 0 || limit > 100) throw new Error("ASSURMATCH_QUOTE_NOTIFICATION_DELIVERY_LIMIT must be between 1 and 100");

const runtime = new AssurMatchRuntime();

try {
  await runtime.onModuleInit();
  const result = await runtime.quoteNotificationDelivery.processDueNotifications({ limit });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await runtime.onModuleDestroy();
}
