import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SELECT_DEFAULT_PLACEHOLDER, resolveSelectPlaceholder } from "../backoffice/form/controls";

describe("resolveSelectPlaceholder", () => {
  it("adds an empty, hidden 'Choisir…' to a required select that carries no value", () => {
    expect(resolveSelectPlaceholder({ required: true, hasEmptyOption: false })).toEqual({ label: SELECT_DEFAULT_PLACEHOLDER, hidden: true, defaultValue: "" });
  });

  it("selects an explicit placeholder by default (a disabled option is never selected on its own)", () => {
    expect(resolveSelectPlaceholder({ placeholder: "Choisir un type", required: true, hasEmptyOption: false })).toEqual({ label: "Choisir un type", hidden: true, defaultValue: "" });
  });

  it("keeps a filter placeholder visible in the list", () => {
    expect(resolveSelectPlaceholder({ placeholder: "Tous les statuts", defaultValue: "open", hasEmptyOption: false })).toEqual({ label: "Tous les statuts", hidden: false, defaultValue: undefined });
  });

  it("does not touch selects that already have a value, a default value or an empty option", () => {
    expect(resolveSelectPlaceholder({ required: true, defaultValue: "fr", hasEmptyOption: false }).label).toBeUndefined();
    expect(resolveSelectPlaceholder({ required: true, value: "fr", hasEmptyOption: false }).label).toBeUndefined();
    expect(resolveSelectPlaceholder({ required: true, hasEmptyOption: true }).label).toBeUndefined();
  });

  it("leaves non-required selects and multi-selects preselected as before", () => {
    expect(resolveSelectPlaceholder({ hasEmptyOption: false }).label).toBeUndefined();
    expect(resolveSelectPlaceholder({ required: true, multiple: true, hasEmptyOption: false }).label).toBeUndefined();
    expect(resolveSelectPlaceholder({ required: true, size: 4, hasEmptyOption: false }).label).toBeUndefined();
  });

  it("renders the placeholder as a disabled, hidden option in the component source", () => {
    const source = readFileSync("packages/ui/backoffice/form/controls.tsx", "utf8");
    expect(source).toContain('<option value="" disabled hidden={resolved.hidden}>');
    expect(source).toContain("defaultValue: resolved.defaultValue");
  });
});
