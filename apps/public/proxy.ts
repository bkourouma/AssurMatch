import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // `aller` is a locale-agnostic GET redirector handled by a route handler, so it stays out of the
  // locale rewrite; everything else that is not an asset or an internal Next path is localised.
  matcher: "/((?!api|aller|_next|_vercel|.*\\..*).*)"
};
