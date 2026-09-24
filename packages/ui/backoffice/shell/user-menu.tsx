"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "../icons";
import { initialsOf } from "./initials";

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
}

export function UserMenu({ label, role, initials, menuLabel, logoutLabel, logoutAction, children }: UserMenuProps) {
  const [open, setOpen] = useState(false);
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

  return (
    <div className="bo-user-menu" ref={containerRef}>
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
        <Icon name="chevronDown" size={16} />
      </button>
      {open ? (
        <div className="bo-menu" role="menu">
          {children}
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
