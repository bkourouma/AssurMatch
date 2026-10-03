import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { RuntimeHttpWiringModule } from "../../src/modules/http-wiring/runtime-http-wiring.module";

/**
 * Spec 059 FR-005 (PRD M-02): reachability inventory.
 *
 * Domain controllers (`backend/src/modules/**\/*.controller.ts`) are plain classes; HTTP routes live
 * in the Nest wiring classes (`backend/src/modules/http-wiring/*.ts`, `backend/src/runtime/
 * runtime-http.controller.ts`), which call them. A capability added to a domain controller without a
 * route is invisible to every user. This test resolves, with the TypeScript checker, every call made
 * from the wiring files and requires each public method of each domain controller to be either
 * called from there or listed in INTERNAL_ONLY with a justification.
 */

const root = path.resolve(__dirname, "..", "..", "..");
const modulesDir = path.join(root, "backend", "src", "modules");
const WIRING_FILES = [
  path.join(root, "backend", "src", "modules", "http-wiring", "runtime-http-wiring.module.ts"),
  path.join(root, "backend", "src", "modules", "http-wiring", "admin-operations-http.controllers.ts"),
  path.join(root, "backend", "src", "runtime", "runtime-http.controller.ts")
];

/** `Class.method` -> why it is deliberately not exposed over HTTP. Keep each entry justified. */
export const INTERNAL_ONLY: Record<string, string> = {
  "AdminAIModulesController.configure":
    "Not exposed on purpose (constitution V): AI modules are only switched through the compliance procedure; the admin reads them through AdminAIAssistanceController (/admin/ai-assistance).",
  "AdminAIModulesController.list":
    "Not exposed on purpose (constitution V): AI modules are only switched through the compliance procedure; the admin reads them through AdminAIAssistanceController (/admin/ai-assistance).",
  "AdminAuditLogsController.search":
    "Superseded: GET /admin/audit-logs is served by the wiring AdminAuditLogsController / spec 056 audit search, which call the audit service directly.",
  "AdminCountriesController.create":
    "Superseded: /admin/countries routes are served by AdminCatalogCountriesHttpController through CatalogAdminService (spec 050 checks and audit).",
  "AdminCountriesController.list":
    "Superseded: /admin/countries routes are served by AdminCatalogCountriesHttpController through CatalogAdminService (spec 050 checks and audit).",
  "AdminCountriesController.update":
    "Superseded: /admin/countries routes are served by AdminCatalogCountriesHttpController through CatalogAdminService (spec 050 checks and audit).",
  "AdminFeatureFlagsController.list":
    "Superseded: /admin/feature-flags routes are served by the wiring AdminFeatureFlagsController (sensitive-flag policy applied there).",
  "AdminFeatureFlagsController.update":
    "Superseded: /admin/feature-flags routes are served by the wiring AdminFeatureFlagsController (sensitive-flag policy applied there).",
  "AdminLeadAssignmentsController.detail":
    "Superseded: GET /admin/lead-assignments is served by AdminRuntimeSupportController, reassignment by AdminRoutingOperationsController (spec 056).",
  "AdminLeadAssignmentsController.list":
    "Superseded: GET /admin/lead-assignments is served by AdminRuntimeSupportController, reassignment by AdminRoutingOperationsController (spec 056).",
  "AdminNotificationsController.list":
    "Superseded: admin messaging is served by AdminMessagingProvidersController (/admin/messaging/providers, /deliveries, /test) and alerts by AdminAlertsHttpController (spec 061).",
  "AdminNotificationsController.listQuoteNotifications":
    "Superseded: admin messaging is served by AdminMessagingProvidersController (/admin/messaging/providers, /deliveries, /test) and alerts by AdminAlertsHttpController (spec 061).",
  "AdminNotificationsController.test":
    "Superseded: admin messaging is served by AdminMessagingProvidersController (/admin/messaging/providers, /deliveries, /test) and alerts by AdminAlertsHttpController (spec 061).",
  "AdminOffersController.create":
    "Superseded: /admin/offers routes are served by AdminOffersHttpController (spec 052 versioned offers and decisions).",
  "AdminOffersController.list":
    "Superseded: /admin/offers routes are served by AdminOffersHttpController (spec 052 versioned offers and decisions).",
  "AdminOffersController.update":
    "Superseded: /admin/offers routes are served by AdminOffersHttpController (spec 052 versioned offers and decisions).",
  "AdminOffersController.validate":
    "Superseded: /admin/offers routes are served by AdminOffersHttpController (spec 052 versioned offers and decisions).",
  "AdminProductsController.associateCountry":
    "Superseded: /admin/products and country links are served by AdminCatalogProductsHttpController / AdminCatalogCountriesHttpController through CatalogAdminService.",
  "AdminProductsController.create":
    "Superseded: /admin/products and country links are served by AdminCatalogProductsHttpController / AdminCatalogCountriesHttpController through CatalogAdminService.",
  "AdminProductsController.list":
    "Superseded: /admin/products and country links are served by AdminCatalogProductsHttpController / AdminCatalogCountriesHttpController through CatalogAdminService.",
  "AdminProductsController.update":
    "Superseded: /admin/products and country links are served by AdminCatalogProductsHttpController / AdminCatalogCountriesHttpController through CatalogAdminService.",
  "AdminQuoteRequestsController.list":
    "Superseded: GET /admin/quote-requests is served by AdminRuntimeSupportController and the spec 056 operations console controllers.",
  "AdminRoutingAnomaliesController.analyze":
    "Superseded: /admin/routing/anomalies and /analyze are served by AdminRoutingAnomaliesHttpController.",
  "AdminRoutingAnomaliesController.list":
    "Superseded: /admin/routing/anomalies and /analyze are served by AdminRoutingAnomaliesHttpController.",
  "AdminRoutingPrecheckController.precheck":
    "Internal: the routing precheck is evaluated by the routing engine itself and shown read-only in the activation checklist; no standalone admin route is planned (spec 049/056).",
  "AdminUsersController.createPartnerUser":
    "Superseded: broker users are invited from the partner record (POST /admin/partners/:id/users, spec 051) or by the owner (broker team, spec 053).",
  "AuthController.activate":
    "Superseded: /auth routes are served by the wiring AuthController (rate limiting, cookies-free tokens, audit), which calls the auth services directly.",
  "AuthController.enrollMfa":
    "Superseded: /auth routes are served by the wiring AuthController (rate limiting, cookies-free tokens, audit), which calls the auth services directly.",
  "AuthController.login":
    "Superseded: /auth routes are served by the wiring AuthController (rate limiting, cookies-free tokens, audit), which calls the auth services directly.",
  "AuthController.logout":
    "Superseded: /auth routes are served by the wiring AuthController (rate limiting, cookies-free tokens, audit), which calls the auth services directly.",
  "AuthController.me":
    "Superseded: /auth routes are served by the wiring AuthController (rate limiting, cookies-free tokens, audit), which calls the auth services directly.",
  "AuthController.passwordChange":
    "Superseded: /auth routes are served by the wiring AuthController (rate limiting, cookies-free tokens, audit), which calls the auth services directly.",
  "AuthController.passwordReset":
    "Superseded: /auth routes are served by the wiring AuthController (rate limiting, cookies-free tokens, audit), which calls the auth services directly.",
  "AuthController.verifyMfa":
    "Superseded: /auth routes are served by the wiring AuthController (rate limiting, cookies-free tokens, audit), which calls the auth services directly.",
  "BrokerLeadsController.detail":
    "Superseded: broker leads are served by BrokerStarterController (/broker/starter) and BrokerCrmController (/broker/crm, status pipeline for Pro).",
  "BrokerLeadsController.list":
    "Superseded: broker leads are served by BrokerStarterController (/broker/starter) and BrokerCrmController (/broker/crm, status pipeline for Pro).",
  "BrokerLeadsController.updateStatus":
    "Superseded: broker leads are served by BrokerStarterController (/broker/starter) and BrokerCrmController (/broker/crm, status pipeline for Pro).",
  "BrokerStarterController.blockedProCapability":
    "Internal guard: called by the Starter access policy to refuse a Pro capability; it is a refusal helper, not a capability.",
  "PublicCountriesController.detail":
    "Superseded: /countries routes are served by the wiring PublicCountriesController (public journey flags, directory).",
  "PublicCountriesController.list":
    "Superseded: /countries routes are served by the wiring PublicCountriesController (public journey flags, directory).",
  "PublicOffersController.detail":
    "Superseded: public offers are served by the wiring PublicOffersController (/countries/:c/products/:p/offers, /offers/:id, /offers/compare).",
  "PublicOffersController.list":
    "Superseded: public offers are served by the wiring PublicOffersController (/countries/:c/products/:p/offers, /offers/:id, /offers/compare).",
  "PublicProductsController.detail":
    "Superseded: /countries/:countryCode/products routes are served by the wiring PublicProductsController.",
  "PublicProductsController.list":
    "Superseded: /countries/:countryCode/products routes are served by the wiring PublicProductsController.",
  "PublicProductsController.listForCountry":
    "Superseded: /countries/:countryCode/products routes are served by the wiring PublicProductsController.",
  "PublicQuoteFormsController.get":
    "Superseded: the public quote form is served by the wiring public quote routes (/countries/:c/products/:p/quote-form).",
  "PublicQuoteRequestsController.submit":
    "Superseded: POST /quote-requests is served by the wiring PublicQuoteRequestsController.submitQuote.",
  "PublicQuoteStatusController.get":
    "Superseded: GET /quote-requests/:publicReference is served by the wiring PublicQuoteRequestsController.quoteStatus (visitor token, spec 054).",
  "RegulatoryRegimesController.create":
    "Superseded: /admin/regulatory-regimes routes are served by AdminRegulatoryRegimesHttpController.",
  "RegulatoryRegimesController.list":
    "Superseded: /admin/regulatory-regimes routes are served by AdminRegulatoryRegimesHttpController.",
  "RegulatoryRegimesController.retire":
    "Superseded: /admin/regulatory-regimes routes are served by AdminRegulatoryRegimesHttpController.",
  "RegulatoryRegimesController.update":
    "Superseded: /admin/regulatory-regimes routes are served by AdminRegulatoryRegimesHttpController.",
  "SystemHealthController.get":
    "Superseded: GET /admin/system/health is served by AdminHealthController; public probes by PublicHealthController (/healthz, /readyz)."
};

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return entry === "http-wiring" ? [] : controllerFiles(full);
    return entry.endsWith(".controller.ts") ? [full] : [];
  });
}

