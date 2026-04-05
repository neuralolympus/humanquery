import type { QueryResult } from '../types.js';
import type { OutputType } from '../types.js';

export function format(result: QueryResult, outputType: OutputType): string | null {
  switch (outputType) {
    case 'table':
      return null;
    case 'json': {
      const objects = result.rows.map((row) => {
        const o: Record<string, unknown> = {};
        result.columns.forEach((c, i) => {
          o[c] = row[i];
        });
        return o;
      });
      return JSON.stringify(objects, null, 2);
    }
    case 'csv': {
      const esc = (v: unknown): string => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const header = result.columns.map(esc).join(',');
      const body = result.rows.map((row) => row.map(esc).join(',')).join('\n');
      return body ? `${header}\n${body}` : header;
    }
    case 'count':
      return String(result.rowCount);
    default: {
      const _: never = outputType;
      return _;
    }
  }
}
