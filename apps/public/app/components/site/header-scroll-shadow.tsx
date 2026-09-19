"use client";

import { useEffect } from "react";

/** Adds the elevation of the header once the page is scrolled. Kept deliberately tiny. */
export function HeaderScrollShadow({ targetId }: { targetId: string }) {
  useEffect(() => {
    const header = document.getElementById(targetId);
    if (!header) return;
    const update = () => header.setAttribute("data-scrolled", window.scrollY > 4 ? "true" : "false");
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [targetId]);

  return null;
}