function isPublicMethod(member: ts.ClassElement): member is ts.MethodDeclaration {
  if (!ts.isMethodDeclaration(member) || !member.name || !ts.isIdentifier(member.name)) return false;
  const modifiers = ts.getModifiers(member) ?? [];
  return !modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword || modifier.kind === ts.SyntaxKind.ProtectedKeyword || modifier.kind === ts.SyntaxKind.StaticKeyword);
}

function inventory() {
  const files = controllerFiles(modulesDir);
  const program = ts.createProgram([...WIRING_FILES, ...files], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    experimentalDecorators: true,
    strict: true,
    skipLibCheck: true,
    noEmit: true
  });
  const checker = program.getTypeChecker();

  // Public methods of the domain controller classes, keyed by their declaration node.
  const methods = new Map<ts.Node, string>();
  const files_ = new Map<string, string>();
  for (const file of files) {
    const source = program.getSourceFile(file);
    if (!source) continue;
    source.forEachChild((node) => {
      if (!ts.isClassDeclaration(node) || !node.name) return;
      for (const member of node.members) {
        if (isPublicMethod(member)) {
          methods.set(member, `${node.name.text}.${(member.name as ts.Identifier).text}`);
          files_.set(node.name.text, file);
        }
      }
    });
  }

  const classNames = new Map<ts.Node, string>();
  for (const [declaration] of methods) {
    const owner = declaration.parent;
    if (ts.isClassDeclaration(owner) && owner.name) classNames.set(owner, owner.name.text);
  }

  // Every call (or method reference) made from the wiring files, resolved to its declaration, and
  // every domain class decorated in place as a Nest controller: `decorate(Class, "method", [Get()])`.
  const wired = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "decorate") {
      const [target, method] = node.arguments;
      if (target && method && ts.isIdentifier(target) && ts.isStringLiteral(method)) {
        let symbol = checker.getSymbolAtLocation(target);
        if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
        for (const declaration of symbol?.declarations ?? []) {
          const className = classNames.get(declaration);
          if (className) wired.add(`${className}.${method.text}`);
        }
      }
    }
    if (ts.isPropertyAccessExpression(node)) {
      let symbol = checker.getSymbolAtLocation(node.name);
      if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
      for (const declaration of symbol?.declarations ?? []) {
        const name = methods.get(declaration);
        if (name) wired.add(name);
      }
    }
    ts.forEachChild(node, visit);
  };
  for (const file of WIRING_FILES) {
    const source = program.getSourceFile(file);
    if (source) visit(source);
  }
  return { all: [...methods.values()].sort(), wired, files: files_ };
}

