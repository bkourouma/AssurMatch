import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "../backoffice/button";
import { ConfirmDialog } from "../backoffice/confirm-dialog";
import { Notice } from "../backoffice/notice";
import { ActionNotice } from "../backoffice/form/action-notice";
import { CheckboxGroup, RadioGroup } from "../backoffice/form/controls";
import { FormErrorSummary } from "../backoffice/form/error-summary";
import { Field, fieldControlProps } from "../backoffice/form/field";
import { FormActions } from "../backoffice/form/form";
import { Switch } from "../backoffice/form/switch";

const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);

describe("Button", () => {
  it("keeps the default DOM unchanged", () => {
    const out = html(createElement(Button, { children: "Enregistrer" }));
    expect(out).toContain('class="bo-button"');
    expect(out).not.toContain("aria-describedby");
    expect(out).not.toContain("aria-live");
  });

  it("explains a disabled button through title and aria-describedby", () => {
    const out = html(createElement(Button, { disabled: true, disabledReason: "Aucun document", children: "Enregistrer" }));
    expect(out).toContain('title="Aucun document"');
    const id = /aria-describedby="([^"]+)"/.exec(out)?.[1];
    expect(id).toBeTruthy();
    expect(out).toContain(`id="${id}"`);
    expect(out).toContain("bo-visually-hidden");
  });

  it("ignores disabledReason while enabled", () => {
    const out = html(createElement(Button, { disabledReason: "Nope", children: "Go" }));
    expect(out).not.toContain("Nope");
  });

  it("drops href and the tab stop of a disabled link", () => {
    const out = html(createElement(Button, { href: "/x", disabled: true, children: "Ouvrir" }));
    expect(out).not.toContain("href=");
    expect(out).toContain('aria-disabled="true"');
    expect(out).toContain('tabindex="-1"');
    const live = html(createElement(Button, { href: "/x", children: "Ouvrir" }));
    expect(live).toContain('href="/x"');
    expect(live).not.toContain("tabindex");
  });

  it("announces the pending label politely", () => {
    const out = html(createElement(Button, { pending: true, pendingLabel: "Enregistrement", children: "Enregistrer" }));
    expect(out).toContain('aria-live="polite"');
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain("disabled");
  });
});

describe("Notice", () => {
  it("uses alert + assertive for danger", () => {
    const out = html(createElement(Notice, { tone: "danger", children: "Erreur" }));
    expect(out).toContain('role="alert"');
    expect(out).toContain('aria-live="assertive"');
    expect(out).toContain('data-tone="danger"');
  });

  it("uses status + polite for the other tones, and the icon is decorative", () => {
    const out = html(createElement(Notice, { tone: "success", children: "Ok" }));
    expect(out).toContain('role="status"');
    expect(out).toContain('aria-live="polite"');
    expect(out).toContain('class="bo-notice__icon" aria-hidden="true"');
  });

  it("lets the caller override or switch off the live region", () => {
    expect(html(createElement(Notice, { live: "assertive", children: "x" }))).toContain('aria-live="assertive"');
    expect(html(createElement(Notice, { live: "off", children: "x" }))).not.toContain("aria-live");
  });

  it("ActionNotice wraps tokens and forwards live", () => {
    const out = html(createElement(ActionNotice, { state: { status: "success", token: "abc" }, live: "off" }));
    expect(out).toContain("bo-break");
    expect(out).not.toContain("aria-live");
    expect(html(createElement(ActionNotice, { state: { status: "idle" } }))).toBe("");
  });
});

