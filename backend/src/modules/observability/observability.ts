import type { INestApplication } from "@nestjs/common";
import { errorReporter } from "./error-reporter";
import { createRequestLoggingMiddleware } from "./request-logging.middleware";
import { logEvent, maskedStack } from "./structured-logger";

/** Spec 058: request logging + metrics middleware, installed before any route. */
export function applyObservability(app: INestApplication): void {
  app.use(createRequestLoggingMiddleware());
}

let processHandlersInstalled = false;

/**
 * Spec 058 FR-001 / FR-002: an unhandled rejection or an uncaught exception outside a request is
 * logged (masked, stack server side) and reported. An uncaught exception still ends the process,
 * as Node would, so the container restarts in a clean state.
 */
export function installProcessErrorHandlers(): void {
  if (processHandlersInstalled) return;
  processHandlersInstalled = true;
  process.on("unhandledRejection", (reason) => {
    logEvent("error", "process.unhandled_rejection", {
      errorName: reason instanceof Error ? reason.name : typeof reason,
      message: reason instanceof Error ? reason.message : String(reason),
      stack: maskedStack(reason)
    });
    void errorReporter().report(reason, { source: "unhandledRejection" });
  });
  process.on("uncaughtException", (error) => {
    logEvent("error", "process.uncaught_exception", { errorName: error.name, message: error.message, stack: maskedStack(error) });
    void errorReporter().report(error, { source: "uncaughtException" }).finally(() => process.exit(1));
    setTimeout(() => process.exit(1), 2500).unref();
  });
}

/** Spec 058 FR-001: Nest's own messages (bootstrap, route mapping, fatal errors) as JSON lines too. */
export class JsonNestLogger {
  log(message: unknown, context?: string): void {
    logEvent("info", "nest.log", { message: String(message), ...(context ? { context } : {}) });
  }

  warn(message: unknown, context?: string): void {
    logEvent("warn", "nest.warn", { message: String(message), ...(context ? { context } : {}) });
  }

  error(message: unknown, stackOrContext?: string, context?: string): void {
    const where = context ?? stackOrContext;
    logEvent("error", "nest.error", { message: String(message), ...(where ? { context: where } : {}) });
  }

  debug(message: unknown, context?: string): void {
    logEvent("debug", "nest.debug", { message: String(message), ...(context ? { context } : {}) });
  }

  verbose(message: unknown, context?: string): void {
    this.debug(message, context);
  }
}
