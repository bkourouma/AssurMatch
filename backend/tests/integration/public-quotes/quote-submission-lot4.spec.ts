import { HttpException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  QUOTE_ANSWERS_MAX_KEYS,
  QUOTE_ANSWERS_MAX_SERIALIZED_LENGTH,
  QUOTE_ANSWERS_MAX_VALUE_LENGTH,
  quoteAnswersSchema,
  type QuoteRequestCreateDto
} from "../../../../packages/shared/contracts/quote.contracts";
import { toSafeErrorResponse } from "../../../src/modules/common/filters/error-response.filter";
import { PublicQuoteRequestsController } from "../../../src/modules/http-wiring/runtime-http-wiring.module";
import { invalidAnswerFields } from "../../../src/modules/quote-requests/quote-submission.service";
import { seedComparatorQuote, validQuotePayload } from "../helpers/comparator-quote-seed";
import { superAdminActor } from "../helpers/enterprise-seed";

async function refusal(promise: Promise<unknown>): Promise<{ status: number; body: ReturnType<typeof toSafeErrorResponse> }> {
  try {
    await promise;
  } catch (error) {
    const status = error instanceof HttpException ? error.getStatus() : 500;
    return { status, body: toSafeErrorResponse(error, "c1", status) };
  }
  throw new Error("expected a refusal");
}

describe("quote submission, lot 4 regressions", () => {
  it("bounds the answers record (A-02e1)", () => {
    expect(quoteAnswersSchema.safeParse({ a: "x".repeat(QUOTE_ANSWERS_MAX_VALUE_LENGTH) }).success).toBe(true);
    expect(quoteAnswersSchema.safeParse({ a: "x".repeat(QUOTE_ANSWERS_MAX_VALUE_LENGTH + 1) }).success).toBe(false);
    expect(quoteAnswersSchema.safeParse({ ["k".repeat(101)]: "x" }).success).toBe(false);
    const many = Object.fromEntries(Array.from({ length: QUOTE_ANSWERS_MAX_KEYS + 1 }, (_, index) => [`k${index}`, "x"]));
    expect(quoteAnswersSchema.safeParse(many).success).toBe(false);
    const wide = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`k${index}`, "y".repeat(QUOTE_ANSWERS_MAX_VALUE_LENGTH)]));
    expect(JSON.stringify(wide).length).toBeGreaterThan(QUOTE_ANSWERS_MAX_SERIALIZED_LENGTH);
    expect(quoteAnswersSchema.safeParse(wide).success).toBe(false);
  });

  it("names the answers field when the service refuses an oversized record", async () => {
    const seed = await seedComparatorQuote();
    const payload = { ...validQuotePayload(seed), answers: { vehicle_use: "x".repeat(QUOTE_ANSWERS_MAX_VALUE_LENGTH + 1) } };
    const { status, body } = await refusal(seed.app.quoteRequests.publicController.submit(payload as QuoteRequestCreateDto, superAdminActor));
    expect(status).toBe(422);
    expect(body.code).toBe("VALIDATION_FAILED");
    expect(body.message).toContain("answers");
  });

  it("names the answers field on the HTTP controller too: 422 VALIDATION_FAILED, not the generic 400", async () => {
    const seed = await seedComparatorQuote();
    const controller = new PublicQuoteRequestsController({ quoteRequests: seed.app.quoteRequests } as never);
    const payload = { ...validQuotePayload(seed), answers: { vehicle_use: "x".repeat(QUOTE_ANSWERS_MAX_VALUE_LENGTH + 1) } };
    const { status, body } = await refusal(Promise.resolve().then(() => controller.submitQuote(payload as QuoteRequestCreateDto, { headers: {}, ip: "203.0.113.9" } as never)));
    expect(status).toBe(422);
    expect(body.code).toBe("VALIDATION_FAILED");
    expect(body.message).toContain("answers");
  });

  it("refuses a submission missing a required field of the published form with 422 naming it (A-02e2)", async () => {
    const seed = await seedComparatorQuote();
    const publicForm = await seed.app.quoteForms.service.publicForm(seed.countryId, seed.productId, "fr");
    const required = publicForm.fields.filter((field) => field.required).map((field) => field.key);
    expect(required.length).toBeGreaterThan(0);
    const payload = { ...validQuotePayload(seed), answers: {} };
    const { status, body } = await refusal(seed.app.quoteRequests.publicController.submit(payload as QuoteRequestCreateDto, superAdminActor));
    expect(status).toBe(422);
    expect(body.code).toBe("VALIDATION_FAILED");
    for (const key of required) expect(body.message).toContain(key);
    expect(await seed.app.leads.assignments.list()).toHaveLength(0);
  });

  it("detects missing required and negative number answers (A-02d)", () => {
    const fields = [
      { key: "city", type: "text", required: true },
      { key: "budget", type: "number", required: false },
      { key: "ok", type: "checkbox", required: false }
    ];
    expect(invalidAnswerFields(fields, {})).toEqual(["city"]);
    expect(invalidAnswerFields(fields, { city: "  " })).toEqual(["city"]);
    expect(invalidAnswerFields(fields, { city: "Abidjan", budget: -1 })).toEqual(["budget"]);
    expect(invalidAnswerFields(fields, { city: "Abidjan", budget: 0, ok: false })).toEqual([]);
    expect(invalidAnswerFields(fields, { city: "Abidjan", budget: "12" })).toEqual([]);
  });

  it("answers 404 PRODUCT_NOT_FOUND for an unknown product and 404 for an unknown country (A-04c3)", async () => {
    const seed = await seedComparatorQuote();
    const product = await refusal(seed.app.quoteRequests.publicController.submit({ ...validQuotePayload(seed), productKey: "inconnu-xyz" } as QuoteRequestCreateDto, superAdminActor));
    expect(product.status).toBe(404);
    expect(product.body.code).toBe("PRODUCT_NOT_FOUND");
    const country = await refusal(seed.app.quoteRequests.publicController.submit({ ...validQuotePayload(seed), countryCode: "ZZ" } as QuoteRequestCreateDto, superAdminActor));
    expect(country.status).toBe(404);
    expect(country.body.code).toBe("COUNTRY_DISABLED");
  });

  it("answers the honeypot with a neutral 400 (A-03g)", async () => {
    const seed = await seedComparatorQuote();
    const payload = { ...validQuotePayload(seed), answers: { vehicle_use: "prive", website: "bot" } };
    const { status, body } = await refusal(seed.app.quoteRequests.publicController.submit(payload as QuoteRequestCreateDto, superAdminActor));
    expect(status).toBe(400);
    expect(body.message).toBe("Request could not be processed");
  });
});
