export interface CountUpProps {
  value: number;
  locale?: string;
  /** Kept for API compatibility; the figure is printed, not animated. */
  duration?: number;
  format?: Intl.NumberFormatOptions;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/**
 * Former animated counter. A sign shows its figure; it does not count up to it. Since the 2026-10
 * redesign this prints the formatted number on the server, in tabular figures.
 */
export function CountUp({ value, locale, format, prefix, suffix, className }: CountUpProps) {
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0, ...format });
  return (
    <span className={className ? `am-tabular ${className}` : "am-tabular"}>
      {prefix}
      {formatter.format(value)}
      {suffix}
    </span>
  );
}
