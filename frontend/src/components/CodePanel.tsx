import { memo, useEffect, useRef, useState } from 'react';
import type { GeneratedQuery, OutputType, QueryResult } from '../api';
import { getHljs } from '../lib/highlightLoader';
import type { CodeTab } from './Layout';
import { IconKeyboard } from './Icons';
import { ResultsPane } from './ResultsPane';

const LOADING_MSGS = [
  'Introspecting schema...',
  'Planning joins...',
  'Generating ORM variants...',
  'Executing query...',
];

const TAB_META: { id: CodeTab; label: string; lang: string; field: keyof GeneratedQuery | null }[] = [
  { id: 'results', label: 'Results', lang: '', field: null },
  { id: 'raw', label: 'Raw SQL', lang: 'sql', field: 'rawSQL' },
  { id: 'prisma', label: 'Prisma', lang: 'typescript', field: 'prisma' },
  { id: 'typeorm', label: 'TypeORM', lang: 'typescript', field: 'typeorm' },
  { id: 'sequelize', label: 'Sequelize', lang: 'typescript', field: 'sequelize' },
  { id: 'sqlalchemy', label: 'SQLAlchemy', lang: 'python', field: 'sqlalchemy' },
  { id: 'django', label: 'Django ORM', lang: 'python', field: 'djangoOrm' },
];

const TAB_PANEL_ID = 'code-panel-main';

function codeHeader(tab: CodeTab): string {
  switch (tab) {
    case 'raw':
      return 'SQL · Raw';
    case 'prisma':
      return 'TypeScript · Prisma';
    case 'typeorm':
      return 'TypeScript · TypeORM';
    case 'sequelize':
      return 'TypeScript · Sequelize';
    case 'sqlalchemy':
      return 'Python · SQLAlchemy';
    case 'django':
      return 'Python · Django ORM';
    default:
      return '';
  }
}

function EmptyWorkspace() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-base-content/40">
      <IconKeyboard className="h-14 w-14" />
      <p className="max-w-xs text-center font-mono text-sm">Run a natural-language query to see results and generated code.</p>
    </div>
  );
}

function LoadingRotator() {
  const [msgIx, setMsgIx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setMsgIx((x) => (x + 1) % LOADING_MSGS.length), 400);
    return () => clearInterval(t);
  }, []);
  return (
    <p className="font-mono text-xs" id="loading-msg">
      {LOADING_MSGS[msgIx] ?? LOADING_MSGS[0]}
    </p>
  );
}

function CodePanelComponent(props: {
  loading: boolean;
  error: string | null;
  activeTab: CodeTab;
  onTabChange: (t: CodeTab) => void;
  generated: GeneratedQuery | null;
  result: QueryResult | null;
  formatted: string | null;
  outputType: OutputType;
}) {
  const { loading, error, activeTab, onTabChange, generated, result, formatted, outputType } = props;

  const codeRef = useRef<HTMLElement | null>(null);

  const codeText =
    generated && activeTab !== 'results'
      ? (() => {
          const meta = TAB_META.find((t) => t.id === activeTab);
          if (!meta?.field) return '';
          return String(generated[meta.field] ?? '');
        })()
      : '';

  useEffect(() => {
    if (activeTab === 'results' || !codeRef.current || !codeText) return;
    const el = codeRef.current;
    el.removeAttribute('data-highlighted');
    el.textContent = codeText;
    const lang = TAB_META.find((t) => t.id === activeTab)?.lang ?? 'plaintext';
    el.className = `language-${lang}`;

    let cancelled = false;
    (async () => {
      try {
        const hljs = await getHljs();
        if (cancelled || !codeRef.current) return;
        hljs.highlightElement(codeRef.current);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, codeText]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(codeText);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div role="tablist" aria-label="Result and code views" className="tabs tabs-lifted tabs-sm shrink-0 bg-base-100 px-4 pt-2">
        {TAB_META.map((t) => {
          const selected = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`code-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={TAB_PANEL_ID}
              tabIndex={selected ? 0 : -1}
              className={`tab font-mono text-xs transition-[color,background-color] ${selected ? 'tab-active' : ''}`}
              onClick={() => onTabChange(t.id)}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div
        id={TAB_PANEL_ID}
        role="tabpanel"
        aria-labelledby={`code-tab-${activeTab}`}
        className="min-h-0 flex-1 overflow-auto bg-base-100 p-4"
      >
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-base-content/50">
            <span className="loading loading-dots loading-md text-success" />
            <LoadingRotator />
          </div>
        ) : error ? (
          <div role="alert" className="alert alert-error">
            <span className="font-mono text-xs">{error}</span>
          </div>
        ) : activeTab === 'results' ? (
          result ? (
            <ResultsPane
              generated={generated}
              result={result}
              formatted={formatted}
              outputType={outputType}
            />
          ) : (
            <EmptyWorkspace />
          )
        ) : generated ? (
          <div className="mockup-code text-xs">
            <div className="flex items-center justify-between border-b border-base-300 px-4 py-2">
              <span className="font-mono text-xs uppercase tracking-wider text-base-content/50">
                {codeHeader(activeTab)}
              </span>
              <button type="button" className="btn btn-ghost btn-xs font-mono" onClick={copyCode}>
                Copy
              </button>
            </div>
            <pre data-prefix="">
              <code ref={codeRef} />
            </pre>
          </div>
        ) : (
          <EmptyWorkspace />
        )}
      </div>
    </div>
  );
}

export const CodePanel = memo(CodePanelComponent);
