"use client";

import type { KeyboardEvent } from "react";

export interface TabItem {
  label: string;
  href: string;
  current?: boolean | undefined;
  badge?: string | undefined;
}

export interface TabsProps {
  items: TabItem[];
  /** Accessible name of the tab navigation; the surface owns the wording. */
  label: string;
}

/**
 * Link-driven tabs: each tab is a real navigation, so the browser back button and a direct URL both
 * work. `aria-current="page"` carries the selected state, `role="tab"` its tab semantics.
 */
export function Tabs({ items, label }: TabsProps) {
  // Every tab stays a tab stop (they are links); the arrow keys, Home and End are a shortcut on top.
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'));
    const index = tabs.indexOf(event.target as HTMLElement);
    if (index === -1 || tabs.length === 0) return;
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === "Home"
            ? 0
            : tabs.length - 1;
    event.preventDefault();
    tabs[next]?.focus();
  }

  return (
    <nav aria-label={label}>
      <div className="bo-tabs" role="tablist" onKeyDown={handleKeyDown}>
        {items.map((item) => (
          <a
            key={item.href}
            className="bo-tabs__link"
            role="tab"
            href={item.href}
            aria-selected={item.current ? true : false}
            aria-current={item.current ? "page" : undefined}
          >
            {item.label}
            {item.badge ? <span className="bo-badge" data-tone="info">{item.badge}</span> : null}
          </a>
        ))}
      </div>
    </nav>
  );
}
