export type Dialect = 'postgresql' | 'mysql' | 'mssql' | 'sqlite';

export interface DBConnection {
  id: string;
  name: string;
  dialect: Dialect;
  connectionString: string;
  createdAt: string;
}

export interface SchemaTable {
  name: string;
  columns: {
    name: string;
    type: string;
    nullable: boolean;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    references?: { table: string; column: string };
  }[];
}

export interface GeneratedQuery {
  rawSQL: string;
  prisma: string;
  typeorm: string;
  sequelize: string;
  sqlalchemy: string;
  djangoOrm: string;
  explanation: string;
  tablesUsed: string[];
  estimatedRisk: 'safe' | 'moderate' | 'destructive';
}

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  execTimeMs: number;
}

export type OutputType = 'table' | 'json' | 'csv' | 'count';

export interface DBConnectionRow {
  id: string;
  name: string;
  dialect: Dialect;
  createdAt: string;
}
