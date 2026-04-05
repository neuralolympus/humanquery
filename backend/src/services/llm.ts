import {
  ai,
  ax,
  AxAIGoogleGeminiModel,
  AxAIOpenAIModel,
  f,
} from '@ax-llm/ax';
import { QueryRejectedError } from '../errors.js';
import type { GeneratedQuery, SchemaTable } from '../types.js';
import { serializeSchemaAsDDL } from './introspector.js';

const QUERY_INTENTS = ['answerable', 'not_schema_relevant', 'unclear'] as const;
type QueryIntent = (typeof QUERY_INTENTS)[number];

const querySignature = f()
  .input('schemaDDL', f.string('Database schema as CREATE TABLE DDL with FK comments'))
  .input('nlQuery', f.string('User question in plain English'))
  .input('dialect', f.string('Target SQL dialect: postgresql, mysql, mssql, sqlite'))
  .output('rawSQL', f.string('Read-only SQL for the target dialect'))
  .output('prisma', f.string())
  .output('typeorm', f.string())
  .output('sequelize', f.string())
  .output('sqlalchemy', f.string())
  .output('djangoOrm', f.string())
  .output('explanation', f.string('One short paragraph explaining the query plan'))
  .output('tablesUsed', f.string('Referenced table name').array('Logical tables touched'))
  .output(
    'estimatedRisk',
    f.class(['safe', 'moderate', 'destructive'] as const, 'Estimated scan / safety risk'),
  )
  .output(
    'queryIntent',
    f.class(QUERY_INTENTS, 'Whether the question maps to the given schema'),
  )
  .output(
    'userMessage',
    f.string(
      'If queryIntent is answerable: empty string. Otherwise: one short sentence telling the user to rephrase using only schema tables/columns, or why the question is unclear.',
    ),
  )
  .build();

const generator = ax(querySignature);

const SYSTEM_INSTRUCTION = `You are an expert database engineer.
Given SCHEMA (CREATE TABLE DDL with FK comments), a plain English question, and TARGET DIALECT, classify the question and either produce queries or refuse politely.

QUERY INTENT (queryIntent + userMessage):
- answerable: the question can be answered with a read-only SELECT (or equivalent) using ONLY tables/columns in SCHEMA. Set userMessage to empty string "".
- not_schema_relevant: the question is about another domain, asks for mutations (insert/update/delete), or cannot be answered from SCHEMA alone. Set userMessage to a specific, helpful one-sentence explanation (mention that answers must use the listed tables).
- unclear: gibberish, too vague, or unparseable. Set userMessage asking the user to clarify and reference schema entities.

When queryIntent is NOT answerable:
- Still fill every output field so the contract is satisfied. Use benign placeholders: rawSQL must be exactly "-- not applicable" (single line). prisma/typeorm/sequelize/sqlalchemy/djangoOrm: short comment-only or no-op style strings like "// not applicable". explanation: brief note. tablesUsed: empty array []. estimatedRisk: safe.

When queryIntent IS answerable:
- Produce real read-only code/SQL as below.

STRICT RULES (answerable only):
- NEVER generate INSERT, UPDATE, DELETE, DROP, TRUNCATE, ALTER, GRANT, REVOKE
- ALWAYS add LIMIT 1000 (or dialect equivalent: TOP/FETCH) unless the query is COUNT/aggregation returning one row
- Match syntax to TARGET DIALECT (postgresql: INTERVAL '30 days'; mysql: DATE_SUB; mssql: DATEADD; sqlite: datetime('now','-30 days') etc.)
- Prisma: use $queryRaw for GROUP BY or complex aggregation; do not use findMany with GROUP BY
- TypeORM: QueryBuilder for joins; .find() only for trivial single-table reads
- Sequelize: set subQuery: false when using associations with limit/offset
- SQLAlchemy: 2.x style only — select(Model).where(...); NOT session.query()
- Django ORM: select_related for FK joins; annotate for aggregations
- estimatedRisk: safe = indexed/simple filters; moderate = likely full table scan without indexed filter; destructive = any data modification (must never happen for valid answers)

Fill every output field. tablesUsed: exact table names as they appear in SCHEMA.`;

type AxLlm = ReturnType<typeof ai>;

let cachedOpenAi: AxLlm | null = null;
let cachedGemini: AxLlm | null = null;

function hasOpenAiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function hasGeminiKey(): boolean {
  return Boolean(
    process.env.GEMINI_API_KEY?.trim() ??
      process.env.GOOGLE_API_KEY?.trim() ??
      process.env.GOOGLE_APIKEY?.trim(),
  );
}

function openaiApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error('Set OPENAI_API_KEY for OpenAI');
  }
  return key;
}

function openaiModel(): AxAIOpenAIModel | string {
  const raw = process.env.OPENAI_MODEL?.trim();
  if (!raw) return AxAIOpenAIModel.GPT41;
  const allowed = new Set(Object.values(AxAIOpenAIModel));
  if (allowed.has(raw as AxAIOpenAIModel)) {
    return raw as AxAIOpenAIModel;
  }
  return raw;
}

function geminiApiKey(): string {
  const key =
    process.env.GEMINI_API_KEY?.trim() ??
    process.env.GOOGLE_API_KEY?.trim() ??
    process.env.GOOGLE_APIKEY?.trim();
  if (!key) {
    throw new Error('Set GEMINI_API_KEY (or GOOGLE_API_KEY / GOOGLE_APIKEY) for Gemini');
  }
  return key;
}

