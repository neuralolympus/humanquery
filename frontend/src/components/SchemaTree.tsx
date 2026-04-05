import { memo } from 'react';
import type { SchemaTable } from '../api';
import { IconTable } from './Icons';

function SchemaTreeComponent(props: {
  schema: SchemaTable[];
  onColumnClick: (columnName: string) => void;
}) {
  const { schema, onColumnClick } = props;

  return (
    <ul className="menu min-h-full w-64 gap-0.5 bg-base-200 p-2 text-sm">
      <li className="menu-title text-xs uppercase tracking-widest opacity-50">Schema</li>
      {schema.length === 0 ? (
        <li className="px-2 py-4 text-xs opacity-50">Connect and introspect to load tables</li>
      ) : (
        schema.map((table) => (
          <li key={table.name}>
            <details>
              <summary className="flex items-center gap-1.5 font-mono text-xs font-medium">
                <IconTable className="h-3.5 w-3.5 text-base-content/60" />
                {table.name}
              </summary>
              <ul>
                {table.columns.map((col) => (
                  <li key={col.name}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between py-1 font-mono text-xs"
                      onClick={() => onColumnClick(col.name)}
                    >
                      <span>
                        {col.name}
                        {col.isPrimaryKey ? (
                          <span className="badge badge-info badge-xs ml-1">PK</span>
                        ) : null}
                        {col.isForeignKey ? (
                          <span className="badge badge-warning badge-xs ml-1">FK</span>
                        ) : null}
                      </span>
                      <span className="badge badge-ghost badge-xs">{col.type}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))
      )}
    </ul>
  );
}

export const SchemaTree = memo(SchemaTreeComponent);
