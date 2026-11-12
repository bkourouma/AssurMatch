"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ERROR_MESSAGES, authErrorMessage, friendlyErrorMessage, type AuthErrorContext } from "./auth-error-messages";
import { activateWithToken, changePassword, consumePasswordReset, enrollMfa, revokeTrustedDevices, verifyMfa } from "./admin-api";
import {
  BACKOFFICE_TOKEN_COOKIE,
  clearTrustedDeviceCookie,
  deviceLabelFromUserAgent,
  sanitizeReturnTo,
  setTrustedDeviceCookie
} from "./backoffice-auth";

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

function errorState(error: unknown, context: AuthErrorContext = "generic"): AuthFlowState {
  return { status: "error", message: friendlyErrorMessage(error, context) };
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
  if (session.status !== "success" && session.status !== "mfa_required") {
    // Activation: a refused password (400/422) reads as the password policy, any other refusal as an unusable link.
    return { status: "error", message: authErrorMessage({ status: session.httpStatus, code: session.code }, "activate") };
  }
  if (!session.accessToken) return { status: "error", message: ERROR_MESSAGES.fallback };
  await setBackOfficeCookie(session.accessToken);
  // Activation sets a new password: the API revokes every trusted device, so drop the stale local cookie too.
  await clearTrustedDeviceCookie();
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
    // Spec 063 (FR-A02/A04): "trust this device" is opt-in; the label is coarse (browser + OS), never an IP.
    const trustDevice = formData.get("trustDevice") === "on";
    const deviceLabel = trustDevice ? deviceLabelFromUserAgent((await headers()).get("user-agent")) : undefined;
    const session = await verifyMfa(
      stringValue(formData.get("code")),
      stringValue(formData.get("kind")) === "backup" ? "backup" : "totp",
      trustDevice ? { trustDevice, deviceLabel: deviceLabel ?? "" } : {}
    );
    if (!session.accessToken) return { status: "error", message: ERROR_MESSAGES.fallback };
    await setBackOfficeCookie(session.accessToken);
    if (trustDevice && session.trustedDevice?.token) await setTrustedDeviceCookie(session.trustedDevice.token, session.trustedDevice.expiresAt);
  } catch (error) {
    return errorState(error, "mfa");
  }
  redirect(returnTo);
}

export async function passwordChangeAction(_previous: AuthFlowState, formData: FormData): Promise<AuthFlowState> {
  try {
    await changePassword(stringValue(formData.get("oldPassword")), stringValue(formData.get("newPassword")));
    // The API revokes every trusted device on a password change (FR-A06).
    await clearTrustedDeviceCookie();
    return { status: "success", message: "Mot de passe modifié." };
  } catch (error) {
    return errorState(error, "password_change");
  }
}

export async function passwordResetConsumeAction(_previous: AuthFlowState, formData: FormData): Promise<AuthFlowState> {
  try {
    await consumePasswordReset(stringValue(formData.get("token")), stringValue(formData.get("newPassword")));
    await clearTrustedDeviceCookie();
    return { status: "success", message: "Mot de passe réinitialisé. Vous pouvez vous connecter." };
  } catch (error) {
    return errorState(error, "reset");
  }
}

/** "Révoquer tous les appareils de confiance" (FR-A06): server-side revocation, then forget the local cookie. */
export async function revokeTrustedDevicesAction(_previous: AuthFlowState): Promise<AuthFlowState> {
  const result = await revokeTrustedDevices();
  if (result.ok === false) return { status: "error", message: result.error === "session_required" ? "Session expirée. Reconnectez-vous." : "Révocation impossible pour le moment. Réessayez plus tard." };
  await clearTrustedDeviceCookie();
  revalidatePath("/account/security");
  return {
    status: "success",
    message: result.revoked === 0
      ? "Aucun appareil de confiance n'était actif. Le code vous sera demandé à chaque connexion."
      : `${result.revoked} appareil${result.revoked > 1 ? "s" : ""} de confiance révoqué${result.revoked > 1 ? "s" : ""}. Le code vous sera demandé à la prochaine connexion.`
  };
}
