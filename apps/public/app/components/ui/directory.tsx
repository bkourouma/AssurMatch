import type { ComponentProps, ReactNode } from "react";
import { Link } from "../../../i18n/navigation";
import { Icon, type IconName } from "./icons";
import { Pictogram, type PictogramName } from "./pictogram";

type LinkHref = ComponentProps<typeof Link>["href"];

export interface DirectoryItem {
  /** Stable React key. */
  key: string;
  title: ReactNode;
  /** One short line under the title. */
  meta?: ReactNode;
  /** Internal, typed i18n route. */
  href?: LinkHref;
  /** External or pre-built URL (broker portal, `mailto:`...). */
  externalHref?: string;
  /** Product pictogram on a navy tile. */
  pictogram?: PictogramName;
  /** Interface icon on a navy tile, when the destination is not a product. */
  icon?: IconName;
  /** Free tile content (a flag, initials). */
  tile?: ReactNode;
  /** Right-hand content before the arrow: a badge, a figure. */
  aside?: ReactNode;
}

export interface DirectoryProps {
  items: readonly DirectoryItem[];
  /** Accessible name of the list. */
  label?: string;
  /** Two columns from 900px. */
  columns?: 1 | 2;
  /** `plate` frames the rows in a white panel (used on or next to a navy sign). */
  surface?: "rule" | "plate";
  className?: string;
}

/**
 * Rows of destinations, the main list of the sign system: a tile, a name, one line, and an arrow
 * that nudges toward where the row goes. A row with no href renders as plain text (no arrow).
 */
export function Directory({ items, label, columns = 1, surface = "rule", className }: DirectoryProps) {
  if (items.length === 0) return null;

  return (
    <ul
      className={className ? `am-directory ${className}` : "am-directory"}
      aria-label={label}
      data-columns={columns === 2 ? "2" : undefined}
      data-surface={surface === "plate" ? "plate" : undefined}
    >
      {items.map((item) => {
        const tile = item.pictogram ? (
          <Pictogram name={item.pictogram} tile size={26} className="am-directory__tile" />
        ) : item.icon ? (
          <span className="am-icontile am-directory__tile" aria-hidden="true">
            <Icon name={item.icon} size={22} />
          </span>
        ) : item.tile ? (
          <span className="am-directory__tile">{item.tile}</span>
        ) : null;

        const linked = Boolean(item.href || item.externalHref);
        const body = (
          <>
            {tile}
            <span className="am-directory__text">
              <span className="am-directory__title">{item.title}</span>
              {item.meta ? <span className="am-directory__meta">{item.meta}</span> : null}
            </span>
            <span className="am-directory__aside">
              {item.aside}
              {linked ? <Icon name="arrow-right" size={24} className="am-directory__arrow" /> : null}
            </span>
          </>
        );

        return (
          <li key={item.key}>
            {item.href ? (
              <Link className="am-directory__row" href={item.href}>
                {body}
              </Link>
            ) : item.externalHref ? (
              <a className="am-directory__row" href={item.externalHref}>
                {body}
              </a>
            ) : (
              <div className="am-directory__row">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
