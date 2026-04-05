import type { SchemaTable } from '../api';

/** Schema-derived example prompts (static, no LLM). */

/** ORM / migration / changelog tables — excluded from quick prompts and placeholder hints. */
const MIGRATION_TABLE_EXACT = new Set(
  [
    '_prisma_migrations',
    'prisma_migrations',
    'schema_migrations',
    'ar_internal_metadata',
    'sequelizemeta',
    'sequelize_meta',
    'knex_migrations',
    'knex_migrations_lock',
    'flyway_schema_history',
    'django_migrations',
    'alembic_version',
    'typeorm_metadata',
    'typeorm_migrations',
    'mikro_orm_migrations',
    'databasechangelog',
    'databasechangeloglock',
  ].map((s) => s.toLowerCase()),
);

function normalizeTableName(name: string): string {
  let s = name.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith('`') && s.endsWith('`'))
  ) {
    s = s.slice(1, -1);
  }
  if (s.startsWith('[') && s.endsWith(']')) {
    s = s.slice(1, -1);
  }
  return s.toLowerCase();
}

function isMigrationMetadataTable(tableName: string): boolean {
  const n = normalizeTableName(tableName);
  if (MIGRATION_TABLE_EXACT.has(n)) return true;
  // Entity Framework Core (SQL Server / PostgreSQL)
  if (/^__efmigrationshistory$/.test(n)) return true;
  return false;
}

function schemaForQuickPrompts(schema: SchemaTable[]): SchemaTable[] {
  return schema.filter((t) => !isMigrationMetadataTable(t.name));
}

function isPromptableFkParent(parentTable: string | undefined): boolean {
  return Boolean(parentTable && !isMigrationMetadataTable(parentTable));
}

const BLOB_LIKE = /blob|binary|bytea|image|varbinary|raw\b/i;
const DATE_LIKE = /\b(date|time|timestamp|datetime|year)\b/i;
const NUMERIC_LIKE =
  /integer|numeric|decimal|float|double|real|money|bigint|smallint|serial|number|\bint\b|double precision/i;
const TEXT_LIKE = /\b(char|text|varchar|nvarchar|string|enum|citext)\b/i;

const MONEY_NAME = /amount|total|price|revenue|payment|subtotal|cost|fee|balance|paid|gross|net|discount|tax\b/i;
const VOLUME_NAME = /\b(qty|quantity|units|volume|items)\b|_qty\b|line_items\b/i;
const DIMENSION_NAME = /status|state|stage|category|region|channel|type|segment|country|city|plan|tier|source/i;

function isSafeDistinctType(colType: string): boolean {
  return !BLOB_LIKE.test(colType);
}

function firstNumericColumn(t: SchemaTable) {
  return t.columns.find(
    (c) => !c.isPrimaryKey && isSafeDistinctType(c.type) && NUMERIC_LIKE.test(c.type),
  );
}

function firstMoneyNumericColumn(t: SchemaTable) {
  return t.columns.find(
    (c) =>
      !c.isPrimaryKey &&
      isSafeDistinctType(c.type) &&
      NUMERIC_LIKE.test(c.type) &&
      MONEY_NAME.test(c.name),
  );
}

function firstVolumeNumericColumn(t: SchemaTable) {
  return t.columns.find(
    (c) =>
      !c.isPrimaryKey &&
      isSafeDistinctType(c.type) &&
      NUMERIC_LIKE.test(c.type) &&
      VOLUME_NAME.test(c.name),
  );
}

function firstDateColumn(t: SchemaTable) {
  return t.columns.find((c) => DATE_LIKE.test(c.type));
}

function firstTextColumn(t: SchemaTable) {
  return t.columns.find(
    (c) => !c.isPrimaryKey && isSafeDistinctType(c.type) && TEXT_LIKE.test(c.type),
  );
}

