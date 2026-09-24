"use client";

import { useEffect } from "react";
import { usePathname } from "../../../i18n/navigation";

export interface HeaderScrollShadowProps {
  targetId: string;
  /** Id of the `<details>` mobile menu, so it can be closed with Escape and on navigation. */
  menuId?: string;
}

/**
 * The only script the site chrome needs, kept deliberately tiny:
 *  - flips `data-scrolled` on the header, which turns the white bar into the frosted one;
 *  - closes the `<details>` mobile menu on Escape, on a click on the dimmed scrim, on the drawer's
 *    own close button (`[data-menu-close]`), and after a client-side navigation (without this the
 *    panel would stay open over the page the visitor just asked for).
 * Everything else - opening the menu, changing country, locking the body scroll - is pure CSS or a
 * plain form, so the chrome keeps working with JavaScript disabled: the scrim only becomes clickable
 * and the close button only becomes visible under `html[data-js="true"]`, which `Reveal` sets.
 */
export function HeaderScrollShadow({ targetId, menuId }: HeaderScrollShadowProps) {
  const pathname = usePathname();

  useEffect(() => {
    const header = document.getElementById(targetId);
    if (!header) return;
    const update = () => header.setAttribute("data-scrolled", window.scrollY > 4 ? "true" : "false");
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [targetId]);

  // The chrome's own no-JS switch: the scrim only catches clicks, and the drawer's close button only
  // appears, once this attribute is set. `Reveal` sets it too, but no page is required to carry one.
  useEffect(() => {
    document.documentElement.dataset["js"] = "true";
  }, []);

  useEffect(() => {
    if (!menuId) return;
    const menu = document.getElementById(menuId);
    if (!(menu instanceof HTMLDetailsElement)) return;

    const close = () => {
      menu.open = false;
      const summary = menu.querySelector("summary");
      if (summary instanceof HTMLElement) summary.focus();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !menu.open) return;
      close();
    };

    // Two closers share one listener: the drawer's `[data-menu-close]` button, and the dimmed scrim -
    // which is the `::before` of the `<details>` itself, so a click on it reports `menu` as its target.
    const onClick = (event: MouseEvent) => {
      if (!menu.open) return;
      const target = event.target;
      if (target === menu) {
        close();
        return;
      }
      if (target instanceof Element && target.closest("[data-menu-close]")) close();
    };

    document.addEventListener("keydown", onKeyDown);
    menu.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      menu.removeEventListener("click", onClick);
    };
  }, [menuId]);

  useEffect(() => {
    if (!menuId) return;
    const menu = document.getElementById(menuId);
    if (menu instanceof HTMLDetailsElement) menu.open = false;
  }, [menuId, pathname]);

  return null;
}
