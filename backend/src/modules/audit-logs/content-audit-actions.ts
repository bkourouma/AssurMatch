/**
 * Lot 9 (spec 072): audit actions of the content CMS. Entries carry the entry identifier, kind, key,
 * locale, country, version and the status before/after: never the editorial text itself.
 */
export const ContentAuditActions = {
  created: "content_cms.created",
  updated: "content_cms.updated",
  submitted: "content_cms.submitted",
  withdrawn: "content_cms.withdrawn",
  approved: "content_cms.approved",
  rejected: "content_cms.rejected",
  archived: "content_cms.archived",
  revised: "content_cms.revised",
  refused: "content_cms.refused",
  forbiddenWording: "content_cms.forbidden_wording"
} as const;
