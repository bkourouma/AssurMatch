import { getTranslations } from "next-intl/server";
import { RouteStrip, type RouteStripStop } from "../ui/route-line";

/** The five stops of the visitor journey, in the order the visitor walks them. */
export type JourneyStop = "country" | "product" | "offers" | "request" | "broker";

const ORDER: readonly JourneyStop[] = ["country", "product", "offers", "request", "broker"];

/** Only a well-formed country code or product key ever becomes a link back. */
const ISO_CODE = /^[A-Za-z]{2}$/;
const PRODUCT_KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export interface JourneyRouteProps {
  /** `start` = no step taken yet (the home page): the tape shows the way ahead with no current stop. */
  current: JourneyStop | "start";
  /** Known country of the journey: the stops before the current one link back to it. */
  countryCode?: string | undefined;
  /** Known product of the journey (needs the country). */
  productKey?: string | undefined;
}

/**
 * « Vous êtes ici » strip of a journey page, printed on its navy sign through the Hero `route` slot.
 * Stops already passed link back when their destination is known (country, product, offers);
 * stops whose destination the page cannot know (the tracking page knows neither) stay plain text.
 */
export async function JourneyRoute({ current, countryCode, productKey }: JourneyRouteProps) {
  const t = await getTranslations("Route");
  const country = countryCode && ISO_CODE.test(countryCode) ? countryCode : undefined;
  const product = country && productKey && PRODUCT_KEY.test(productKey) ? productKey : undefined;

  const hrefs: Partial<Record<JourneyStop, NonNullable<RouteStripStop["href"]>>> = {};
  if (country) {
    hrefs.country = { pathname: "/countries/[countryCode]", params: { countryCode: country } };
  }
  if (country && product) {
    const params = { countryCode: country, productKey: product };
    hrefs.product = { pathname: "/countries/[countryCode]/products/[productKey]", params };
    hrefs.offers = { pathname: "/countries/[countryCode]/products/[productKey]/offers", params };
    hrefs.request = { pathname: "/countries/[countryCode]/products/[productKey]/quote", params };
  }

  const currentIndex = current === "start" ? -1 : ORDER.indexOf(current);
  const stops: RouteStripStop[] = ORDER.map((key, index) => {
    const state = index < currentIndex ? "done" : index === currentIndex ? "current" : "todo";
    const href = hrefs[key];
    return { key, label: t(key), state, ...(state === "done" && href ? { href } : {}) };
  });

  return <RouteStrip stops={stops} label={t("label")} currentLabel={t("current")} />;
}
