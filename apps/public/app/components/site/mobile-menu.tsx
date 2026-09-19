import type { ReactNode } from "react";
import { Icon } from "../ui/icons";
import { Link } from "../../../i18n/navigation";
import type { ComponentProps } from "react";

type LinkHref = ComponentProps<typeof Link>["href"];

export interface MobileMenuEntry {
  href: LinkHref;
  label: string;
}

export interface MobileMenuProps {
  openLabel: string;
  closeLabel: string;
  navLabel: string;
  entries: readonly MobileMenuEntry[];
  children?: ReactNode;
  className?: string;
}

/**
 * Full-screen navigation panel built on `<details>`: no JavaScript framework, no state, and it still
 * opens and closes with the keyboard.
 */
export function MobileMenu({ openLabel, closeLabel, navLabel, entries, children, className }: MobileMenuProps) {
  return (
    <details className={className ? `am-menu ${className}` : "am-menu"}>
      <summary aria-label={openLabel}>
        <Icon name="menu" size={20} />
        <span>{openLabel}</span>
      </summary>
      <div className="am-menu__panel">
        <nav aria-label={navLabel}>
          {entries.map((entry) => (
            <Link className="am-menu__link" href={entry.href} key={entry.label}>
              {entry.label}
            </Link>
          ))}
        </nav>
        {children}
        <p className="am-field__hint">
          <Icon name="close" size={16} /> {closeLabel}
        </p>
      </div>
    </details>
  );
}
