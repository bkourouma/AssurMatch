import { expect, test } from "@playwright/test";
import { visitorAiAnswers } from "../app/lib/visitor-ai-answers";
import { publicFile, readSource } from "./helpers/public-sources";

type Field = Parameters<typeof visitorAiAnswers>[1][number];

const fields: Field[] = [
  { key: "desired_timing", type: "select", sensitivity: "public" },
  { key: "budget", type: "number", sensitivity: "public" },
  { key: "vehicle_year", type: "date", sensitivity: "public" },
  { key: "notes", type: "text", sensitivity: "public" },
  { key: "city", type: "text", sensitivity: "personal" },
  { key: "health_state", type: "text", sensitivity: "sensitive" },
  { key: "contact_email", type: "email", sensitivity: "public" },
  { key: "contact_phone", type: "phone", sensitivity: "public" },
  { key: "full_name", type: "text", sensitivity: "public" },
  { key: "home_address", type: "text", sensitivity: "public" },
  { key: "data_consent", type: "checkbox", sensitivity: "public" },
  { key: "marketing_optin", type: "checkbox", sensitivity: "public" }
];

test("visitor AI answers keep the filled product fields", () => {
  const answers = visitorAiAnswers(
    { desired_timing: "immediate", budget: 1200, vehicle_year: "2019-04-02", notes: "Two cars" },
    fields
  );
  expect(answers).toEqual({ desired_timing: "immediate", budget: 1200, vehicle_year: "2019-04-02", notes: "Two cars" });
  expect(Object.keys(answers).length).toBeGreaterThan(0);
});

test("visitor AI answers never carry contact, personal, sensitive or consent data", () => {
  const everything: Record<string, unknown> = {
    desired_timing: "immediate",
    city: "Abidjan",
    health_state: "n/a",
    contact_email: "visitor@example.com",
    contact_phone: "+2250102030405",
    full_name: "Awa Kone",
    home_address: "1 rue des Palmiers",
    data_consent: true,
    marketing_optin: true,
    // Keys the published definition never declared are not forwarded either.
    email: "visitor@example.com",
    phone: "+2250102030405",
    displayName: "Awa Kone",
    consent: true,
    multiBroker: true
  };
  const answers = visitorAiAnswers(everything, fields);
  expect(answers).toEqual({ desired_timing: "immediate" });
  const serialised = JSON.stringify(answers);
  for (const leak of ["visitor@example.com", "+2250102030405", "Awa Kone", "Palmiers", "Abidjan", "consent", "optin"]) {
    expect(serialised).not.toContain(leak);
  }
});

test("visitor AI answers drop empty, non-finite and over-long keys", () => {
  const answers = visitorAiAnswers(
    { desired_timing: "", budget: Number.NaN, ["k".repeat(65)]: "x", notes: "ok" },
    [...fields, { key: "k".repeat(65), type: "text", sensitivity: "public" }]
  );
  expect(answers).toEqual({ notes: "ok" });
});

test("quote form hands the real answers to both assistants", () => {
  const form = readSource(publicFile("components/quote-form.tsx"));
  expect(form).not.toContain("answers={{}}");
  expect(form).toContain('mode="summary" answers={assistAnswers}');
  expect(form).toContain('mode="consistency" answers={assistAnswers}');
  // The answers go through the allow-list, never straight from the raw form data.
  expect(form).toContain("visitorAiAnswers(collectAnswers(");
});
