import { Controller, Get, Res } from "@nestjs/common";
import { AssurMatchRuntime } from "../../runtime/assurmatch-runtime";
import { checkReadiness, databaseProbe, redisProbe, type ReadinessReport } from "./readiness";

type MethodDecoratorFactory = (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => void;
type ParamDecoratorFactory = (target: object, propertyKey: string | symbol | undefined, parameterIndex: number) => void;

interface StatusResponse {
  status(code: number): unknown;
}

/**
 * Spec 057 (PRD K-10): unauthenticated probes for Docker, the reverse proxy and uptime monitors.
 *
 * - `GET /healthz` is liveness: the process answers HTTP. It never touches a dependency, so a
 *   database outage does not get the API container restarted in a loop.
 * - `GET /readyz` is readiness: database and Redis answer within a bounded delay, 503 otherwise.
 *
 * Both bodies are fixed shapes with no version, hostname, error text or timing, because they are
 * public. The detailed view stays at `GET /admin/system/health`, behind authentication.
 */
export class PublicHealthController {
  constructor(private readonly runtime: AssurMatchRuntime) {}

  liveness(): { status: "ok" } {
    return { status: "ok" };
  }

  async readiness(response: StatusResponse): Promise<ReadinessReport> {
    const report = await checkReadiness({
      database: databaseProbe(this.runtime.prisma),
      redis: redisProbe(this.runtime.redis.client)
    });
    response.status(report.status === "ready" ? 200 : 503);
    return report;
  }
}

// Decorators are applied by hand, like the rest of the HTTP wiring (no TS decorator emit).
Controller()(PublicHealthController);
Reflect.defineMetadata("design:paramtypes", [AssurMatchRuntime], PublicHealthController);
const routes: Array<[method: string, path: string, params: Array<[number, ParamDecoratorFactory]>]> = [
  ["liveness", "healthz", []],
  ["readiness", "readyz", [[0, Res({ passthrough: true }) as ParamDecoratorFactory]]]
];
for (const [method, path, params] of routes) {
  const descriptor = Object.getOwnPropertyDescriptor(PublicHealthController.prototype, method);
  if (!descriptor) throw new Error(`Missing HTTP wiring method PublicHealthController.${method}`);
  for (const [index, decorator] of params) decorator(PublicHealthController.prototype, method, index);
  (Get(path) as MethodDecoratorFactory)(PublicHealthController.prototype, method, descriptor);
}