/**
 * A domain class may also BE the Nest controller (decorated in its own file, e.g. the health and
 * metrics endpoints): its method is then a route handler when Nest's path metadata is set on it and
 * the class is registered in RuntimeHttpWiringModule.
 */
async function selfRoutedMethods(names: string[], files: Map<string, string>): Promise<Set<string>> {
  const registered = new Set<unknown>((Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, RuntimeHttpWiringModule) as unknown[] | undefined) ?? []);
  const routed = new Set<string>();
  for (const name of names) {
    const [className, method] = name.split(".") as [string, string];
    const file = files.get(className);
    if (!file) continue;
    const exported = (await import(file)) as Record<string, unknown>;
    const target = exported[className] as { prototype: Record<string, unknown> } | undefined;
    if (!target || !registered.has(target)) continue;
    const handler = target.prototype[method];
    if (typeof handler === "function" && Reflect.getMetadata(PATH_METADATA, handler) !== undefined) routed.add(name);
  }
  return routed;
}

describe("controller reachability inventory (spec 059 FR-005)", async () => {
  const { all, wired, files } = inventory();
  for (const name of await selfRoutedMethods(all, files)) wired.add(name);

  it("finds the domain controllers and their public methods", () => {
    expect(all.length).toBeGreaterThan(50);
  });

  it("wires every public domain controller method over HTTP, or justifies it in INTERNAL_ONLY", () => {
    const unreachable = all.filter((name) => !wired.has(name) && !(name in INTERNAL_ONLY));
    expect(unreachable, "add a route in http-wiring, or an INTERNAL_ONLY entry with its justification").toEqual([]);
  });

  it("keeps INTERNAL_ONLY honest: every entry exists, is really unwired and carries a justification", () => {
    for (const [name, why] of Object.entries(INTERNAL_ONLY)) {
      expect(all, `${name} is not a domain controller method any more`).toContain(name);
      expect(wired.has(name), `${name} is wired: remove it from INTERNAL_ONLY`).toBe(false);
      expect(why.trim().length, `${name} needs a justification`).toBeGreaterThan(20);
    }
  });
});