describe("Field", () => {
  it("wires aria-invalid and aria-describedby, plus extra ids and aria-required", () => {
    const props = fieldControlProps("email", { hint: "h", error: "e", required: true, describedBy: "counter" });
    expect(props["aria-invalid"]).toBe(true);
    expect(props["aria-describedby"]).toBe("email-hint email-error counter");
    expect(props["aria-required"]).toBe(true);
    expect(fieldControlProps("x", { invalid: true })["aria-invalid"]).toBe(true);
    expect(fieldControlProps("x")).toEqual({ id: "x", className: "bo-field__control" });
  });

  it("keeps role=alert by default and goes polite with liveError", () => {
    const base = html(createElement(Field, { id: "a", label: "A", error: "Oups", children: createElement("input", { id: "a" }) }));
    expect(base).toContain('role="alert"');
    const live = html(createElement(Field, { id: "a", label: "A", error: "Oups", liveError: true, children: createElement("input", { id: "a" }) }));
    expect(live).not.toContain('role="alert"');
    expect(live).toContain('aria-live="polite"');
  });

  it("adds a non-colour prefix only when asked", () => {
    const out = html(createElement(Field, { id: "a", label: "A", error: "Oups", errorPrefix: "Erreur", children: createElement("input", { id: "a" }) }));
    expect(out).toContain("Erreur : ");
    expect(out).toContain("<svg");
  });
});

describe("FormErrorSummary", () => {
  it("renders nothing without errors", () => {
    expect(html(createElement(FormErrorSummary, { title: "T", errors: [] }))).toBe("");
  });

  it("renders an alert with links to the fields", () => {
    const out = html(createElement(FormErrorSummary, { title: "2 erreurs", errors: [{ id: "email", message: "Email requis" }, { id: "name", message: "Nom requis" }] }));
    expect(out).toContain('role="alert"');
    expect(out).toContain('tabindex="-1"');
    expect(out).toContain('href="#email"');
    expect(out).toContain('href="#name"');
    expect(out).toContain("bo-error-summary");
  });
});

describe("Switch", () => {
  it("keeps the hidden input and labels the switch by its visible text", () => {
    const out = html(createElement(Switch, { name: "news", label: "Newsletter", defaultChecked: true, value: "yes" }));
    expect(out).toContain('<input type="hidden" name="news" value="yes"/>');
    expect(out).toContain('role="switch"');
    expect(out).toContain('aria-checked="true"');
    expect(out).toMatch(/aria-labelledby="([^"]+)"/);
    expect(out).not.toContain("aria-label=");
    expect(html(createElement(Switch, { name: "news", label: "N" }))).toContain('<input type="hidden" name="news" value=""/>');
  });
});

describe("Choice groups and FormActions", () => {
  const options = [{ value: "a", label: "A" }];

  it("points the fieldset at the group error and flags the inputs", () => {
    for (const Group of [CheckboxGroup, RadioGroup]) {
      const out = html(createElement(Group, { legend: "L", name: "g", options, describedBy: "d", error: "Choisir" }));
      expect(out).toContain('aria-describedby="d g-error"');
      expect(out).toContain('id="g-error"');
      expect(out).toContain('aria-invalid="true"');
    }
    expect(html(createElement(CheckboxGroup, { legend: "L", name: "g", options }))).not.toContain("aria-invalid");
  });

  it("marks a sticky action bar only when asked", () => {
    expect(html(createElement(FormActions, { sticky: true, children: "x" }))).toContain('data-sticky="true"');
    expect(html(createElement(FormActions, { children: "x" }))).not.toContain("data-sticky");
  });
});

describe("ConfirmDialog", () => {
  it("labels and describes the dialog and announces it on the trigger", () => {
    const out = html(
      createElement(ConfirmDialog, { triggerLabel: "Suspendre", title: "Titre", description: "Desc", confirmLabel: "Oui", cancelLabel: "Non", tone: "danger" })
    );
    expect(out).toMatch(/<dialog[^>]*aria-labelledby="[^"]+"/);
    expect(out).toMatch(/<dialog[^>]*aria-describedby="[^"]+"/);
    expect(out).toContain('aria-haspopup="dialog"');
    expect(out).toContain('data-variant="danger"');
    expect(out).toContain("Oui");
  });
});
