export interface ScorePillProps {
  /** Indicative score out of 100. */
  score: number;
  /** Accessible sentence, e.g. "Score indicatif : 82 sur 100". */
  label: string;
}

export function scoreBand(score: number): "high" | "mid" | "low" {
  if (score >= 75) return "high";
  if (score >= 50) return "mid";
  return "low";
}

/** >= 75 success-600, 50 to 74 primary-600, below 50 neutral-500. */
export function ScorePill({ score, label }: ScorePillProps) {
  return (
    <span className="am-score" data-band={scoreBand(score)} aria-label={label}>
      <span aria-hidden="true">{score}/100</span>
    </span>
  );
}
