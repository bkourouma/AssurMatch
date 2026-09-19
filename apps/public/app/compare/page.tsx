import { ScoreBreakdown } from "../components/offer-cards";
import { IndicativeOfferNotice, TechnicalRoleNotice } from "../components/public-journey";
import { comparePublicOffers } from "../lib/public-api";

type SearchParams = Record<string, string | string[] | undefined>;

function idsFrom(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(raw.flatMap((item) => item.split(",")).map((item) => item.trim()).filter(Boolean))];
}

function cell(value: string | number | boolean | null): string {
  if (value === null) return "non renseigne";
  if (typeof value === "boolean") return value ? "oui" : "non";
  return String(value);
}

export default async function PublicComparePage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const query = searchParams ? await searchParams : {};
  const ids = idsFrom(query.ids);
  const priority = Array.isArray(query.priority) ? query.priority[0] : query.priority;
  const comparison = ids.length >= 2 && ids.length <= 4 ? await comparePublicOffers(ids, priority) : null;

  return (
    <main>
      <h1>Comparer les offres cote a cote</h1>
      <TechnicalRoleNotice />
      <IndicativeOfferNotice />
      {ids.length < 2 || ids.length > 4 ? (
        <p role="alert">Selectionnez entre 2 et 4 offres indicatives du meme pays et du meme produit pour les comparer.</p>
      ) : null}
      {comparison?.status === "error" ? <p role="alert">{comparison.publicMessage ?? "Comparaison indisponible."}</p> : null}
      {comparison?.status === "success" && comparison.data ? (
        <>
          <p>{comparison.data.disclaimer}</p>
          <table aria-label="Comparaison des offres">
            <thead>
              <tr>
                <th>Critere</th>
                {comparison.data.items.map((offer) => (
                  <th key={offer.id}>
                    {offer.name}{offer.isSponsored ? " (Sponsorise)" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.data.rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{row.label}</th>
                  {comparison.data!.items.map((offer) => <td key={offer.id}>{cell(row.values[offer.id] ?? null)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <section aria-label="Scores indicatifs">
            {comparison.data.items.map((offer) => (
              <article key={offer.id}>
                <h2>{offer.name}</h2>
                {offer.score ? <ScoreBreakdown score={offer.score} /> : null}
                <a href={`/offers/${offer.id}`}>Voir le detail</a>
              </article>
            ))}
          </section>
        </>
      ) : null}
      <nav aria-label="Parcours public">
        <a href="/countries/CI">Comparer les offres</a>
      </nav>
    </main>
  );
}
