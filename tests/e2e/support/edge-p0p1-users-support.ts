import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, type Browser } from "@playwright/test";
import { adminToken, api, itemsOfBody, rec } from "./admin-lot11";
import { createAdminAccount, EDGE_REASON, sharedCountryId, sharedSuperAdmin, userIdByEmail, type EdgeAccount } from "./edge-p0p1-accounts";
import { sessionPage, type ApiResult } from "./pro-roles";
import { uniqueSuffix } from "./ui";

// Lot 2, spec edge-p0-p1-users: shared world of the file (throwaway accounts + targets) persisted in a JSON file
// because Playwright restarts the worker after every red test (confirmed bug) and the module state would be lost.
// The file is keyed by the runner process id (a worker's parent), so each run starts from a fresh world.

export const SUPER_REASON = EDGE_REASON;

export interface WorldAccount extends EdgeAccount {
  id: string;
}

export interface Created {
  id: string;
  email: string;
  /** Roles the user was created with (restored at the end if the tests changed them). */
  roles: string[];
}

export interface World {
  tag: string;
  accounts: Record<"ap" | "ca2" | "su" | "fa" | "s2" | "s3", WorldAccount>;
  targets: Record<"t1" | "t2" | "t3", Created>;
  created: Created[];
}

const STATE_DIR = path.resolve(".local", "e2e");

function stateFile(): string {
  return path.join(STATE_DIR, `edge-users-${process.ppid}.json`);
}

function readWorld(): World | undefined {
  const file = stateFile();
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, "utf8")) as World;
}

export function saveWorld(world: World): void {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(stateFile(), JSON.stringify(world, null, 2));
}

/** Registers a user created by the tests so that the final cleanup restores its roles and suspends it. */
export function register(world: World, created: Created): void {
  world.created.push(created);
  saveWorld(world);
}

export async function superToken(browser: Browser): Promise<string> {
  return adminToken(browser, sharedSuperAdmin());
}

export async function tokenOf(browser: Browser, account: WorldAccount): Promise<string> {
  return adminToken(browser, account);
}

export interface CreateUserInput {
  roles: string[];
  label: string;
  displayName?: string;
  countryIds?: string[];
  reason?: string;
}

export async function createUserApi(token: string, input: CreateUserInput): Promise<{ result: ApiResult; created?: Created }> {
  const email = `l2.${input.label}.${uniqueSuffix()}@e2e.assurmatch.test`;
  const result = await api(token, "POST", "/admin/users", {
    email,
    displayName: input.displayName ?? `E2E Courtage L2 ${input.label}`,
    roles: input.roles,
    partnerTenantId: null,
    scopes: { countryIds: input.countryIds ?? [], productIds: [] },
    reason: input.reason ?? EDGE_REASON
  });
  if (result.status >= 300) return { result };
  const user = rec(rec(result.body).user);
  return { result, created: { id: String(user.id), email, roles: input.roles } };
}

export async function userRoles(token: string, userId: string): Promise<{ roles: string[]; status: string }> {
  const detail = await api(token, "GET", `/admin/users/${userId}`);
  const body = rec(detail.body);
  return { roles: Array.isArray(body.roles) ? (body.roles as string[]) : [], status: String(body.status ?? "") };
}

export function roleUpdate(token: string, userId: string, roles: string[], reason = EDGE_REASON): Promise<ApiResult> {
  return api(token, "POST", `/admin/users/${userId}/role-update`, { roles, reason });
}

export function lifecycle(token: string, userId: string, action: "suspend" | "unsuspend" | "lock" | "unlock", reason = EDGE_REASON): Promise<ApiResult> {
  return api(token, "POST", `/admin/users/${userId}/${action}`, { reason });
}

/** Adds a machine-readable anomaly note to the running test (a confirmed product bug that keeps the test red). */
export function anomaly(description: string): void {
  test.info().annotations.push({ type: "anomaly", description });
}

