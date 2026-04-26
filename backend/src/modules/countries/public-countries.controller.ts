import { assertNoHeavyPublicSynchronousWork } from "../common/interceptors/async-boundary.interceptor";
import { CountriesService, type Country } from "./countries.module";

export class PublicCountriesController {
  constructor(private readonly countries: CountriesService) {}

  list(): Promise<Country[]> {
    assertNoHeavyPublicSynchronousWork({ publicEndpoint: true, heavySynchronousWork: false });
    return this.countries.listPublic();
  }

  detail(countryCode: string) {
    assertNoHeavyPublicSynchronousWork({ publicEndpoint: true, heavySynchronousWork: false });
    return this.countries.getPublicPage(countryCode);
  }
}
