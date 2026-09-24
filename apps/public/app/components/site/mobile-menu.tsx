import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { Icon, type IconName } from "../ui/icons";
import { Logo } from "../ui/logo";
import { Link } from "../../../i18n/navigation";
import { NavLink, type NavHref } from "./nav-link";

export interface MobileMenuEntry {
  href: NavHref;
  label: string;
  /** Glyph of the row inside the panel; the desktop header shows labels only. */
  icon: IconName;
}

export interface MobileMenuProps {
  id?: string;
  openLabel: string;
  closeLabel: string;
  navLabel: string;
  homeLabel: string;
  ctaLabel: string;
  brokerSpaceLabel: string;
  entries: readonly MobileMenuEntry[];
  children?: ReactNode;
  className?: string;
}

/**
 * Full-height navigation drawer built on `<details>`: no state, no framework, and it still opens and
 * closes with the keyboard and with JavaScript disabled. The burger is the close control too - it
 * stays on top of the panel and morphs into a cross - and its accessible name swaps with the state,
 * because the label of the closed state is removed from the accessibility tree by `display: none`
 * rather than hidden behind an `aria-label` that could never change without script.
 */
export function MobileMenu({
  id,
  openLabel,
  closeLabel,
  navLabel,
  homeLabel,
  ctaLabel,
  brokerSpaceLabel,
  entries,
  children,
  className
}: MobileMenuProps) {
  return (
    <details className={className ? `am-menu ${className}` : "am-menu"} id={id}>
      <summary className="am-menu__toggle">
        <Icon name="menu" size={22} className="am-menu__glyph am-menu__glyph--open" />
        <Icon name="close" size={22} className="am-menu__glyph am-menu__glyph--close" />
        <span className="am-visually-hidden am-menu__name am-menu__name--open">{openLabel}</span>
        <span className="am-visually-hidden am-menu__name am-menu__name--close">{closeLabel}</span>
      </summary>
      <div className="am-menu__panel">
        <Link className="am-menu__brand" href="/" aria-label={homeLabel}>
          <Logo height={28} />
        </Link>

        <nav className="am-menu__nav" aria-label={navLabel}>
          {entries.map((entry) => (
            <NavLink
              className="am-menu__link"
              href={entry.href}
              key={entry.label}
              icon={
                <span className="am-menu__linkicon" aria-hidden="true">
                  <Icon name={entry.icon} size={18} />
                </span>
              }
              iconAfter={<Icon name="chevron-right" size={18} className="am-menu__chevron" />}
            >
              {entry.label}
            </NavLink>
          ))}
        </nav>

        <div className="am-menu__utilities">{children}</div>

        <Button href="/compare" fullWidth className="am-menu__cta" icon={<Icon name="search" size={20} />}>
          {ctaLabel}
        </Button>

        <Link className="am-menu__broker" href="/brokers/login">
          <Icon name="user" size={16} />
          <span>{brokerSpaceLabel}</span>
        </Link>

        {/*
          `data-menu-close` is the contract with `HeaderScrollShadow`, the one client component of the
          chrome: it closes the `<details>` and returns focus to the burger. Without JavaScript the
          button is hidden by `chrome.css` rather than left on screen as a control that does nothing.
        */}
        <button className="am-menu__close" type="button" data-menu-close>
          <Icon name="close" size={16} />
          <span>{closeLabel}</span>
        </button>
      </div>
    </details>
  );
}
