"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BACKOFFICE_TOKEN_COOKIE, backOfficeApiBaseUrl, sanitizeReturnTo } from "./backoffice-auth";

interface LoginResponse {
  accessToken?: string;
  mfaRequired?: boolean;
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

export async function loginAction(formData: FormData): Promise<void> {
  const email = stringValue(formData.get("email")).trim();
  const password = stringValue(formData.get("password"));
  const returnTo = sanitizeReturnTo(stringValue(formData.get("returnTo")));

  const response = await fetch(`${backOfficeApiBaseUrl()}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store"
  });

  if (!response.ok) {
    redirect(`/login?error=invalid_credentials&returnTo=${encodeURIComponent(returnTo)}`);
  }

  const session = (await response.json()) as LoginResponse;
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

  if (session.mfaRequired) redirect(`/login?mfa=required&returnTo=${encodeURIComponent(returnTo)}`);
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
  cookieStore.delete(BACKOFFICE_TOKEN_COOKIE);
  redirect("/login?reason=logged_out");
}
