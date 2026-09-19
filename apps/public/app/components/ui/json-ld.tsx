export interface JsonLdProps {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
}

/** `<` is escaped so a value coming from the API can never close the script tag. */
export function JsonLd({ data }: JsonLdProps) {
  const json = JSON.stringify(data).replace(/</g, "\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
