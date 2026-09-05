// ponytail: sql.js ships no types, minimal declaration for what we use
declare module 'sql.js' {
  interface Database {
    run(sql: string, params?: unknown[]): void
    exec(sql: string, params?: unknown[]): { columns: string[]; values: unknown[][] }[]
    prepare(sql: string): Statement
    export(): Uint8Array
    close(): void
  }
  interface Statement {
    run(params?: unknown[]): void
    free(): void
  }
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database
  }
  export default function initSqlJs(): Promise<SqlJsStatic>
  export type { Database, Statement, SqlJsStatic }
}