export function hypothesis(description: string): void {
  test.info().annotations.push({ type: "hypothesis", description });
}

export function note(type: string, description: string): void {
  test.info().annotations.push({ type, description });
}

/**
 * The world of the file: created once (6 throwaway admin accounts activated through the real screens, 3 target
 * users created through the API), then read back from the state file after a worker restart.
 */
export async function world(browser: Browser): Promise<World> {
  const known = readWorld();
  if (known) return known;
  const superAdmin = sharedSuperAdmin();
  const creatorPage = await sessionPage(browser, superAdmin);
  const countryId = sharedCountryId();
  const tag = `E2E Courtage L2-${Date.now()}`;
  const make = async (roles: string[], label: string, countryIds?: string[]): Promise<WorldAccount> => {
    const account = await createAdminAccount(browser, { roles, label, creatorPage, ...(countryIds ? { countryIds } : {}) });
    return { ...account, id: "" };
  };
  const accounts = {
    ap: await make(["admin_pays"], "apays", [countryId]),
    ca2: await make(["compliance_admin"], "compl"),
    su: await make(["support_admin"], "supp"),
    fa: await make(["finance_admin"], "fina"),
    s2: await make(["super_admin"], "sup2"),
    s3: await make(["super_admin"], "sup3")
  };
  const token = await superToken(browser);
  for (const account of Object.values(accounts)) account.id = await userIdByEmail(token, account.email);
  const target = async (label: string, countryIds: string[]): Promise<Created> => {
    const { result, created } = await createUserApi(token, { roles: ["content_admin"], label, countryIds, displayName: `${tag} ${label}` });
    if (!created) throw new Error(`cannot create target ${label}: ${result.status} ${result.text.slice(0, 200)}`);
    return created;
  };
  const targets = { t1: await target("tgt1", [countryId]), t2: await target("tgt2", []), t3: await target("tgt3", [countryId]) };
  const built: World = {
    tag,
    accounts,
    targets,
    created: [
      ...Object.values(accounts).map((account) => ({ id: account.id, email: account.email, roles: [] as string[] })),
      ...Object.values(targets)
    ]
  };
  built.created[0] = { id: accounts.ap.id, email: accounts.ap.email, roles: ["admin_pays"] };
  built.created[1] = { id: accounts.ca2.id, email: accounts.ca2.email, roles: ["compliance_admin"] };
  built.created[2] = { id: accounts.su.id, email: accounts.su.email, roles: ["support_admin"] };
  built.created[3] = { id: accounts.fa.id, email: accounts.fa.email, roles: ["finance_admin"] };
  built.created[4] = { id: accounts.s2.id, email: accounts.s2.email, roles: ["super_admin"] };
  built.created[5] = { id: accounts.s3.id, email: accounts.s3.email, roles: ["super_admin"] };
  saveWorld(built);
  return built;
}

/** Final cleanup with the shared Super Admin: restore the roles of every user the tests touched, then suspend them. */
export async function cleanup(browser: Browser): Promise<string[]> {
  const known = readWorld();
  if (!known) return [];
  const token = await superToken(browser);
  const report: string[] = [];
  for (const entry of known.created) {
    const before = await userRoles(token, entry.id);
    if (before.status === "deleted") {
      report.push(`${entry.email}: deleted`);
      continue;
    }
    if (entry.roles.length > 0 && entry.roles.join() !== before.roles.join()) {
      const restored = await roleUpdate(token, entry.id, entry.roles);
      report.push(`${entry.email}: roles ${before.roles.join("+")} -> ${entry.roles.join("+")} (${restored.status})`);
    }
    const suspended = await lifecycle(token, entry.id, "suspend");
    report.push(`${entry.email}: suspend ${suspended.status}`);
  }
  return report;
}

export function itemsOf(body: unknown): Array<Record<string, unknown>> {
  return itemsOfBody(body);
}