function geminiModel(): AxAIGoogleGeminiModel {
  const raw = process.env.GEMINI_MODEL?.trim();
  if (!raw) return AxAIGoogleGeminiModel.Gemini25FlashLite;
  const allowed = new Set(Object.values(AxAIGoogleGeminiModel));
  if (!allowed.has(raw as AxAIGoogleGeminiModel)) {
    throw new Error(
      `Invalid GEMINI_MODEL "${raw}". Use a value from AxAIGoogleGeminiModel (e.g. gemini-2.5-flash-lite).`,
    );
  }
  return raw as AxAIGoogleGeminiModel;
}

function getOpenAiLlm(): AxLlm {
  if (cachedOpenAi) return cachedOpenAi;
  const model = openaiModel();
  cachedOpenAi = ai({
    name: 'openai',
    apiKey: openaiApiKey(),
    config: {
      model: model as AxAIOpenAIModel,
      temperature: 0.2,
    },
  });
  return cachedOpenAi;
}

function getGeminiLlm(): AxLlm {
  if (cachedGemini) return cachedGemini;
  cachedGemini = ai({
    name: 'google-gemini',
    apiKey: geminiApiKey(),
    config: {
      model: geminiModel(),
      temperature: 0.2,
    },
  });
  return cachedGemini;
}

async function runWithLlmFallback<T>(
  run: (llm: AxLlm, model: AxAIOpenAIModel | AxAIGoogleGeminiModel | string) => Promise<T>,
): Promise<T> {
  const useOpenAi = hasOpenAiKey();
  const useGemini = hasGeminiKey();
  if (!useOpenAi && !useGemini) {
    throw new Error(
      'Set OPENAI_API_KEY (primary) and/or GEMINI_API_KEY (fallback) in the backend environment.',
    );
  }
  if (useOpenAi) {
    try {
      return await run(getOpenAiLlm(), openaiModel());
    } catch (primaryErr) {
      if (!useGemini) throw primaryErr;
      const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      console.warn(`[humanquery] OpenAI request failed, falling back to Gemini: ${msg}`);
      return await run(getGeminiLlm(), geminiModel());
    }
  }
  return await run(getGeminiLlm(), geminiModel());
}

function isQueryIntent(x: unknown): x is QueryIntent {
  return typeof x === 'string' && (QUERY_INTENTS as readonly string[]).includes(x);
}

function validateTablesUsedAgainstSchema(tablesUsed: string[], schema: SchemaTable[]): void {
  if (tablesUsed.length === 0) return;
  const exact = new Set(schema.map((t) => t.name));
  const byLower = new Map(schema.map((t) => [t.name.toLowerCase(), t.name]));
  const unknown: string[] = [];
  for (const u of tablesUsed) {
    if (exact.has(u)) continue;
    if (byLower.has(u.toLowerCase())) continue;
    unknown.push(u);
  }
  if (unknown.length > 0) {
    throw new QueryRejectedError(
      `The generated plan references tables not in your schema: ${unknown.join(', ')}. Rephrase using only tables from your connection.`,
      'QUERY_SCHEMA_MISMATCH',
    );
  }
}

type ForwardOut = Awaited<ReturnType<typeof generator.forward>>;

async function forwardLlm(
  llm: AxLlm,
  model: AxAIOpenAIModel | AxAIGoogleGeminiModel | string,
  schemaDDL: string,
  nlQuery: string,
  dialect: string,
): Promise<ForwardOut> {
  generator.setInstruction(SYSTEM_INSTRUCTION);
  return generator.forward(llm, { schemaDDL, nlQuery, dialect }, {
    model,
    modelConfig: { maxTokens: 8192, temperature: 0.2 },
  });
}

function toGeneratedQuery(out: ForwardOut, schema: SchemaTable[]): GeneratedQuery {
  const intentRaw = out.queryIntent;
  if (!isQueryIntent(intentRaw)) {
    throw new Error(`Invalid queryIntent from model: ${String(intentRaw)}`);
  }

  if (intentRaw !== 'answerable') {
    const msg = (out.userMessage ?? '').trim();
    throw new QueryRejectedError(
      msg ||
        (intentRaw === 'unclear'
          ? 'Could not understand the question. Try rephrasing using table and column names from your schema.'
          : 'That question does not match this database schema. Ask something answerable from the tables shown in the sidebar.'),
      'QUERY_NOT_APPLICABLE',
    );
  }

  const risk = out.estimatedRisk;
  if (risk !== 'safe' && risk !== 'moderate' && risk !== 'destructive') {
    throw new Error(`Invalid estimatedRisk from model: ${String(risk)}`);
  }

  const generated: GeneratedQuery = {
    rawSQL: out.rawSQL,
    prisma: out.prisma,
    typeorm: out.typeorm,
    sequelize: out.sequelize,
    sqlalchemy: out.sqlalchemy,
    djangoOrm: out.djangoOrm,
    explanation: out.explanation,
    tablesUsed: out.tablesUsed ?? [],
    estimatedRisk: risk,
  };

  if (generated.estimatedRisk === 'destructive') {
    throw new Error('Destructive query blocked: model marked estimatedRisk as destructive');
  }

  validateTablesUsedAgainstSchema(generated.tablesUsed, schema);

  return generated;
}

export async function generateQuery(
  schema: SchemaTable[],
  nlQuery: string,
  dialect: string,
): Promise<GeneratedQuery> {
  const schemaDDL = serializeSchemaAsDDL(schema);
  const out = await runWithLlmFallback((llm, model) =>
    forwardLlm(llm, model, schemaDDL, nlQuery, dialect),
  );
  return toGeneratedQuery(out, schema);
}
