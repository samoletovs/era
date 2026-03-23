import { Request } from "express";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@shared/constants";

export interface PaginationParams {
  limit: number;
  offset: number;
}

/** Extract validated pagination params from query string */
export function parsePagination(req: Request): PaginationParams {
  const rawLimit = parseInt(req.query.limit as string, 10);
  const rawOffset = parseInt(req.query.offset as string, 10);
  return {
    limit: (rawLimit > 0 && rawLimit <= MAX_PAGE_SIZE) ? rawLimit : DEFAULT_PAGE_SIZE,
    offset: (rawOffset >= 0) ? rawOffset : 0,
  };
}

/** Build Cosmos SQL OFFSET/LIMIT clause */
export function paginationClause(p: PaginationParams): string {
  return `OFFSET ${p.offset} LIMIT ${p.limit}`;
}

/** Wrap results with pagination metadata */
export function paginatedResponse<T>(items: T[], params: PaginationParams, total?: number) {
  return {
    data: items,
    meta: {
      limit: params.limit,
      offset: params.offset,
      count: items.length,
      ...(total !== undefined ? { total } : {}),
    },
  };
}
