import type { ReactNode } from "react";
import { Icon } from "./icons";
import type { Tone } from "./badge";

export interface KpiTrend {
  direction: "up" | "down" | "flat";
  label: string;
}

export interface KpiCardProps {
  label: string;
  value: ReactNode;
  helper?: string | undefined;
  tone?: Tone | undefined;
  trend?: KpiTrend | undefined;
}

export function KpiCard({ label, value, helper, tone = "neutral", trend }: KpiCardProps) {
  return (
    <article className="bo-kpi" data-tone={tone} aria-label={label}>
      <div>
        <p className="bo-kpi__label">{label}</p>
        <p className="bo-kpi__value">{value}</p>
      </div>
      {trend ? (
        <p className="bo-kpi__trend" data-direction={trend.direction}>
          <Icon name={trend.direction === "down" ? "sortDesc" : trend.direction === "up" ? "sortAsc" : "sort"} size={14} />
          {trend.label}
        </p>
      ) : null}
      {helper ? <p className="bo-kpi__helper">{helper}</p> : null}
    </article>
  );
}
