import type { Page } from "../types";

export const MAX_PAGE_SIZE = 100;

export function normalizePagination(page?: number, pageSize?: number): { page: number; pageSize: number; skip: number; take: number } {
  const normalizedPage = Math.max(1, Math.trunc(page ?? 1));
  const normalizedPageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(pageSize ?? 25)));
  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
    skip: (normalizedPage - 1) * normalizedPageSize,
    take: normalizedPageSize
  };
}

export function paginate<T>(items: T[], page?: number, pageSize?: number): Page<T> {
  const normalized = normalizePagination(page, pageSize);
  return {
    items: items.slice(normalized.skip, normalized.skip + normalized.take),
    page: normalized.page,
    pageSize: normalized.pageSize,
    total: items.length
  };
}
