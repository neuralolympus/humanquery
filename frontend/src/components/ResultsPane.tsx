import type { GeneratedQuery, OutputType, QueryResult } from '../api';

export function ResultsPane(props: {
  generated: GeneratedQuery | null;
  result: QueryResult | null;
  formatted: string | null;
  outputType: OutputType;
}) {
  const { generated, result, formatted, outputType } = props;

  if (!result) return null;

  const statusOk = true;

  return (
    <div className="flex flex-col gap-4">
      {generated?.estimatedRisk === 'moderate' ? (
        <div role="alert" className="alert alert-warning alert-soft alert-sm mb-0">
          <span className="font-mono text-xs">
            Elevated risk: broad scan possible — prefer filters on indexed columns when you can.
          </span>
        </div>
      ) : null}
      {generated?.estimatedRisk === 'destructive' ? (
        <div role="alert" className="alert alert-error mb-0">
          <span className="font-mono text-xs">
            Destructive query blocked. Only SELECT statements are allowed.
          </span>
        </div>
      ) : null}

      <div className="stats stats-horizontal w-full border border-base-300">
        <div className="stat px-5 py-3">
          <div className="stat-title text-xs">Rows</div>
          <div className="stat-value text-lg">{result.rowCount}</div>
        </div>
        <div className="stat px-5 py-3">
          <div className="stat-title text-xs">Exec time</div>
          <div className="stat-value text-lg">{result.execTimeMs}ms</div>
        </div>
        <div className="stat px-5 py-3">
          <div className="stat-title text-xs">Status</div>
          <div className="stat-value text-lg">
            {statusOk ? <span className="badge badge-success badge-sm">OK</span> : null}
          </div>
        </div>
      </div>

      {outputType === 'table' ? (
        <div className="overflow-x-auto rounded-box border border-base-300">
          <table className="table table-zebra table-sm font-mono text-xs">
            <thead>
              <tr className="bg-base-200">
                {result.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci}>{cell === null || cell === undefined ? '' : String(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <pre className="bg-base-200 rounded-box border border-base-300 p-3 font-mono text-xs whitespace-pre-wrap">
          {formatted ?? ''}
        </pre>
      )}
    </div>
  );
}
