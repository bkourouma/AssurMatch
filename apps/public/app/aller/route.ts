import { NextResponse } from "next/server";
import { getPathname } from "../../i18n/navigation";
import { routing } from "../../i18n/routing";

/**
 * Entry redirector for the no-JavaScript country/product selector: GET /aller?pays=CI&produit=auto
 * resolves to the localised product page. Anything invalid falls back to the countries page.
 */
export function GET(request: Request): NextResponse {
  const url = new URL(request.url);
  const countryCode = (url.searchParams.get("pays") ?? "").trim().toUpperCase();
  const productKey = (url.searchParams.get("produit") ?? "").trim().toLowerCase();
  const locale = routing.defaultLocale;

  if (!/^[A-Z]{2}$/.test(countryCode) || !/^[a-z0-9_-]{1,64}$/.test(productKey)) {
    return NextResponse.redirect(new URL(getPathname({ locale, href: "/countries" }), url), 302);
  }

  const target = getPathname({
    locale,
    href: { pathname: "/countries/[countryCode]/products/[productKey]", params: { countryCode, productKey } }
  });
  return NextResponse.redirect(new URL(target, url), 302);
}
