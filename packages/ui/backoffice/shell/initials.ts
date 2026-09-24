/**
 * Server-safe: the avatar initials are computed in the layout of each surface, which is a server
 * component, so this helper must not live in the `"use client"` user-menu module.
 */
export function initialsOf(label: string): string {
  const parts = label
    .split(/[\s._@-]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts[1]?.[0] ?? "";
  return `${first}${second}`.toUpperCase();
}
