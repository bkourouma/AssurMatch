"use server";

import { cookies } from "next/headers";
import { VISITOR_COUNTRY_COOKIE } from "./visitor-country";

const SIX_MONTHS_IN_SECONDS = 180 * 24 * 60 * 60;

/**
 * Stores the country chosen by the visitor. Progressive enhancement: the compact country selector is
 * a plain form, so switching country works without JavaScript.
 */
export async function setVisitorCountry(formData: FormData): Promise<void> {
  const raw = formData.get("countryIso");
  const iso = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(iso)) return;

  const cookieStore = await cookies();
  cookieStore.set(VISITOR_COUNTRY_COOKIE, iso, {
    maxAge: SIX_MONTHS_IN_SECONDS,
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production"
  });
}
