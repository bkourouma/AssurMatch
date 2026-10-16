"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  BACKOFFICE_TOKEN_COOKIE,
  backOfficeApiBaseUrl,
  clearTrustedDeviceCookie,
  readTrustedDeviceToken,
  sanitizeReturnTo
} from "./backoffice-auth";
import { loginBackOffice } from "./broker-api";

interface LoginResponse {
  accessToken?: string;
  mfaRequired?: boolean;
  trustedDeviceRejected?: boolean;
}

// Source marker for auth-session tests: /auth/login

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

export async function loginAction(formData: FormData): Promise<void> {
  const email = stringValue(formData.get("email")).trim();
  const password = stringValue(formData.get("password"));
  const returnTo = sanitizeReturnTo(stringValue(formData.get("returnTo")));

  // Spec 063 (FR-A04): the trusted-device cookie of THIS app is forwarded in the body; the API decides.
  const trustedDeviceToken = await readTrustedDeviceToken();
  const session = await loginBackOffice(email, password, trustedDeviceToken) as LoginResponse & { status?: string };
  if (session.trustedDeviceRejected) await clearTrustedDeviceCookie();
  if (session.status && session.status !== "success" && session.status !== "mfa_required") {
    redirect(`/login?error=${encodeURIComponent(session.status)}&returnTo=${encodeURIComponent(returnTo)}`);
  }
  if (!session.accessToken) redirect(`/login?error=invalid_session&returnTo=${encodeURIComponent(returnTo)}`);

  const cookieStore = await cookies();
  cookieStore.set({
    name: BACKOFFICE_TOKEN_COOKIE,
    value: session.accessToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 15 * 60
  });

  if (session.mfaRequired) redirect(`/mfa?returnTo=${encodeURIComponent(returnTo)}`);
  redirect(returnTo);
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(BACKOFFICE_TOKEN_COOKIE)?.value;
  if (token) {
    try {
      await fetch(`${backOfficeApiBaseUrl()}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store"
      });
    } catch {
      // Local session cleanup remains authoritative for frontend logout.
    }
  }
  // The trusted-device cookie is kept on purpose: the 30-day trust survives logout (spec 063, FR-A04).
  cookieStore.delete(BACKOFFICE_TOKEN_COOKIE);
  redirect("/login?reason=logged_out");
}