function firstDimensionTextColumn(t: SchemaTable) {
  return t.columns.find(
    (c) =>
      !c.isPrimaryKey &&
      isSafeDistinctType(c.type) &&
      TEXT_LIKE.test(c.type) &&
      DIMENSION_NAME.test(c.name),
  );
}

function firstFk(t: SchemaTable) {
  return t.columns.find((c) => c.isForeignKey && c.references);
}

/** Scenario-style prompts derived from schema (stable order). */
export function buildSchemaQuickPrompts(schema: SchemaTable[], max = 6): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (s: string) => {
    if (out.length >= max || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };

  const tables = [...schemaForQuickPrompts(schema)].sort((a, b) => a.name.localeCompare(b.name));

  for (const t of tables) {
    if (out.length >= max) break;
    const dt = firstDateColumn(t);
    const money = firstMoneyNumericColumn(t);
    const vol = firstVolumeNumericColumn(t);
    const num = firstNumericColumn(t);
    const dim = firstDimensionTextColumn(t);
    const fk = firstFk(t);
    const parent = fk?.references?.table;
    const parentOk = isPromptableFkParent(parent);

    if (dt && money) {
      add(`Monthly revenue trend: sum ${money.name} from ${t.name} by calendar month (${dt.name})`);
    }
    if (dt && vol && !money) {
      add(`Monthly volume: total ${vol.name} from ${t.name} by month (${dt.name})`);
    }
    if (dt && num && !money && !vol) {
      add(`Monthly KPI: total ${num.name} from ${t.name} by month (${dt.name})`);
    }
    if (dim && (money ?? num)) {
      const m = money ?? num!;
      add(`Business mix: sum ${m.name} from ${t.name} broken down by ${dim.name}`);
    }
    if (parentOk && (money ?? num)) {
      const m = money ?? num!;
      add(`Top contributing ${parent} by total ${m.name} from ${t.name}`);
    }
    if (parentOk) {
      add(`Retention signal: ${parent} with no related ${t.name}`);
    }
    if (num && !dt) {
      add(`Best performers: top 10 ${t.name} by ${num.name}`);
    }
    if (dim && !money && !num) {
      add(`Pipeline view: count ${t.name} rows by ${dim.name}`);
    }
    if (fk && !money && !num && parentOk) {
      add(`${t.name} with ${parent} details — joined operational view`);
    }
  }

  for (const t of tables) {
    if (out.length >= max) break;
    const fk = firstFk(t);
    const fkParent = fk?.references?.table;
    const fkOk = isPromptableFkParent(fkParent);
    const num = firstNumericColumn(t);
    const dt = firstDateColumn(t);
    const txt = firstTextColumn(t);

    if (fk && fkOk) add(`How many ${t.name} rows per ${fkParent}?`);
    if (num && fk && fkOk) {
      add(`Average ${num.name} on ${t.name}, grouped by ${fkParent}`);
    }
    if (num && txt && !DIMENSION_NAME.test(txt.name)) {
      add(`Sum ${num.name} on ${t.name} grouped by ${txt.name}`);
    }
    if (dt) add(`Count ${t.name} rows by month using ${dt.name}`);
  }

  for (const t of tables) {
    if (out.length >= max) break;
    const col = t.columns.find((c) => !c.isPrimaryKey && isSafeDistinctType(c.type));
    if (col) add(`Distribution: row count per distinct ${col.name} in ${t.name}`);
  }

  return out.slice(0, max);
}

export function schemaQueryPlaceholder(schema: SchemaTable[]): string {
  const business = schemaForQuickPrompts(schema);
  if (business.length === 0) {
    return schema.length === 0
      ? 'e.g. Monthly revenue, pipeline mix, top accounts — ask once schema loads...'
      : 'e.g. Ask about your app tables — migration metadata is hidden from suggestions...';
  }
  const first = [...business].sort((a, b) => a.name.localeCompare(b.name))[0];
  return `e.g. Business scenarios on "${first.name}" — revenue, trends, cohorts...`;
}
