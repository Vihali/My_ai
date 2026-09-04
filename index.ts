import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaEnsureSchemaPromise?: Promise<void>;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);

// ---------------------------------------------------------------------------
// Self-initializing schema: idempotent CREATE TABLE statements so the app
// boots on ANY PostgreSQL host (Neon, Supabase, Render, RDS…) with nothing
// but a DATABASE_URL — no manual migrations or drizzle-kit step required.
// ---------------------------------------------------------------------------
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'New session',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  mode text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  kind text NOT NULL DEFAULT 'preference',
  source text NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'todo',
  source text NOT NULL DEFAULT 'user',
  "order" integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE TABLE IF NOT EXISTS settings (
  id text PRIMARY KEY DEFAULT 'main',
  provider text NOT NULL DEFAULT 'openai',
  model text,
  base_url text,
  api_key text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

export function ensureSchema(): Promise<void> {
  if (!globalForDb.__arenaEnsureSchemaPromise) {
    globalForDb.__arenaEnsureSchemaPromise = pool
      .query(SCHEMA_SQL)
      .then(() => undefined)
      .catch((err) => {
        console.error("ensureSchema failed:", err);
        // Allow retry on the next call instead of caching a failure forever
        globalForDb.__arenaEnsureSchemaPromise = undefined;
        throw err;
      });
  }
  return globalForDb.__arenaEnsureSchemaPromise;
}

// Best-effort warm-up at process start; health route also awaits it.
void ensureSchema().catch(() => undefined);
