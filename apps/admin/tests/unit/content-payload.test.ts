import { describe, expect, it } from "vitest";
import { contentSectionSchema } from "../../../../packages/shared/contracts/content-cms.contracts";
import { fieldsFromPayload, formatSections, parseSections, payloadFromFields, sectionsExample } from "../../app/content/content-payload";

// Lot 9 (spec 072): the sections field of the content forms. No character inside a text is a
// separator any more (the former `id|titre|paragraphe` line cut a paragraph at its first `|`).

const tricky = [
  {
    id: "tarifs",
    heading: "Prime | franchise ‖ plafond",
    body: [
      "Le montant dépend du profil | du véhicule | de la zone.",
      "- 10 % de remise : écrit comme un paragraphe, pas une puce.",
      "# Ceci n'est pas une nouvelle section.",
      "\\ Une barre oblique inverse en tête de ligne."
    ],
    bullets: ["Première puce | avec une barre", "- puce qui commence par un tiret", "# puce qui commence par un dièse"]
  },
  { id: "sans-puces", heading: "- Titre qui commence par un tiret", body: ["Un seul paragraphe."] }
];

describe("content form sections (block format)", () => {
  it("keeps every character of a paragraph, | and ‖ included", () => {
    const parsed = parseSections(["# definition", "Définition", "Texte avec | une barre et ‖ un séparateur.", "Second paragraphe."].join("\n"));
    expect(parsed).toEqual([{ id: "definition", heading: "Définition", body: ["Texte avec | une barre et ‖ un séparateur.", "Second paragraphe."] }]);
  });

  it("reads bullets prefixed by '-', several sections separated by blank lines, CRLF included", () => {
    const parsed = parseSections(["# a-b", "Titre A", "Paragraphe A.", "- puce 1", "-puce 2", "", "# c-d", "Titre C", "Paragraphe C."].join("\r\n"));
    expect(parsed).toEqual([
      { id: "a-b", heading: "Titre A", body: ["Paragraphe A."], bullets: ["puce 1", "puce 2"] },
      { id: "c-d", heading: "Titre C", body: ["Paragraphe C."] }
    ]);
  });

  it("round-trips any single-line texts, including lines that start with a marker", () => {
    const text = formatSections(tricky);
    expect(parseSections(text)).toEqual(tricky);
    for (const section of parseSections(text)) expect(contentSectionSchema.safeParse(section).success).toBe(true);
  });

  it("turns an inner line break of a paragraph into two paragraphs, and of a heading or bullet into a space", () => {
    const text = formatSections([{ id: "x-y", heading: "Titre\nsur deux lignes", body: ["Ligne un\nLigne deux"], bullets: ["puce\n# piège"] }]);
    expect(parseSections(text)).toEqual([{ id: "x-y", heading: "Titre sur deux lignes", body: ["Ligne un", "Ligne deux"], bullets: ["puce # piège"] }]);
  });

  it("refuses what it cannot read, with a message for the form", () => {
    expect(() => parseSections("Texte sans section")).toThrow(/^form_Ligne 1/);
    expect(() => parseSections("# seul-id")).toThrow(/^form_Section 1 invalide/);
    expect(() => parseSections("# id-ok\nTitre")).toThrow(/^form_Section 1 invalide/);
    expect(() => parseSections("#\nTitre\nParagraphe")).toThrow(/^form_Section 1 invalide/);
    expect(parseSections("")).toEqual([]);
  });

  it("the placeholder example is itself valid input", () => {
    expect(parseSections(sectionsExample("introduction", "Introduction"))).toEqual([
      { id: "introduction", heading: "Introduction", body: ["Premier paragraphe.", "Second paragraphe."], bullets: ["Une puce"] }
    ]);
  });

  it("builds the guide and legal payloads from the form fields and back", () => {
    const fields: Record<string, string> = {
      guide_title: "Comprendre la franchise",
      guide_description: "Ce que la franchise change.",
      guide_sections: formatSections(tricky),
      guide_keyPoints: "Point | un\nPoint deux",
      guide_mistakes: "Erreur"
    };
    const payload = payloadFromFields("guide", (name) => fields[name] ?? "");
    expect(payload).toMatchObject({ sections: tricky, keyPoints: ["Point | un", "Point deux"], mistakes: ["Erreur"] });
    expect(fieldsFromPayload("guide", payload).guide_sections).toBe(fields.guide_sections);

    const legal = payloadFromFields("legal_override", (name) => (name === "legal_sections" ? formatSections(tricky) : ""));
    expect(legal).toEqual({ sections: tricky });
  });
});
