import { Icon } from "./icons";
import { JsonLd } from "./json-ld";
import { breadcrumbJsonLd } from "../../lib/seo";

export interface BreadcrumbEntry {
  name: string;
  /** Absolute URL: it feeds both the link and the BreadcrumbList JSON-LD. */
  url: string;
}

export interface BreadcrumbProps {
  items: readonly BreadcrumbEntry[];
  label: string;
}

/** Navigation trail plus the matching BreadcrumbList structured data. */
export function Breadcrumb({ items, label }: BreadcrumbProps) {
  if (items.length === 0) return null;
  return (
    <>
      <nav className="am-breadcrumb" aria-label={label}>
        <ol className="am-breadcrumb__list">
          {items.map((item, index) => {
            const last = index === items.length - 1;
            return (
              <li className="am-breadcrumb__item" key={item.url}>
                {index > 0 ? <Icon name="chevron-right" size={14} /> : null}
                {last ? <span aria-current="page">{item.name}</span> : <a href={item.url}>{item.name}</a>}
              </li>
            );
          })}
        </ol>
      </nav>
      <JsonLd data={breadcrumbJsonLd(items)} />
    </>
  );
}
