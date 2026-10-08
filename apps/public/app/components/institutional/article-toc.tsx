export interface ArticleTocEntry {
  id: string;
  heading: string;
}

export interface ArticleTocProps {
  /** Visible heading and accessible name, e.g. « Sommaire ». */
  title: string;
  entries: readonly ArticleTocEntry[];
}

/**
 * The table of contents of a long reading page (guide, legal page). It sits in the article column
 * on a phone and moves into a rail beside the text from 1024px (see `.am-article` in
 * institutional.css). Not numbered: the sections of these pages carry no order of their own.
 */
export function ArticleToc({ title, entries }: ArticleTocProps) {
  if (entries.length < 2) return null;
  return (
    <nav className="am-article__toc" aria-label={title}>
      <p className="am-toc__title">{title}</p>
      <ul className="am-toc__list">
        {entries.map((entry) => (
          <li key={entry.id}>
            <a href={`#${entry.id}`}>{entry.heading}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
