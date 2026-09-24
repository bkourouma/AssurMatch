export interface ScorePillProps {
  /** Indicative score out of 100. */
  score: number;
  /** Accessible sentence, e.g. "Score indicatif : 82 sur 100". */
  label: string;
  size?: "md" | "lg";
}

export function scoreBand(score: number): "high" | "mid" | "low" {
  if (score >= 75) return "high";
  if (score >= 50) return "mid";
  return "low";
}

/** >= 75 success-700 on success-100, 50 to 74 primary-700 on primary-100, below 50 neutral. */
export function ScorePill({ score, label, size = "md" }: ScorePillProps) {
  return (
    <span className="am-score" data-band={scoreBand(score)} data-size={size === "lg" ? "lg" : undefined} aria-label={label}>
      <span aria-hidden="true">{score}/100</span>
    </span>
  );
}
