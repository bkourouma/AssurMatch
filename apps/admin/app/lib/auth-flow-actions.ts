"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { activateWithToken, changePassword, consumePasswordReset, enrollMfa, verifyMfa } from "./admin-api";
import { BACKOFFICE_TOKEN_COOKIE, sanitizeReturnTo } from "./backoffice-auth";

export interface AuthFlowState {
  status: "idle" | "success" | "error";
  message?: string;
  secret?: string;
  otpauthUri?: string;
  backupCodes?: string[];
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function errorState(error: unknown): AuthFlowState {
  return {
    status: "error",
    message: error instanceof Error ? error.message : "action_failed"
  };
}

async function setBackOfficeCookie(accessToken: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set({
    name: BACKOFFICE_TOKEN_COOKIE,
    value: accessToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 15 * 60
  });
}

export async function activateAction(_previous: AuthFlowState, formData: FormData): Promise<AuthFlowState> {
  const returnTo = sanitizeReturnTo(stringValue(formData.get("returnTo")));
  const session = await activateWithToken(stringValue(formData.get("token")), stringValue(formData.get("password")));
  if (session.status === "validation_error") return { status: "error", message: "validation_error" };
  if (session.status !== "success" && session.status !== "mfa_required") return { status: "error", message: session.error ?? session.status };
  if (!session.accessToken) return { status: "error", message: "invalid_session" };
  await setBackOfficeCookie(session.accessToken);
  redirect(`/mfa?returnTo=${encodeURIComponent(returnTo)}`);
}

export async function enrollMfaAction(_previous: AuthFlowState): Promise<AuthFlowState> {
  try {
    const challenge = await enrollMfa();
    return {
      status: "success",
      message: "MFA enrollment challenge issued.",
      secret: challenge.secret,
      otpauthUri: challenge.otpauthUri,
      backupCodes: challenge.backupCodes
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function verifyMfaAction(_previous: AuthFlowState, formData: FormData): Promise<AuthFlowState> {
  const returnTo = sanitizeReturnTo(stringValue(formData.get("returnTo")));
  try {
    const session = await verifyMfa(stringValue(formData.get("code")), stringValue(formData.get("kind")) === "backup" ? "backup" : "totp") as { accessToken?: string };
    if (!session.accessToken) return { status: "error", message: "invalid_session" };
    await setBackOfficeCookie(session.accessToken);
  } catch (error) {
    return errorState(error);
  }
  redirect(returnTo);
}

export async function passwordChangeAction(_previous: AuthFlowState, formData: FormData): Promise<AuthFlowState> {
  try {
    await changePassword(stringValue(formData.get("oldPassword")), stringValue(formData.get("newPassword")));
    return { status: "success", message: "Mot de passe modifie." };
  } catch (error) {
    return errorState(error);
  }
}

export async function passwordResetConsumeAction(_previous: AuthFlowState, formData: FormData): Promise<AuthFlowState> {
  try {
    await consumePasswordReset(stringValue(formData.get("token")), stringValue(formData.get("newPassword")));
    return { status: "success", message: "Mot de passe reinitialise. Vous pouvez vous connecter." };
  } catch (error) {
    return errorState(error);
  }
}
