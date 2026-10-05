import { timingSafeEqual } from "node:crypto";
import { Controller, Get, Header, NotFoundException, Req, UnauthorizedException } from "@nestjs/common";
import { AssurMatchRuntime } from "../../runtime/assurmatch-runtime";
import { readWorkerStatus } from "../../runtime/worker/worker-status";
import { httpMetrics } from "./http-metrics";

type MethodDecoratorFactory = (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => void;
type ParamDecoratorFactory = (target: object, propertyKey: string | symbol | undefined, parameterIndex: number) => void;

interface MetricsRequest {
  headers: Record<string, string | string[] | undefined>;
}

export const METRICS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

/** Constant-time comparison of the presented bearer token with METRICS_TOKEN. */
export function metricsTokenAccepted(authorization: string | undefined, expected: string): boolean {
  if (!authorization?.startsWith("Bearer ")) return false;
  const presented = Buffer.from(authorization.slice("Bearer ".length).trim());
  const wanted = Buffer.from(expected);
  return presented.length === wanted.length && timingSafeEqual(presented, wanted);
}

/**
 * Spec 058 FR-003: Prometheus scrape endpoint.
 *
 * - METRICS_TOKEN unset (or shorter than 16 characters): the endpoint does not exist (404).
 * - Otherwise `Authorization: Bearer <METRICS_TOKEN>` is required (401 otherwise, same body for a
 *   missing and a wrong token). nginx additionally refuses `/metrics` from outside the private
 *   network (deploy/nginx/assurmatch-production.conf.example).
 * The output holds counters, route templates and worker gauges only: no identifier, no PII.
 */
export class MetricsController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  async metrics(request: MetricsRequest): Promise<string> {
    const expected = process.env.METRICS_TOKEN?.trim();
    if (!expected || expected.length < 16) throw new NotFoundException("Not found");
    const header = request.headers.authorization;
    if (!metricsTokenAccepted(Array.isArray(header) ? header[0] : header, expected)) throw new UnauthorizedException("Authentication required");
    return httpMetrics.render(await readWorkerStatus(this.runtime.redis.client));
  }
}

// Decorators are applied by hand, like the rest of the HTTP wiring (no TS decorator emit).
Controller()(MetricsController);
Reflect.defineMetadata("design:paramtypes", [AssurMatchRuntime], MetricsController);
{
  const descriptor = Object.getOwnPropertyDescriptor(MetricsController.prototype, "metrics");
  if (!descriptor) throw new Error("Missing HTTP wiring method MetricsController.metrics");
  (Req() as ParamDecoratorFactory)(MetricsController.prototype, "metrics", 0);
  (Header("content-type", METRICS_CONTENT_TYPE) as MethodDecoratorFactory)(MetricsController.prototype, "metrics", descriptor);
  (Header("cache-control", "no-store") as MethodDecoratorFactory)(MetricsController.prototype, "metrics", descriptor);
  (Get("metrics") as MethodDecoratorFactory)(MetricsController.prototype, "metrics", descriptor);
}
