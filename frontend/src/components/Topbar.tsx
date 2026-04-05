import type { ConnectionListItem, Dialect } from '../api';
import { IconHistory, IconMenu } from './Icons';

const DIALECTS: { value: Dialect; label: string }[] = [
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'mssql', label: 'MS SQL Server' },
  { value: 'sqlite', label: 'SQLite' },
];

export function Topbar(props: {
  active: ConnectionListItem | null;
  onOpenConnectionModal: () => void;
  schemaDrawerOpen: boolean;
  onToggleSchemaDrawer: () => void;
}) {
  const { active, onOpenConnectionModal, schemaDrawerOpen, onToggleSchemaDrawer } = props;

  return (
    <div className="navbar min-h-12 shrink-0 border-b border-base-300 bg-base-200 px-4">
      <div className="navbar-start gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-square btn-sm transition-colors lg:hidden"
          aria-expanded={schemaDrawerOpen}
          aria-controls="schema-panel"
          onClick={onToggleSchemaDrawer}
        >
          <IconMenu className="h-5 w-5" />
        </button>
        <span className="font-display text-lg font-normal tracking-tight text-base-content">
          Human<span className="text-success">Query</span>
        </span>
      </div>

      <div className="navbar-center">
        <button
          type="button"
          className="badge badge-soft badge-success cursor-pointer gap-2"
          onClick={onOpenConnectionModal}
        >
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-success" />
          {active ? `${active.name} · ${active.dialectLabel}` : 'No connection'}
        </button>
      </div>

      <div className="navbar-end gap-2">
        <select
          className="select select-ghost select-sm"
          value={active?.dialect ?? 'postgresql'}
          disabled
          title="Dialect of the active connection"
        >
          {DIALECTS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <label htmlFor="history-drawer" className="btn btn-square btn-ghost btn-sm transition-colors">
          <IconHistory className="h-5 w-5" />
          <span className="sr-only">Open query history</span>
        </label>
      </div>
    </div>
  );
}
