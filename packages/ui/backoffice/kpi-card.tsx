import { useId } from "react";
import type { ReactNode } from "react";
import { FigureValue } from "./figure";
import { Icon } from "./icons";
import type { Tone } from "./badge";

export interface KpiTrend {
  direction: "up" | "down" | "flat";
  label: string;
  /** Hidden words naming the direction (the arrow and the colour alone do not); defaults to French. */
  directionLabel?: string | undefined;
}

const DIRECTION_LABELS: Record<KpiTrend["direction"], string> = {
  up: "en hausse",
  down: "en baisse",
  flat: "stable"
};

export interface KpiCardProps {
  label: string;
  value: ReactNode;
  helper?: string | undefined;
  tone?: Tone | undefined;
  trend?: KpiTrend | undefined;
}

export function KpiCard({ label, value, helper, tone = "neutral", trend }: KpiCardProps) {
  // The figure's name is its label and its value read together, not the label alone.
  const headingId = useId();
  return (
    <article className="bo-kpi" data-tone={tone} aria-labelledby={headingId}>
      <div id={headingId}>
        <p className="bo-kpi__label">{label}</p>
        <FigureValue className="bo-kpi__value" value={value} />
      </div>
      {trend ? (
        <p className="bo-kpi__trend" data-direction={trend.direction}>
          <Icon name={trend.direction === "down" ? "sortDesc" : trend.direction === "up" ? "sortAsc" : "sort"} size={14} />
          {trend.label}
          <span className="bo-visually-hidden">{` (${trend.directionLabel ?? DIRECTION_LABELS[trend.direction]})`}</span>
        </p>
      ) : null}
      {helper ? <p className="bo-kpi__helper">{helper}</p> : null}
    </article>
  );
}
