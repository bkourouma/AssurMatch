const catalogSections = ["Pays", "Regimes reglementaires", "Produits"];

export default function CatalogFoundationPage() {
  return (
    <main>
      <h1>Catalogue socle</h1>
      <section>
        {catalogSections.map((section) => (
          <article key={section}>
            <h2>{section}</h2>
            <p>Gestion interne avec exposition publique desactivee par defaut et actions auditees.</p>
          </article>
        ))}
      </section>
    </main>
  );
}
