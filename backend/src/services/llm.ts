import { ai, ax, AxAIGoogleGeminiModel, f } from '@ax-llm/ax';
import type { GeneratedQuery, SchemaTable } from '../types.js';
import { serializeSchemaAsDDL } from './introspector.js';

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
  .build();

const generator = ax(querySignature);

const SYSTEM_INSTRUCTION = `You are an expert database engineer.
Given SCHEMA (CREATE TABLE DDL with FK comments), a plain English question, and TARGET DIALECT, produce the equivalent query in ALL output fields simultaneously.

STRICT RULES:
- NEVER generate INSERT, UPDATE, DELETE, DROP, TRUNCATE, ALTER, GRANT, REVOKE
- ALWAYS add LIMIT 1000 (or dialect equivalent: TOP/FETCH) unless the query is COUNT/aggregation returning one row
- Match syntax to TARGET DIALECT (postgresql: INTERVAL '30 days'; mysql: DATE_SUB; mssql: DATEADD; sqlite: datetime('now','-30 days') etc.)
- Prisma: use $queryRaw for GROUP BY or complex aggregation; do not use findMany with GROUP BY
- TypeORM: QueryBuilder for joins; .find() only for trivial single-table reads
- Sequelize: set subQuery: false when using associations with limit/offset
- SQLAlchemy: 2.x style only — select(Model).where(...); NOT session.query()
- Django ORM: select_related for FK joins; annotate for aggregations
- estimatedRisk: safe = indexed/simple filters; moderate = likely full table scan without indexed filter; destructive = any data modification (must never happen for valid answers)

Fill every output field. tablesUsed: actual table names from the schema.`;

let cachedLlm: ReturnType<typeof ai> | null = null;

function geminiApiKey(): string {
  const key =
    process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? process.env.GOOGLE_APIKEY;
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

function getLlm() {
  if (cachedLlm) return cachedLlm;
  const apiKey = geminiApiKey();
  const model = geminiModel();
  cachedLlm = ai({
    name: 'google-gemini',
    apiKey,
    config: {
      model,
      temperature: 0.2,
    },
  });
  return cachedLlm;
}

export async function generateQuery(
  schema: SchemaTable[],
  nlQuery: string,
  dialect: string,
): Promise<GeneratedQuery> {
  generator.setInstruction(SYSTEM_INSTRUCTION);
  const llm = getLlm();
  const schemaDDL = serializeSchemaAsDDL(schema);
  const model = geminiModel();

  const out = await generator.forward(llm, { schemaDDL, nlQuery, dialect }, {
    model,
    modelConfig: { maxTokens: 8192, temperature: 0.2 },
  });

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

  return generated;
}
