import { useCallback, useEffect, useState } from 'react';
import {
  fetchConnections,
  fetchHistory,
  introspect,
  runQuery,
  type ConnectionListItem,
  type HistoryItem,
  type OutputType,
  type QueryResponse,
  type SchemaTable,
} from './api';
import { ConnectionModal } from './components/ConnectionModal';
import { Layout, type CodeTab } from './components/Layout';

function openConnectionModal() {
  (document.getElementById('conn-modal') as HTMLDialogElement | null)?.showModal();
}

function closeConnectionModal() {
  (document.getElementById('conn-modal') as HTMLDialogElement | null)?.close();
}

export default function App() {
  const [connections, setConnections] = useState<ConnectionListItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [schema, setSchema] = useState<SchemaTable[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [queryText, setQueryText] = useState('');
  const [outputType, setOutputType] = useState<OutputType>('table');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<QueryResponse | null>(null);
  const [activeTab, setActiveTab] = useState<CodeTab>('results');
  const [schemaDrawerOpen, setSchemaDrawerOpen] = useState(false);

  const active = connections.find((c) => c.id === activeId) ?? null;

  useEffect(() => {
    fetchConnections()
      .then((list) => {
        setConnections(list);
        setActiveId((cur) => {
          if (cur && list.some((c) => c.id === cur)) return cur;
          return list[0]?.id ?? null;
        });
      })
      .catch(() => setConnections([]));
  }, []);

  useEffect(() => {
    if (!activeId) {
      setSchema([]);
      setHistory([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const [sRes, hRes] = await Promise.allSettled([introspect(activeId), fetchHistory(activeId)]);
      if (cancelled) return;
      if (sRes.status === 'fulfilled') setSchema(sRes.value);
      else setSchema([]);
      if (hRes.status === 'fulfilled') setHistory(hRes.value);
      else setHistory([]);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  useEffect(() => {
    setSchemaDrawerOpen(false);
  }, [activeId]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onMq = () => {
      if (mq.matches) setSchemaDrawerOpen(false);
    };
    onMq();
    mq.addEventListener('change', onMq);
    return () => mq.removeEventListener('change', onMq);
  }, []);

  const handleRun = useCallback(async () => {
    if (!activeId || !queryText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await runQuery({
        connectionId: activeId,
        nlQuery: queryText.trim(),
        outputType,
      });
      setLast(res);
      setActiveTab('results');
      const h = await fetchHistory(activeId);
      setHistory(h);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
      setLast(null);
    } finally {
      setLoading(false);
    }
  }, [activeId, queryText, outputType]);

  const handleInsertColumn = useCallback((name: string) => {
    setQueryText((q) => (q ? `${q} ${name}` : name));
  }, []);

  const handleSelectHistory = useCallback((item: HistoryItem) => {
    setQueryText(item.nlQuery);
    const drawer = document.getElementById('history-drawer') as HTMLInputElement | null;
    if (drawer) drawer.checked = false;
  }, []);

  const handleToggleSchemaDrawer = useCallback(() => {
    setSchemaDrawerOpen((o) => !o);
  }, []);

  return (
    <>
      <Layout
        active={active}
        schema={schema}
        queryText={queryText}
        outputType={outputType}
        loading={loading}
        error={error}
        last={last}
        history={history}
        onOpenConnectionModal={openConnectionModal}
        onQueryChange={setQueryText}
        onOutputTypeChange={setOutputType}
        onRun={handleRun}
        onInsertColumn={handleInsertColumn}
        onSelectHistory={handleSelectHistory}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        schemaDrawerOpen={schemaDrawerOpen}
        onSchemaDrawerOpenChange={setSchemaDrawerOpen}
        onToggleSchemaDrawer={handleToggleSchemaDrawer}
      />
      <ConnectionModal
        connections={connections}
        activeId={activeId}
        onClose={closeConnectionModal}
        onSaved={async (c) => {
          const list = await fetchConnections();
          setConnections(list);
          setActiveId(c.id);
        }}
        onSelect={(id) => {
          setActiveId(id);
        }}
        onDeleted={async (id) => {
          const list = await fetchConnections();
          setConnections(list);
          setActiveId((cur) => {
            if (cur !== id) return cur;
            return list[0]?.id ?? null;
          });
        }}
      />
    </>
  );
}
