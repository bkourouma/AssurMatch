"use server";

import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signActorToken } from "../../../../backend/src/modules/auth/http-auth-token.service";
import type { AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { BACKOFFICE_TOKEN_COOKIE, sanitizeReturnTo } from "./backoffice-auth";
import { isAdminDemoAccountEmail, isLocalAdminDemoLoginEnabled } from "./dev-demo-accounts";

interface DemoUserRow {
  id: string;
  email: string;
  countryScopes: string[];
  productScopes: string[];
  userRoles?: Array<{ role?: { key: string } | null }>;
}

const ADMIN_DEMO_ROLES = new Set<AssurMatchRole>(["super_admin", "admin_pays", "compliance_admin", "support_admin", "finance_admin", "content_admin", "ai_admin"]);
const DEMO_LOGIN_ACTION = "local_demo_admin_login.selected";

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

export async function devDemoLoginAction(formData: FormData): Promise<void> {
  const email = stringValue(formData.get("demoEmail")).trim();
  const returnTo = sanitizeReturnTo(stringValue(formData.get("returnTo")));

  if (!isLocalAdminDemoLoginEnabled()) redirect(`/login?error=dev_login_disabled&returnTo=${encodeURIComponent(returnTo)}`);
  if (!isAdminDemoAccountEmail(email)) redirect(`/login?error=dev_login_invalid&returnTo=${encodeURIComponent(returnTo)}`);

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) redirect(`/login?error=dev_login_database&returnTo=${encodeURIComponent(returnTo)}`);

  const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { userRoles: { include: { role: true } } }
    }) as DemoUserRow | null;

    const roles = user?.userRoles?.map((entry) => entry.role?.key).filter(isAssurMatchRole) ?? [];
    if (!user || roles.length === 0 || !roles.some((role) => ADMIN_DEMO_ROLES.has(role))) {
      await writeAudit(prisma, email, "refused", "demo_user_not_admin", { roles });
      redirect(`/login?error=dev_login_missing_seed&returnTo=${encodeURIComponent(returnTo)}`);
    }

    const token = signActorToken({
      actorId: user.id,
      roles,
      countryScopes: user.countryScopes,
      productScopes: user.productScopes,
      mfaVerified: true,
      correlationId: "local-demo-admin-login"
    }, 15 * 60);

    await writeAudit(prisma, email, "success", "local_demo_login", {
      userId: user.id,
      roles
    });

    const cookieStore = await cookies();
    cookieStore.set({
      name: BACKOFFICE_TOKEN_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 15 * 60
    });
  } finally {
    await prisma.$disconnect();
  }

  redirect(returnTo);
}

function isAssurMatchRole(value: string | undefined): value is AssurMatchRole {
  return value === "super_admin" ||
    value === "admin_pays" ||
    value === "compliance_admin" ||
    value === "support_admin" ||
    value === "broker_owner_starter" ||
    value === "broker_owner_pro" ||
    value === "broker_manager" ||
    value === "broker_agent" ||
    value === "broker_read_only" ||
    value === "finance_admin" ||
    value === "content_admin" ||
    value === "ai_admin";
}

async function writeAudit(prisma: PrismaClient, email: string, result: "success" | "refused", reason: string, context: Record<string, unknown>): Promise<void> {
  await prisma.auditLog.create({
    data: {
      id: randomUUID(),
      actorId: "local-demo-admin-login",
      action: DEMO_LOGIN_ACTION,
      targetType: "User",
      targetId: email,
      scope: jsonObject({ environment: "local", surface: "admin" }),
      result,
      reason,
      context: jsonObject(context),
      correlationId: "local-demo-admin-login",
      retentionUntil: new Date("2036-01-01T00:00:00.000Z")
    }
  });
}

function jsonObject(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}
