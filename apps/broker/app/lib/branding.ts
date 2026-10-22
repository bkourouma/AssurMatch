/**
 * Spec 064 FR-009: Enterprise cabinet branding applied to the broker back-office header only.
 * The public comparator never reads it, and the « Plateforme technique AssurMatch » mention is always
 * kept. Pure logic (no I/O) so it can be unit tested.
 */
export interface BrokerBranding {
  label: string;
  color: string;
}

/** Mention shown next to the cabinet label, whatever the branding is. */
export const PLATFORM_MENTION = "Plateforme technique AssurMatch";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const MAX_LABEL_LENGTH = 60;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

/** Text colours drawn over the sidebar by the shared design system (white text, `--am-primary-100` links). */
const SIDEBAR_TEXT_COLORS = ["#ffffff", "#e4ecfb"] as const;
const MIN_CONTRAST = 4.5;

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

/** WCAG 2.x contrast ratio between two `#rrggbb` colours (1 to 21). */
export function contrastRatio(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * A brand colour is applied only when it is a strict `#rrggbb` AND every sidebar text colour keeps a
 * WCAG contrast of at least 4.5:1 over it. Anything else falls back to the default charte.
 */
export function isUsableBrandColor(value: unknown): value is string {
  if (typeof value !== "string" || !HEX_COLOR.test(value)) return false;
  return SIDEBAR_TEXT_COLORS.every((text) => contrastRatio(value, text) >= MIN_CONTRAST);
}

/** Label shown in the brand block: trimmed, printable, bounded; `undefined` when nothing usable remains. */
export function cleanBrandLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const label = value.replace(CONTROL_CHARACTERS, " ").replace(/\s+/g, " ").trim().slice(0, MAX_LABEL_LENGTH).trim();
  return label === "" ? undefined : label;
}

/** Builds the branding passed to the shell from the API payload; `undefined` when there is no usable label. */
export function toBrokerBranding(payload: { displayLabel?: unknown; primaryColor?: unknown } | undefined): BrokerBranding | undefined {
  if (!payload) return undefined;
  const label = cleanBrandLabel(payload.displayLabel);
  if (!label) return undefined;
  return { label, color: isUsableBrandColor(payload.primaryColor) ? payload.primaryColor.toLowerCase() : "" };
}

/**
 * Sidebar-only override of the design system primary colour. The value is a validated `#rrggbb`, so the
 * returned rule can never carry anything else; an unusable colour yields no rule at all.
 */
export function brandAccentCss(color: string): string {
  if (!isUsableBrandColor(color)) return "";
  return `.bo-shell[data-broker-brand="custom"] .bo-sidebar{--am-primary-700:${color.toLowerCase()}}`;
}
