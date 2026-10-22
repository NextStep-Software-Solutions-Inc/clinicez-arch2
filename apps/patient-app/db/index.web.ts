import { drizzle } from 'drizzle-orm/sql-js';
import type { Database } from 'sql.js';
import * as schema from './schema/index';
import { createDbWithInterceptor, registerSyncTrigger } from './interceptor';
import migrations from '../drizzle/migrations';

const IDB_NAME = 'ClinicEzPatientDb';
const IDB_STORE = 'sqlite_snapshot';
const IDB_KEY = 'latest_db_bytes';

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    const req = window.indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadPersistedBytes(): Promise<Uint8Array | null> {
  try {
    const idb = await openIndexedDb();
    return new Promise((resolve) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
      req.onsuccess = () => resolve(req.result instanceof Uint8Array ? req.result : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

let persistChain: Promise<void> = Promise.resolve();
let dirty = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
const PERSIST_DEBOUNCE_MS = 300;

async function writeSnapshot(): Promise<void> {
  if (!rawSqlDatabase) return;
  try {
    const bytes = rawSqlDatabase.export();
    const idb = await openIndexedDb();
    await new Promise<void>((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(bytes, IDB_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    idb.close();
  } catch (err) {
    console.warn('[WebDB] Failed to persist SQLite snapshot to IndexedDB:', err);
  }
}

/** Serialized (never concurrent) snapshot write; resolves once this snapshot is stored. */
export function persistDatabaseSnapshot(): Promise<void> {
  dirty = false;
  persistChain = persistChain.then(writeSnapshot, writeSnapshot);
  return persistChain;
}

/**
 * Write any pending changes now. Call after bulk writes (e.g. server hydration) and on
 * page hide so data survives a reload even inside the debounce window.
 */
export async function flushDatabaseSnapshot(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (dirty) {
    await persistDatabaseSnapshot();
  } else {
    await persistChain;
  }
}

function markDirty() {
  dirty = true;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistDatabaseSnapshot();
  }, PERSIST_DEBOUNCE_MS);
}

const WRITE_STATEMENT = /^\s*(insert|update|delete|replace|create|drop|alter)\b/i;

/**
 * Instruments the raw sql.js handle so EVERY write schedules a snapshot - including the
 * ones made through `originalDb` (server hydration, auth summary upserts) which bypass the
 * sync interceptor. Hooking the handle (not a drizzle proxy) also fires on execution rather
 * than on query-builder creation.
 */
function instrumentWrites(raw: Database) {
  const prepare = raw.prepare.bind(raw);
  const run = raw.run.bind(raw);
  const exec = raw.exec.bind(raw);
  raw.prepare = ((sql: string, params?: any) => {
    if (WRITE_STATEMENT.test(sql)) markDirty();
    return prepare(sql, params);
  }) as typeof raw.prepare;
  raw.run = ((sql: string, params?: any) => {
    if (WRITE_STATEMENT.test(sql)) markDirty();
    return run(sql, params);
  }) as typeof raw.run;
  raw.exec = ((sql: string, params?: any) => {
    if (WRITE_STATEMENT.test(sql)) markDirty();
    return exec(sql, params);
  }) as typeof raw.exec;
}

function registerFlushOnHide() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushDatabaseSnapshot();
  });
  window.addEventListener('pagehide', () => {
    void flushDatabaseSnapshot();
  });
}
let rawSqlDatabase: Database | null = null;
let initializedDrizzleDb: ReturnType<typeof drizzle> | null = null;
let initPromise: Promise<ReturnType<typeof drizzle>> | null = null;

function ensureRequiredColumns(rawDb: Database): boolean {
  let anyModified = false;
  const tableColumns: Record<string, Array<{ name: string; type: string; defaultValue?: string }>> = {
    patient_government_ids: [
      { name: 'sponsor_pin', type: 'text' },
      { name: 'sponsor_last_name', type: 'text' },
      { name: 'sponsor_first_name', type: 'text' },
      { name: 'sponsor_middle_name', type: 'text' },
      { name: 'sponsor_suffix', type: 'text' },
      { name: 'sponsor_dob', type: 'text' },
      { name: 'sponsor_relationship', type: 'text' },
    ],
    prescriptions: [
      { name: 'is_philhealth_gamot', type: 'integer', defaultValue: '0' },
      { name: 'philhealth_drug_code', type: 'text' },
      { name: 'unique_prescription_security_code', type: 'text' },
      { name: 'gamot_coverage_amount', type: 'real' },
    ],
    files_metadata: [
      { name: 'title', type: 'text' },
      { name: 'document_date', type: 'text' },
      { name: 'facility_name', type: 'text' },
      { name: 'notes', type: 'text' },
      { name: 'is_cached', type: 'integer', defaultValue: '0' },
      { name: 'last_sync_error', type: 'text' },
      { name: 'retry_count', type: 'integer', defaultValue: '0' },
    ],
  };

  for (const [table, cols] of Object.entries(tableColumns)) {
    try {
      const res = rawDb.exec(`PRAGMA table_info(${table})`);
      if (res && res.length > 0 && res[0].values) {
        const existingCols = new Set(res[0].values.map((row) => String(row[1]).toLowerCase()));
        for (const col of cols) {
          if (!existingCols.has(col.name.toLowerCase())) {
            const defClause = col.defaultValue !== undefined ? ` DEFAULT ${col.defaultValue}` : '';
            rawDb.run(`ALTER TABLE \`${table}\` ADD \`${col.name}\` ${col.type}${defClause};`);
            console.log(`[WebDB] Added missing column ${table}.${col.name}`);
            anyModified = true;
          }
        }
      }
    } catch (err) {
      console.warn(`[WebDB] Column safety check error on ${table}:`, err);
    }
  }

  return anyModified;
}

export async function initWebDatabase(): Promise<ReturnType<typeof drizzle>> {
  if (initializedDrizzleDb) return initializedDrizzleDb;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Dynamically import sql.js to avoid SSR / node bundling issues
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs({
      locateFile: (file: string) => {
        if (typeof window !== 'undefined' && window.location) {
          return `${window.location.origin}/${file}`;
        }
        return `https://sql.js.org/dist/${file}`;
      },
    });

    const persistedBytes = await loadPersistedBytes();
    let isNewDb = false;

    if (persistedBytes && persistedBytes.length > 0) {
      try {
        rawSqlDatabase = new SQL.Database(persistedBytes);
        console.log('[WebDB] Restored existing SQLite database from IndexedDB');
      } catch (err) {
        console.warn('[WebDB] Corrupt persisted DB, creating fresh DB:', err);
        rawSqlDatabase = new SQL.Database();
        isNewDb = true;
      }
    } else {
      rawSqlDatabase = new SQL.Database();
      isNewDb = true;
    }

    // Ensure migrations table exists
    try {
      rawSqlDatabase.run(
        'CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric);'
      );
    } catch (err) {
      console.warn('[WebDB] Failed to ensure __drizzle_migrations table:', err);
    }

    // Read applied migrations
    const appliedTimestamps = new Set<number>();
    try {
      const records = rawSqlDatabase.exec('SELECT created_at FROM "__drizzle_migrations"');
      if (records.length > 0 && records[0].values) {
        for (const row of records[0].values) {
          if (row[0] !== null && row[0] !== undefined) {
            appliedTimestamps.add(Number(row[0]));
          }
        }
      }
    } catch (err) {
      console.warn('[WebDB] Failed to read __drizzle_migrations:', err);
    }

    let migrationsApplied = false;
    const journal = migrations.journal;
    const migrationFiles = migrations.migrations as Record<string, string>;

    for (const entry of journal.entries) {
      if (appliedTimestamps.has(entry.when)) {
        continue;
      }
      const key = `m${entry.idx.toString().padStart(4, '0')}`;
      const query = migrationFiles[key];
      if (query) {
        const statements = query.split('--> statement-breakpoint');
        for (const stmt of statements) {
          const trimmed = stmt.trim();
          if (trimmed) {
            try {
              rawSqlDatabase.run(trimmed);
            } catch (sqlErr) {
              const msg = String(sqlErr).toLowerCase();
              if (!msg.includes('already exists') && !msg.includes('duplicate column')) {
                console.warn(`[WebDB] Migration query warning on: ${trimmed.slice(0, 50)}...`, sqlErr);
              }
            }
          }
        }
        try {
          rawSqlDatabase.run('INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)', [
            '',
            entry.when,
          ]);
        } catch {
          // Ignore insertion error
        }
        migrationsApplied = true;
      }
    }

    const columnsPatched = ensureRequiredColumns(rawSqlDatabase);

    if (isNewDb || migrationsApplied || columnsPatched) {
      console.log(
        `[WebDB] Schema updated (isNewDb=${isNewDb}, migrationsApplied=${migrationsApplied}, columnsPatched=${columnsPatched}), saving snapshot...`
      );
      await persistDatabaseSnapshot();
    }

    // Instrument AFTER schema bootstrap + first snapshot so migrations don't queue extra writes.
    instrumentWrites(rawSqlDatabase);
    registerFlushOnHide();

    initializedDrizzleDb = drizzle(rawSqlDatabase, { schema });
    return initializedDrizzleDb;
  })();

  return initPromise;
}

export async function ensureDatabaseReady(): Promise<void> {
  if (initializedDrizzleDb) return;
  await initWebDatabase();
}

// Proxied originalDb that forwards queries to initializedDrizzleDb once ready
export const originalDb = new Proxy({} as any, {
  get(_target, prop, receiver) {
    if (!initializedDrizzleDb) {
      throw new Error(`[WebDB] originalDb accessed before initWebDatabase() resolved. Ensure DatabaseProvider is mounted.`);
    }
    return Reflect.get(initializedDrizzleDb, prop, receiver);
  },
});

// Wrapped db with the same sync-interceptor as mobile
const intercepted = createDbWithInterceptor(originalDb);

// Same sync-interceptor as mobile. Snapshot persistence is handled at the sql.js handle level
// (see instrumentWrites), so both db and originalDb writes are persisted.
export const db = intercepted;

export { registerSyncTrigger };
