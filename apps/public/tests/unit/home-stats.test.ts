import { describe, expect, it } from "vitest";
import { buildHomeFigures } from "../../app/lib/home-stats";

const stats = { openCountries: 0, activeBrokers: 2, validatedOffers: 5 };

describe("buildHomeFigures", () => {
  it("counts open countries from the directory, ignoring a zero from /public-stats", () => {
    const figures = buildHomeFigures(stats, [{ availability: "open" }, { availability: "waitlist" }, { availability: "pilot" }]);
    expect(figures).toEqual([
      { key: "countriesCount", value: 2 },
      { key: "partnersCount", value: 2 },
      { key: "offersCount", value: 5 }
    ]);
  });

  it("omits the countries figure when the directory is empty", () => {
    expect(buildHomeFigures(stats, []).map((figure) => figure.key)).toEqual(["partnersCount", "offersCount"]);
  });

  it("never shows 0 countries from the stats when the directory says otherwise", () => {
    const figures = buildHomeFigures({ openCountries: 0, activeBrokers: 0, validatedOffers: 0 }, [{ availability: "open" }]);
    expect(figures.find((figure) => figure.key === "countriesCount")?.value).toBe(1);
  });

  it("hides the whole block when every figure is zero", () => {
    expect(buildHomeFigures({ openCountries: 0, activeBrokers: 0, validatedOffers: 0 }, [{ availability: "waitlist" }])).toEqual([]);
    expect(buildHomeFigures(null, [])).toEqual([]);
  });
});
