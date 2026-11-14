import "server-only";
import postgres from "postgres";
import { env } from "./env";

type Sql = postgres.Sql<Record<string, never>>;

// Reuse one pool per server instance (and across hot reloads in dev).
const g = globalThis as unknown as { __limboSql?: Sql };

export function db(): Sql {
  if (!g.__limboSql) {
    const url = env().DATABASE_URL;
    const local = /localhost|127\.0\.0\.1|\/tmp/.test(url);
    g.__limboSql = postgres(url, {
      max: local ? 5 : 3,
      idle_timeout: 20,
      connect_timeout: 10,
      // Pooled (PgBouncer-style) connections do not support prepared statements.
      prepare: local,
      ssl: local ? false : "require",
      transform: { undefined: null },
      onnotice: () => {},
    }) as Sql;
  }
  return g.__limboSql;
}
