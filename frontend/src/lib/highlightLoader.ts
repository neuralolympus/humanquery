import type { HLJSApi } from 'highlight.js';

let hljsPromise: Promise<HLJSApi> | null = null;

/** Loads highlight.js once with only sql, typescript, and python grammars. */
export function getHljs(): Promise<HLJSApi> {
  if (!hljsPromise) {
    hljsPromise = (async () => {
      const hljs = (await import('highlight.js/lib/core')).default;
      const sql = (await import('highlight.js/lib/languages/sql')).default;
      const typescript = (await import('highlight.js/lib/languages/typescript')).default;
      const python = (await import('highlight.js/lib/languages/python')).default;
      hljs.registerLanguage('sql', sql);
      hljs.registerLanguage('typescript', typescript);
      hljs.registerLanguage('python', python);
      return hljs;
    })();
  }
  return hljsPromise;
}
