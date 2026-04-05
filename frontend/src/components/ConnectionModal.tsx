import { useState } from 'react';
import type { ConnectionListItem, Dialect } from '../api';
import { deleteConnection, saveConnection, testConnection } from '../api';

const DIALECTS: { value: Dialect; label: string }[] = [
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'mssql', label: 'MS SQL Server' },
  { value: 'sqlite', label: 'SQLite' },
];

export function ConnectionModal(props: {
  connections: ConnectionListItem[];
  activeId: string | null;
  onClose: () => void;
  onSaved: (c: ConnectionListItem) => void;
  onSelect: (id: string) => void;
  onDeleted: (id: string) => void;
}) {
  const { connections, activeId, onClose, onSaved, onSelect, onDeleted } = props;
  const [name, setName] = useState('');
  const [dialect, setDialect] = useState<Dialect>('postgresql');
  const [connectionString, setConnectionString] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleTest() {
    setMsg(null);
    setBusy(true);
    try {
      await testConnection({ dialect, connectionString });
      setMsg('Connection OK');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    setMsg(null);
    setBusy(true);
    try {
      await testConnection({ dialect, connectionString });
      const c = await saveConnection({ name: name || 'database', dialect, connectionString });
      onSaved(c);
      setName('');
      setConnectionString('');
      setMsg('Saved');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog id="conn-modal" className="modal">
      <div className="modal-box w-full max-w-lg">
        <h3 className="mb-4 font-mono text-base font-bold">Database Connections</h3>

        <ul className="mb-6 flex flex-col gap-2" role="list">
          {connections.map((c) => (
            <li key={c.id} className="flex min-w-0 gap-2">
              <button
                type="button"
                className={`flex min-w-0 flex-1 items-center justify-between rounded-box border p-3 text-left transition-[border-color,background-color] bg-base-200 hover:border-success ${
                  c.id === activeId ? 'border-success' : 'border-base-300'
                }`}
                onClick={() => onSelect(c.id)}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${c.id === activeId ? 'bg-success' : 'bg-base-content/30'}`}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-sm font-medium">{c.name}</span>
                    <span className="block text-xs text-base-content/50">{c.dialectLabel}</span>
                  </span>
                </span>
                {c.id === activeId ? <span className="badge badge-success badge-xs shrink-0">active</span> : null}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs shrink-0 self-center"
                onClick={async () => {
                  await deleteConnection(c.id);
                  onDeleted(c.id);
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>

        <div className="divider text-xs">Add New Connection</div>

        <fieldset className="fieldset gap-3">
          {msg ? <p className="font-mono text-xs text-info">{msg}</p> : null}
          <div>
            <label className="label font-mono text-xs" htmlFor="conn-display-name">
              Display Name
            </label>
            <input
              id="conn-display-name"
              type="text"
              className="input input-bordered input-sm w-full font-mono"
              placeholder="my_database"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="label font-mono text-xs" htmlFor="conn-dialect">
              Dialect
            </label>
            <select
              id="conn-dialect"
              className="select select-bordered select-sm w-full font-mono"
              value={dialect}
              onChange={(e) => setDialect(e.target.value as Dialect)}
            >
              {DIALECTS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label font-mono text-xs" htmlFor="conn-url">
              Connection String
            </label>
            <input
              id="conn-url"
              type="password"
              className="input input-bordered input-sm w-full font-mono"
              placeholder="postgresql://user:pass@host:5432/db"
              value={connectionString}
              onChange={(e) => setConnectionString(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="btn btn-outline btn-info btn-sm flex-1 font-mono"
              disabled={busy || !connectionString}
              onClick={handleTest}
            >
              Test Connection
            </button>
            <button
              type="button"
              className="btn btn-success btn-sm flex-1 font-mono"
              disabled={busy || !connectionString}
              onClick={handleSave}
            >
              Save
            </button>
          </div>
        </fieldset>

        <div className="modal-action mt-4">
          <form method="dialog">
            <button type="submit" className="btn btn-ghost btn-sm font-mono" onClick={onClose}>
              Close
            </button>
          </form>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="submit" onClick={onClose}>
          close
        </button>
      </form>
    </dialog>
  );
}
