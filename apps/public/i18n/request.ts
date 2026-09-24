import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

/** Every public page renders in the visitor's locale; times are displayed in the pilot time zone. */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const messages = locale === "en" ? (await import("../messages/en.json")).default : (await import("../messages/fr.json")).default;

  return { locale, messages, timeZone: "Africa/Abidjan" };
});
