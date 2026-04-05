import { memo } from 'react';
import { IconClose } from './Icons';
import { Topbar } from './Topbar';
import { SchemaTree } from './SchemaTree';
import { QueryInput } from './QueryInput';
import { CodePanel } from './CodePanel';
import { HistoryDrawer } from './HistoryDrawer';
import type {
  ConnectionListItem,
  GeneratedQuery,
  HistoryItem,
  OutputType,
  QueryResponse,
  SchemaTable,
} from '../api';

export interface LayoutProps {
  active: ConnectionListItem | null;
  schema: SchemaTable[];
  queryText: string;
  outputType: OutputType;
  loading: boolean;
  error: string | null;
  errorCode: string | null;
  last: QueryResponse | null;
  history: HistoryItem[];
  onOpenConnectionModal: () => void;
  onQueryChange: (q: string) => void;
  onOutputTypeChange: (o: OutputType) => void;
  onRun: () => void;
  onInsertColumn: (name: string) => void;
  onSelectHistory: (item: HistoryItem) => void;
  activeTab: CodeTab;
  onTabChange: (t: CodeTab) => void;
  schemaDrawerOpen: boolean;
  onSchemaDrawerOpenChange: (open: boolean) => void;
  onToggleSchemaDrawer: () => void;
}

export type CodeTab =
  | 'results'
  | 'raw'
  | 'prisma'
  | 'typeorm'
  | 'sequelize'
  | 'sqlalchemy'
  | 'django';

function LayoutComponent(props: LayoutProps) {
  const {
    active,
    schema,
    queryText,
    outputType,
    loading,
    error,
    errorCode,
    last,
    history,
    onOpenConnectionModal,
    onQueryChange,
    onOutputTypeChange,
    onRun,
    onInsertColumn,
    onSelectHistory,
    activeTab,
    onTabChange,
    schemaDrawerOpen,
    onSchemaDrawerOpenChange,
    onToggleSchemaDrawer,
  } = props;

  const generated: GeneratedQuery | null = last?.generated ?? null;
  const result = last?.result ?? null;
  const formatted = last?.formatted ?? null;

  return (
    <div className="drawer drawer-end h-screen">
      <input id="history-drawer" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content flex h-screen min-h-0 flex-col overflow-hidden">
        <div className="relative flex min-h-0 flex-1 flex-row">
          {schemaDrawerOpen ? (
            <button
              type="button"
              className="fixed inset-0 z-[14] bg-black/40 lg:hidden"
              aria-label="Close schema panel"
              onClick={() => onSchemaDrawerOpenChange(false)}
            />
          ) : null}
          <aside
            id="schema-panel"
            className={
              'fixed inset-y-0 left-0 z-[15] flex min-h-0 w-64 max-w-[260px] flex-col border-r border-base-300 bg-base-200 transition-transform duration-200 ease-out lg:relative lg:z-auto lg:translate-x-0 ' +
              (schemaDrawerOpen ? 'translate-x-0' : '-translate-x-full')
            }
          >
            <div className="flex shrink-0 items-center justify-end border-b border-base-300 px-1 py-0.5 lg:hidden">
              <button
                type="button"
                className="btn btn-ghost btn-square btn-sm transition-colors"
                aria-label="Close schema panel"
                onClick={() => onSchemaDrawerOpenChange(false)}
              >
                <IconClose className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SchemaTree schema={schema} onColumnClick={onInsertColumn} />
            </div>
          </aside>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-base-100">
            <Topbar
              active={active}
              onOpenConnectionModal={onOpenConnectionModal}
              schemaDrawerOpen={schemaDrawerOpen}
              onToggleSchemaDrawer={onToggleSchemaDrawer}
            />
            <QueryInput
              schema={schema}
              value={queryText}
              outputType={outputType}
              onChange={onQueryChange}
              onOutputTypeChange={onOutputTypeChange}
              onRun={onRun}
              disabled={!active || loading}
            />
            <CodePanel
              loading={loading}
              error={error}
              errorCode={errorCode}
              activeTab={activeTab}
              onTabChange={onTabChange}
              generated={generated}
              result={result}
              formatted={formatted}
              outputType={outputType}
            />
          </div>
        </div>
      </div>
      <div className="drawer-side z-20 min-h-full">
        <label htmlFor="history-drawer" className="drawer-overlay" aria-hidden />
        <HistoryDrawer history={history} onSelect={onSelectHistory} />
      </div>
    </div>
  );
}

export const Layout = memo(LayoutComponent);
