"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { Icon } from "../icons";
import { initialsOf } from "./initials";
import { THEMES, themeByValue } from "../themes";
import type { ThemeValue } from "../themes";

export interface UserMenuProps {
  label: string;
  role?: string | undefined;
  /** Two letters drawn in the avatar; derived from the label when absent. */
  initials?: string | undefined;
  /** Accessible name of the menu button; the surface owns the wording. */
  menuLabel: string;
  logoutLabel: string;
  logoutAction?: ((formData: FormData) => void | Promise<void>) | undefined;
  /** Extra `.bo-menu__item` entries rendered above the logout form. */
  children?: ReactNode;
  /** `up` opens the menu above the button, for a menu placed at the foot of the sidebar. */
  placement?: "down" | "up" | undefined;
  /** Theme chooser in the menu. The surface names the cookie and the legend; the package owns the rest. */
  themePicker?: { cookieName: string; current: ThemeValue; label: string } | undefined;
}

const MENU_ITEMS = '[role^="menuitem"], a[href], button:not([disabled])';

/** Entries of the open menu, in DOM order: extra items, the theme options, then the logout button. */
function menuItems(menu: HTMLElement | null): HTMLElement[] {
  return menu ? Array.from(menu.querySelectorAll<HTMLElement>(MENU_ITEMS)) : [];
}

export function UserMenu({ label, role, initials, menuLabel, logoutLabel, logoutAction, children, placement = "down", themePicker }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<string>(themePicker?.current ?? "clair");
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = `bo-user-menu-${useId()}`;

  // The focus enters the menu on the first entry as soon as it opens.
  useEffect(() => {
    if (open) menuItems(menuRef.current)[0]?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    function onPointerDown(event: MouseEvent) {
      const node = containerRef.current;
      if (node && event.target instanceof Node && !node.contains(event.target)) setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  function chooseTheme(value: string) {
    if (!themePicker) return;
    const next = themeByValue(value);
    setTheme(next.value);
    const root = document.documentElement;
    root.setAttribute("data-theme", next.value);
    root.setAttribute("data-mode", next.mode);
    document.cookie = `${themePicker.cookieName}=${next.value}; path=/; max-age=31536000; samesite=lax`;
  }

  // Arrow keys, Home and End move between the entries; Tab leaves the menu and closes it.
  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab") {
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    const items = menuItems(menuRef.current);
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next: number | undefined;
    if (event.key === "ArrowDown") next = index < 0 ? 0 : (index + 1) % items.length;
    else if (event.key === "ArrowUp") next = index <= 0 ? items.length - 1 : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    items[next]?.focus();
  }

  return (
    <div className="bo-user-menu" data-placement={placement} ref={containerRef}>
      <button
        className="bo-user-menu__button"
        ref={buttonRef}
        type="button"
        aria-label={menuLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpen((previous) => !previous)}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="bo-user-menu__avatar" aria-hidden="true">
          {initials ?? initialsOf(label)}
        </span>
        <span className="bo-user-menu__identity">
          <span className="bo-user-menu__label">{label}</span>
          {role ? <span className="bo-user-menu__role">{role}</span> : null}
        </span>
        <Icon name={placement === "up" ? "chevronUpDown" : "chevronDown"} size={16} />
      </button>
      {open ? (
        <div className="bo-menu" role="menu" id={menuId} aria-label={menuLabel} ref={menuRef} onKeyDown={onMenuKeyDown}>
          {children}
          {themePicker ? (
            <fieldset className="bo-themes">
              <legend>{themePicker.label}</legend>
              <div className="bo-themes__list">
                {THEMES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className="bo-theme-option"
                    role="menuitemradio"
                    aria-checked={theme === item.value}
                    onClick={() => chooseTheme(item.value)}
                  >
                    <span
                      className="bo-theme-option__swatch"
                      aria-hidden="true"
                      style={{ "--swatch-ground": item.ground, "--swatch-plate": item.plate } as CSSProperties}
                    />
                    {item.label}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}
          {logoutAction ? (
            <form action={logoutAction}>
              <button className="bo-menu__item" type="submit" role="menuitem">
                <Icon name="logout" size={18} />
                {logoutLabel}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
