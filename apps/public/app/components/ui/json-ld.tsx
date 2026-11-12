import { serializeJsonLd } from "./json-ld-serialize";

export interface JsonLdProps {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
}

/** The payload is escaped by `serializeJsonLd`: a value coming from the API can never close the script tag. */
export function JsonLd({ data }: JsonLdProps) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
