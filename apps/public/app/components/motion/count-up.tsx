"use client";

import { useEffect, useRef, useState } from "react";

export interface CountUpProps {
  /** Final value. It is what the server renders, so search engines and no-JS visitors see it. */
  value: number;
  /** BCP 47 tag used by `Intl.NumberFormat`, e.g. the page locale. */
  locale?: string;
  /** Duration of the count, in milliseconds. */
  duration?: number;
  /** Number formatting options, e.g. `{ style: "percent" }` or `{ maximumFractionDigits: 1 }`. */
  format?: Intl.NumberFormatOptions;
  /** Rendered before the number, e.g. "+". */
  prefix?: string;
  /** Rendered after the number, e.g. "%". */
  suffix?: string;
  className?: string;
}

function easeOut(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

/**
 * Animates a figure from 0 to its value the first time it scrolls into view.
 *
 * The server renders the final, formatted value: nothing is ever missing from the HTML. Under
 * `prefers-reduced-motion: reduce`, or without IntersectionObserver, the value simply stays put.
 */
export function CountUp({ value, locale, duration = 1400, format, prefix, suffix, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState<number>(value);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined" || value === 0) {
      setDisplay(value);
      return;
    }

    let frame = 0;
    let start = 0;

    const step = (now: number) => {
      if (!start) start = now;
      const progress = Math.min(1, (now - start) / duration);
      setDisplay(value * easeOut(progress));
      if (progress < 1) frame = window.requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.disconnect();
          setDisplay(0);
          frame = window.requestAnimationFrame(step);
        }
      },
      { threshold: 0.4 }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [value, duration]);

  const fractionDigits = format?.maximumFractionDigits ?? 0;
  const rounded = display >= value ? value : Number(display.toFixed(fractionDigits));
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: fractionDigits, ...format });

  return (
    <span ref={ref} className={className ? `am-tabular ${className}` : "am-tabular"}>
      {prefix}
      {formatter.format(rounded)}
      {suffix}
    </span>
  );
}
