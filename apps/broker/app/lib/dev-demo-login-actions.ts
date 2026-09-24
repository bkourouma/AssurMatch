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
import { isBrokerDemoAccountEmail, isLocalBrokerDemoLoginEnabled } from "./dev-demo-accounts";

interface DemoUserRow {
  id: string;
  email: string;
  partnerTenantId: string | null;
  countryScopes: string[];
  productScopes: string[];
  userRoles?: Array<{ role?: { key: string } | null }>;
}

interface DemoPartnerRow {
  id: string;
  plan: "starter" | "pro" | "enterprise";
}

const DEMO_LOGIN_ACTION = "local_demo_broker_login.selected";

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

export async function devDemoLoginAction(formData: FormData): Promise<void> {
  const email = stringValue(formData.get("demoEmail")).trim();
  const returnTo = sanitizeReturnTo(stringValue(formData.get("returnTo")));

  if (!isLocalBrokerDemoLoginEnabled()) redirect(`/login?error=dev_login_disabled&returnTo=${encodeURIComponent(returnTo)}`);
  if (!isBrokerDemoAccountEmail(email)) redirect(`/login?error=dev_login_invalid&returnTo=${encodeURIComponent(returnTo)}`);

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) redirect(`/login?error=dev_login_database&returnTo=${encodeURIComponent(returnTo)}`);

  const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { userRoles: { include: { role: true } } }
    }) as DemoUserRow | null;

    if (!user?.partnerTenantId) {
      await writeAudit(prisma, email, "refused", "demo_user_missing_partner", {});
      redirect(`/login?error=dev_login_missing_seed&returnTo=${encodeURIComponent(returnTo)}`);
    }

    const partner = await prisma.partnerTenant.findUnique({ where: { id: user.partnerTenantId } }) as DemoPartnerRow | null;
    const roles = user.userRoles?.map((entry) => entry.role?.key).filter(isAssurMatchRole) ?? [];
    if (!partner || roles.length === 0 || !roles.some((role) => role.startsWith("broker_"))) {
      await writeAudit(prisma, email, "refused", "demo_user_not_broker", { partnerTenantId: user.partnerTenantId, roles });
      redirect(`/login?error=dev_login_missing_seed&returnTo=${encodeURIComponent(returnTo)}`);
    }

    const token = signActorToken({
      actorId: user.id,
      roles,
      partnerTenantId: user.partnerTenantId,
      partnerPlan: partner.plan,
      countryScopes: user.countryScopes,
      productScopes: user.productScopes,
      mfaVerified: true,
      correlationId: "local-demo-login"
    }, 15 * 60);

    await writeAudit(prisma, email, "success", "local_demo_login", {
      userId: user.id,
      partnerTenantId: user.partnerTenantId,
      partnerPlan: partner.plan,
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
      actorId: "local-demo-login",
      action: DEMO_LOGIN_ACTION,
      targetType: "User",
      targetId: email,
      scope: jsonObject({ environment: "local", surface: "broker" }),
      result,
      reason,
      context: jsonObject(context),
      correlationId: "local-demo-login",
      retentionUntil: new Date("2036-01-01T00:00:00.000Z")
    }
  });
}

function jsonObject(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}
