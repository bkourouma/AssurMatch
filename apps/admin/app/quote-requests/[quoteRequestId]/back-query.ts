/** Only a plain query string (`?status=new&page=2`) may come back from the list the operator left. */
const BACK_QUERY_PATTERN = /^\?[\w=&%.:+-]{1,400}$/;

/** Returns the validated `?back=` value, or "" when it is missing, not a string or not a plain query string. */
export function safeBackQuery(raw: unknown): string {
  return typeof raw === "string" && BACK_QUERY_PATTERN.test(raw) ? raw : "";
}
