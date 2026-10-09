"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
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

export function UserMenu({ label, role, initials, menuLabel, logoutLabel, logoutAction, children, placement = "down", themePicker }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<string>(themePicker?.current ?? "clair");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
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

  return (
    <div className="bo-user-menu" data-placement={placement} ref={containerRef}>
      <button
        className="bo-user-menu__button"
        type="button"
        aria-label={menuLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((previous) => !previous)}
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
        <div className="bo-menu" role="menu">
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
                    aria-pressed={theme === item.value}
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
