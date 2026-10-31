import type { ReactNode } from "react";
import type { Tone } from "./badge";
import { FigureValue } from "./figure";

export interface StatItem {
  label: string;
  value: ReactNode;
  helper?: string | undefined;
  /** Status dot before the label; leave out for a neutral figure. */
  tone?: Tone | undefined;
  /** Makes the whole cell a link; the surface owns the route. */
  href?: string | undefined;
}

export interface StatStripProps {
  items: StatItem[];
  /** Accessible name of the figure group. */
  label?: string | undefined;
}

/**
 * Several headline figures in one bordered panel, separated by hairlines. It replaces a grid of
 * equal KPI cards: the eye reads one row of numbers, not a wall of boxes.
 */
export function StatStrip({ items, label }: StatStripProps) {
  return (
    <ul className="bo-stats" aria-label={label}>
      {items.map((item) => (
        <li className="bo-stats__cell" key={item.label} data-tone={item.tone ?? "neutral"}>
          <p className="bo-stats__label">
            <span className="bo-stats__dot" aria-hidden="true" />
            {item.label}
          </p>
          <FigureValue className="bo-stats__value" value={item.value} />
          {item.helper ? <p className="bo-stats__helper">{item.helper}</p> : null}
          {item.href ? <a className="bo-stats__link" href={item.href} aria-label={item.label} /> : null}
        </li>
      ))}
    </ul>
  );
}
