import type { ReactNode } from "react";

/**
 * Headline figure shared by the KPI card and the stat strip.
 *
 * A headline value is shown in a 40px mono face sized for a three or four digit number. Real
 * values are longer ("187 000 XOF"), or are words ("Non mesure", "IA desactivee"), and used to
 * overflow their tile or wrap on two or three lines. This component keeps the text of the value
 * intact (the same characters reach the DOM, so reading the cell returns what was passed) and
 * only changes how it is drawn:
 *
 * - a number with a trailing unit (XOF, %, min, h, lead(s)) shows the unit smaller, next to the
 *   number, on the same line;
 * - the number steps down one of four sizes until the whole figure fits the narrowest tile;
 * - a value that is words (not a figure) is set in the interface face at section size: the mono
 *   face is for figures, references and amounts only.
 *
 * The component only reads the string it is given; it carries no wording of its own.
 */

export type FigureSize = "lg" | "md" | "sm" | "xs";
export type FigureKind = "figure" | "text" | "node";

export interface FigureDescription {
  kind: FigureKind;
  size: FigureSize;
  /** The figure itself (kind "figure") or the whole text (kind "text"). */
  main: string;
  /** Trailing unit of a figure, without its separator; empty when there is none. */
  unit: string;
  /** Separator that sat between the figure and its unit in the source string. */
  separator: string;
}

/** Scale of each size against the stat size token (40px; 34px under 900px). */
const SCALES: ReadonlyArray<readonly [FigureSize, number]> = [
  ["lg", 1],
  ["md", 0.75],
  ["sm", 0.58],
  ["xs", 0.46]
];

/** Usable width of the narrowest tile: 176px strip cell minus its 16px side padding. */
const TILE_BUDGET_PX = 144;
/** Average advance of the mono face, as a fraction of the font size. */
const MONO_ADVANCE = 0.6;
const STAT_PX = 40;
const UNIT_MIN_PX = 14;
const UNIT_GAP_PX = 8;

/**
 * A figure is a number (digits, group separators, decimal mark, optional sign) followed by an
 * optional unit with no digit in it ("XOF", "%", "min", "lead(s)", "leads assignes"). Anything
 * that does not start with a digit is words; anything else that does stays a figure with no unit.
 */
const FIGURE_WITH_UNIT = /^([+\-\u2212]?\d(?:[\d\u00a0\u202f .,]*\d)?)([\s\u00a0\u202f]*)([^\d\s\u00a0\u202f][^\d]{0,13})$/u;
const FIGURE_START = /^[+\-\u2212]?\d/u;

function widthAt(scale: number, mainLength: number, unitLength: number): number {
  const mainPx = mainLength * STAT_PX * scale * MONO_ADVANCE;
  if (unitLength === 0) return mainPx;
  const unitPx = Math.max(UNIT_MIN_PX, STAT_PX * 0.4 * scale);
  return mainPx + UNIT_GAP_PX + unitLength * unitPx * MONO_ADVANCE;
}

function pickSize(mainLength: number, unitLength: number): FigureSize {
  for (const [size, scale] of SCALES) {
    if (widthAt(scale, mainLength, unitLength) <= TILE_BUDGET_PX) return size;
  }
  return "xs";
}

export function describeFigure(value: ReactNode): FigureDescription {
  if (typeof value !== "string" && typeof value !== "number") {
    return { kind: "node", size: "lg", main: "", unit: "", separator: "" };
  }
  const text = String(value).trim();
  const withUnit = FIGURE_WITH_UNIT.exec(text);
  if (withUnit) {
    const main = withUnit[1] ?? "";
    const unit = (withUnit[3] ?? "").trim();
    return { kind: "figure", size: pickSize(main.length, unit.length), main, unit, separator: withUnit[2] ?? "" };
  }
  if (FIGURE_START.test(text)) {
    return { kind: "figure", size: pickSize(text.length, 0), main: text, unit: "", separator: "" };
  }
  return { kind: "text", size: "lg", main: text, unit: "", separator: "" };
}

export interface FigureValueProps {
  className: string;
  value: ReactNode;
}

export function FigureValue({ className, value }: FigureValueProps) {
  const figure = describeFigure(value);
  if (figure.kind === "node") {
    return (
      <p className={className} data-kind="node">
        {value}
      </p>
    );
  }
  if (figure.kind === "text") {
    return (
      <p className={className} data-kind="text">
        {figure.main}
      </p>
    );
  }
  return (
    <p className={className} data-kind="figure" data-size={figure.size}>
      <span className="bo-figure__main">{figure.main}</span>
      {figure.unit ? (
        <span className="bo-figure__unit">
          {figure.separator}
          {figure.unit}
        </span>
      ) : null}
    </p>
  );
}
