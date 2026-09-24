"use client";

import { useEffect, useRef, type CSSProperties, type ElementType, type ReactNode } from "react";

export interface RevealProps {
  children: ReactNode;
  /** Element rendered; defaults to a `div`. Use `as="li"` or `as="section"` to keep semantics. */
  as?: ElementType;
  /** Delay before the element fades in, in milliseconds. */
  delay?: number;
  /** Staggers the direct children of this element instead of animating it as one block. */
  stagger?: boolean;
  /** Direction the element travels from. */
  from?: "up" | "left" | "right" | "scale";
  /** `false` re-hides the element when it leaves the viewport; default `true` reveals once. */
  once?: boolean;
  className?: string;
  style?: CSSProperties;
  id?: string;
}

/**
 * Scroll reveal.
 *
 * The content is VISIBLE by default: the hidden pre-state of `[data-reveal="pending"]` only applies
 * under `html[data-js="true"]`, an attribute this component sets on mount. So server HTML, a browser
 * with JavaScript disabled and the window between render and hydration all show the content. On top
 * of that, a 1200ms timeout and the reduced-motion query both mark the element as revealed even if
 * IntersectionObserver never fires.
 */
export function Reveal({
  children,
  as,
  delay = 0,
  stagger = false,
  from = "up",
  once = true,
  className,
  style,
  id
}: RevealProps) {
  const Tag = (as ?? "div") as ElementType;
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    document.documentElement.dataset["js"] = "true";

    const node = ref.current;
    if (!node) return;

    const markIn = () => {
      node.dataset["reveal"] = "in";
    };

    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      markIn();
      return;
    }

    // Already on screen when the page hydrates: reveal it at once rather than hiding it first, which
    // would read as a flash. Only what is still below the fold animates in.
    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      markIn();
      if (once) return;
    }

    // Whatever happens to the observer, the content is on screen within 1.2s.
    const fallback = window.setTimeout(markIn, 1200);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            markIn();
            if (once) observer.disconnect();
          } else if (!once) {
            node.dataset["reveal"] = "pending";
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );

    observer.observe(node);

    return () => {
      window.clearTimeout(fallback);
      observer.disconnect();
    };
  }, [once]);

  const inlineStyle: CSSProperties = { ...style, ...(delay ? { transitionDelay: `${delay}ms` } : {}) };

  return (
    <Tag
      ref={ref}
      id={id}
      className={className}
      style={inlineStyle}
      data-reveal="pending"
      data-reveal-from={from === "up" ? undefined : from}
      {...(stagger ? { "data-reveal-stagger": "true" } : {})}
    >
      {children}
    </Tag>
  );
}
