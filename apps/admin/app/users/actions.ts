"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminUser, issueAdminUserPasswordReset, runAdminUserAction, updateAdminUser, updateAdminUserRoles } from "../lib/admin-api";

export interface UserActionState {
  status: "idle" | "success" | "error";
  message?: string;
  token?: string;
  expiresAt?: string;
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: FormDataEntryValue | null): string | undefined {
  const text = stringValue(value);
  return text ? text : undefined;
}

function csvValues(value: FormDataEntryValue | null): string[] {
  return stringValue(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formRoles(formData: FormData): string[] {
  const roles = formData.getAll("roles").map((role) => String(role).trim()).filter(Boolean);
  return roles.length > 0 ? roles : csvValues(formData.get("rolesCsv"));
}

function actionError(error: unknown): UserActionState {
  return {
    status: "error",
    message: error instanceof Error ? error.message : "action_failed"
  };
}

export async function createAdminUserAction(_previous: UserActionState, formData: FormData): Promise<UserActionState> {
  try {
    const phone = optionalString(formData.get("phone"));
    const partnerTenantId = optionalString(formData.get("partnerTenantId"));
    const result = await createAdminUser({
      email: stringValue(formData.get("email")),
      displayName: stringValue(formData.get("displayName")),
      ...(phone ? { phone } : {}),
      roles: formRoles(formData),
      partnerTenantId: partnerTenantId ?? null,
      scopes: {
        countryIds: csvValues(formData.get("countryScopes")),
        productIds: csvValues(formData.get("productScopes"))
      },
      reason: stringValue(formData.get("reason"))
    });
    revalidatePath("/users");
    return {
      status: "success",
      message: `Utilisateur ${result.user.email} cree. Livraison activation: ${result.emailStatus}.`,
      ...(result.token ? { token: result.token } : {}),
      expiresAt: result.expiresAt
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateAdminUserProfileAction(formData: FormData): Promise<void> {
  const userId = stringValue(formData.get("userId"));
  const displayName = optionalString(formData.get("displayName"));
  const phone = optionalString(formData.get("phone"));
  await updateAdminUser(userId, {
    ...(displayName ? { displayName } : {}),
    ...(phone ? { phone } : {}),
    scopes: {
      countryIds: csvValues(formData.get("countryScopes")),
      productIds: csvValues(formData.get("productScopes"))
    },
    reason: stringValue(formData.get("reason"))
  });
  revalidatePath("/users");
  revalidatePath(`/users/${userId}`);
  redirect(`/users/${encodeURIComponent(userId)}?notice=profile_updated`);
}

export async function updateAdminUserRolesAction(formData: FormData): Promise<void> {
  const userId = stringValue(formData.get("userId"));
  await updateAdminUserRoles(userId, {
    roles: formRoles(formData),
    reason: stringValue(formData.get("reason"))
  });
  revalidatePath("/users");
  revalidatePath(`/users/${userId}`);
  redirect(`/users/${encodeURIComponent(userId)}?notice=roles_updated`);
}

export async function adminUserLifecycleAction(formData: FormData): Promise<void> {
  const userId = stringValue(formData.get("userId"));
  const action = stringValue(formData.get("action")) as "suspend" | "unsuspend" | "lock" | "unlock" | "mfa-reset" | "delete";
  await runAdminUserAction(userId, action, stringValue(formData.get("reason")));
  revalidatePath("/users");
  revalidatePath(`/users/${userId}`);
  redirect(`/users/${encodeURIComponent(userId)}?notice=${encodeURIComponent(action)}`);
}

export async function passwordResetAction(_previous: UserActionState, formData: FormData): Promise<UserActionState> {
  try {
    const result = await issueAdminUserPasswordReset(stringValue(formData.get("userId")), stringValue(formData.get("reason")));
    return {
      status: "success",
      message: `Reinitialisation demandee. Livraison: ${result.emailStatus}.`,
      ...(result.token ? { token: result.token } : {}),
      expiresAt: result.expiresAt
    };
  } catch (error) {
    return actionError(error);
  }
}
