/**
 * Narrows a message tree down to the namespaces a client boundary actually needs, so the public
 * pages never ship the whole catalogue to the browser.
 */
export function pickMessages<TMessages extends object, TKey extends keyof TMessages>(
  messages: TMessages,
  keys: readonly TKey[]
): Pick<TMessages, TKey> {
  const picked: Partial<Pick<TMessages, TKey>> = {};
  for (const key of keys) {
    if (key in messages) picked[key] = messages[key];
  }
  return picked as Pick<TMessages, TKey>;
}
