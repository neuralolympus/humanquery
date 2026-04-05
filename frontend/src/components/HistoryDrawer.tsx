import type { HistoryItem } from '../api';

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function HistoryDrawer(props: {
  history: HistoryItem[];
  onSelect: (item: HistoryItem) => void;
}) {
  const { history, onSelect } = props;

  return (
    <div className="flex min-h-full w-80 flex-col gap-3 border-l border-base-300 bg-base-200 p-4">
      <h3 className="font-mono text-sm font-semibold">Query History</h3>
      <ul className="flex flex-col gap-2 overflow-y-auto">
        {history.length === 0 ? (
          <li className="text-xs opacity-50">No queries yet</li>
        ) : (
          history.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="card card-sm bg-base-100 hover:border-success w-full cursor-pointer border border-base-300 text-left"
                onClick={() => onSelect(h)}
              >
                <div className="card-body gap-1 px-3 py-2">
                  <p className="line-clamp-2 font-sans text-xs text-base-content">{h.nlQuery}</p>
                  <div className="flex items-center justify-between">
                    <span className="badge badge-ghost badge-xs font-mono">{h.rowCount} rows</span>
                    <span className="font-mono text-xs text-base-content/40">{timeAgo(h.createdAt)}</span>
                  </div>
                </div>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
