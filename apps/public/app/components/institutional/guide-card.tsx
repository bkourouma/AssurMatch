import { Link } from "../../../i18n/navigation";
import { Card, CardBody, CardFooter, CardMeta, CardTitle } from "../ui/card";
import { Icon, type IconName } from "../ui/icons";
import { IconTile } from "../ui/icon-tile";

/**
 * Editorial guide card, shared by the guides index and the home page preview.
 *
 * The glyph is chosen from the guide slug, which is stable editorial data; an unknown slug falls back
 * to the generic "book" tile rather than rendering nothing.
 */
const GUIDE_ICONS: Record<string, IconName> = {
  "assurance-auto": "car",
  "assurance-voyage": "plane",
  "lire-un-prix-indicatif": "receipt",
  "choisir-un-courtier": "handshake"
};

export interface GuideCardProps {
  slug: string;
  title: string;
  description: string;
  /** Already formatted, e.g. "Mis a jour le 19 septembre 2026". */
  meta: string;
  readLabel: string;
  /** `h2` on the guides index, where the cards are the page's main headings. */
  titleAs?: "h2" | "h3";
}

export function GuideCard({ slug, title, description, meta, readLabel, titleAs = "h3" }: GuideCardProps) {
  return (
    <Card as="li" interactive className="am-guidecard">
      <IconTile name={GUIDE_ICONS[slug] ?? "book-open"} size="lg" />
      <CardTitle as={titleAs}>
        <Link href={{ pathname: "/guides/[slug]", params: { slug } }}>{title}</Link>
      </CardTitle>
      <CardBody>
        <p>{description}</p>
      </CardBody>
      <CardFooter>
        <CardMeta>{meta}</CardMeta>
        <span className="am-cardgo" aria-hidden="true">
          {readLabel}
          <Icon name="arrow-right" size={16} />
        </span>
      </CardFooter>
    </Card>
  );
}
