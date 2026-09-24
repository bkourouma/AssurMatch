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
  return (
    <nav aria-label={label}>
      <div className="bo-tabs" role="tablist">
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
