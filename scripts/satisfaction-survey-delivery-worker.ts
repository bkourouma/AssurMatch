import { AssurMatchRuntime } from "../backend/src/runtime/assurmatch-runtime";

const limit = Number(process.env.ASSURMATCH_SATISFACTION_SURVEY_DELIVERY_LIMIT ?? "50");
if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
  throw new Error("ASSURMATCH_SATISFACTION_SURVEY_DELIVERY_LIMIT must be between 1 and 100");
}

const runtime = new AssurMatchRuntime();

try {
  await runtime.onModuleInit();
  const result = await runtime.satisfactionSurveys.drain.deliverDue(limit);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await runtime.onModuleDestroy();
}
