import type frMessages from "../../../messages/fr.json";

/**
 * Spec 062: the catalogue subtrees the messaging client components receive from the server page
 * (the client boundary ships no `QuoteRequest` namespace). The French catalogue is the type source;
 * the i18n spec guarantees the English tree has the same keys. Values are templates with `{name}`
 * placeholders, filled in the browser by `fillTemplate`.
 */
export type MessagingLabels = (typeof frMessages)["QuoteRequest"]["messaging"];
export type DocumentRequestLabels = (typeof frMessages)["QuoteRequest"]["documentRequests"];
export type DataRequestLabels = (typeof frMessages)["QuoteRequest"]["dataRequests"];
