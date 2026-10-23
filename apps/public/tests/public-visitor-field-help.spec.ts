import { expect, test } from "@playwright/test";
import { messagesText, publicFile, readSources } from "./helpers/public-sources";

function source(path: string): string {
  return readSources([path]);
}

test("field help sends only the field context and never an entered value", () => {
  const help = source(publicFile("components/visitor-field-help.tsx"));
  expect(help).toContain('const ASSIST_TYPE = "visitor_form_help"');
  expect(help).toContain("{ countryCode, productKey, fieldKey, fieldLabel, language }");
  expect(help).toContain("useLocale()");
  for (const personal of ["FormData", "answers", "formValues", "event.target.value", "defaultValue"]) {
    expect(help).not.toContain(personal);
  }
});

test("field help is closed by default, reads the availability once and caches per field", () => {
  const help = source(publicFile("components/visitor-field-help.tsx"));
  expect(help.match(/readVisitorAiAvailability\(/g)).toHaveLength(1);
  expect(help).toContain('entry.assistType === ASSIST_TYPE && entry.enabled');
  expect(help).toContain("useState(false)");
  expect(help).toContain("available ? {");
  expect(help).toContain("if (!context");
  // Cache: a finished answer is re-opened without a new request.
  expect(help).toContain('current.status === "done"');
  expect(help.match(/requestVisitorAi\(/g)).toHaveLength(1);
});

test("field help is mounted on the quote form grid and rendered by Field", () => {
  const form = source(publicFile("components/quote-form.tsx"));
  const field = source(publicFile("components/ui/field.tsx"));
  expect(form).toContain('import { VisitorFieldHelpProvider } from "./visitor-field-help"');
  expect(form).toMatch(/<VisitorFieldHelpProvider countryCode=\{countryCode\} productKey=\{productKey\} fields=\{quoteForm\.fields\}>/);
  expect(field).toContain("<VisitorFieldHelpSlot fieldId={id} />");
  expect(field).toContain('<VisitorFieldHelpSlot fieldId={id} part="panel" />');
});

test("field help is accessible and does not submit the form", () => {
  const help = source(publicFile("components/visitor-field-help.tsx"));
  expect(help).toContain('type="button"');
  expect(help).toContain('t("fieldHelp.trigger", { field: fieldLabel })');
  expect(help).toContain("aria-expanded={open}");
  expect(help).toContain('aria-live="polite"');
  expect(help).toContain("<Skeleton");
  for (const key of ["pending", "timeout", "refused", "failed", "unavailable", "fallback", "fieldHelp.aiNotice", "fieldHelp.close", "fieldHelp.note", "fieldHelp.title"]) {
    expect(help).toContain(`t("${key}"`);
  }
});

test("field help copy avoids regulated or advisory wording", () => {
  const help = source(publicFile("components/visitor-field-help.tsx"));
  const surface = `${help}\n${messagesText("fr", "VisitorAi")}\n${messagesText("en", "VisitorAi")}`.toLowerCase();
  for (const forbidden of ["acheter", "souscrire maintenant", "meilleure assurance", "recommand", "buy now", "best insurance"]) {
    expect(surface).not.toContain(forbidden);
  }
  expect(messagesText("fr", "VisitorAi")).toContain("Contenu généré par IA, à confirmer par le courtier partenaire.");
});
