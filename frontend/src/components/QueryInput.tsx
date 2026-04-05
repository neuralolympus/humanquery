import type { OutputType } from '../api';
import { IconPlay } from './Icons';

const EXAMPLES = [
  'top customers 30d',
  'revenue by country',
  'low stock products',
  'pending orders today',
];

export function QueryInput(props: {
  value: string;
  outputType: OutputType;
  onChange: (v: string) => void;
  onOutputTypeChange: (o: OutputType) => void;
  onRun: () => void;
  disabled?: boolean;
}) {
  const { value, outputType, onChange, onOutputTypeChange, onRun, disabled } = props;

  const queryId = 'nl-query-input';
  const outputId = 'query-output-format';

  return (
    <div className="shrink-0 border-b border-base-300 bg-base-100 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor={queryId} className="sr-only">
            Natural language query
          </label>
          <textarea
            id={queryId}
            className="textarea textarea-bordered h-16 w-full resize-none font-mono text-sm leading-relaxed transition-[box-shadow,border-color]"
            placeholder="e.g. Show top 5 customers by order value in the last 30 days..."
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onRun();
              }
            }}
          />
        </div>
        <button
          type="button"
          className="btn btn-success btn-sm h-16 gap-2 px-5 font-mono transition-[transform,opacity] active:scale-[0.98]"
          onClick={onRun}
          disabled={disabled}
        >
          <IconPlay className="h-4 w-4" />
          Run
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={outputId} className="sr-only">
            Output format
          </label>
          <select
            id={outputId}
            className="select select-bordered select-sm font-mono text-xs"
            value={outputType}
            onChange={(e) => onOutputTypeChange(e.target.value as OutputType)}
          >
            <option value="table">Output: Table</option>
            <option value="json">Output: JSON</option>
            <option value="csv">Output: CSV</option>
            <option value="count">Output: Count</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className="badge badge-outline badge-sm cursor-pointer font-mono hover:badge-success"
              onClick={() => onChange(ex)}
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
