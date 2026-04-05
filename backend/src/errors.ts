export type QueryRejectedCode = 'QUERY_NOT_APPLICABLE' | 'QUERY_SCHEMA_MISMATCH';

export class QueryRejectedError extends Error {
  readonly code: QueryRejectedCode;

  constructor(message: string, code: QueryRejectedCode) {
    super(message);
    this.name = 'QueryRejectedError';
    this.code = code;
  }
}

export function isQueryRejectedError(e: unknown): e is QueryRejectedError {
  return e instanceof QueryRejectedError;
}
