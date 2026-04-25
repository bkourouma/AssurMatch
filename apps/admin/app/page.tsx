export default function AdminHomePage() {
  return (
    <main>
      <h1>AssurMatch Admin</h1>
      <nav aria-label="Administration socle">
        <a href="/catalog">Catalogue</a>
        <a href="/partners">Partenaires</a>
        <a href="/users">Utilisateurs</a>
        <a href="/feature-flags">Feature flags</a>
        <a href="/compliance">Conformite</a>
        <a href="/operations">Operations</a>
      </nav>
    </main>
  );
}
