import type { ReactNode } from "react";
import { CountUp } from "../motion/count-up";
import { IconTile } from "./icon-tile";
import type { IconName } from "./icons";
import type { IconTileTone } from "./icon-tile";

export interface StatProps {
  /** What the figure counts. Always rendered, always above 14px. */
  label: string;
  /**
   * A number animates from 0 when it scrolls into view (the server still renders the final value).
   * Pass a string or a node for a figure that is not a plain number.
   */
  value: number | string | ReactNode;
  icon?: IconName;
  iconTone?: IconTileTone;
  /** A short line under the figure: the date it was computed, the source. */
  hint?: string;
  /** Locale of the number formatting, e.g. the page locale. */
  locale?: string;
  format?: Intl.NumberFormatOptions;
  /** `invert` on a navy background. */
  tone?: "default" | "invert";
  className?: string;
}

/** A key figure: icon tile, big Nunito number with tabular digits, label, optional hint. */
export function Stat({ label, value, icon, iconTone, hint, locale, format, tone = "default", className }: StatProps) {
  return (
    <div className={className ? `am-stat ${className}` : "am-stat"} data-tone={tone === "invert" ? "invert" : undefined}>
      {icon ? (
        <span className="am-stat__icon">
          <IconTile name={icon} tone={iconTone ?? (tone === "invert" ? "invert" : "brand")} />
        </span>
      ) : null}
      <span className="am-stat__value">
        {typeof value === "number" ? (
          <CountUp value={value} {...(locale ? { locale } : {})} {...(format ? { format } : {})} />
        ) : (
          value
        )}
      </span>
      <span className="am-stat__label">{label}</span>
      {hint ? <p className="am-stat__hint">{hint}</p> : null}
    </div>
  );
}
