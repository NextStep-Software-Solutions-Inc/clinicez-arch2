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

export async function persistDatabaseSnapshot(): Promise<void> {
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
  } catch (err) {
    console.warn('[WebDB] Failed to persist SQLite snapshot to IndexedDB:', err);
  }
}

let rawSqlDatabase: Database | null = null;
let initializedDrizzleDb: ReturnType<typeof drizzle> | null = null;
let initPromise: Promise<ReturnType<typeof drizzle>> | null = null;

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

    if (isNewDb) {
      console.log('[WebDB] Initializing new SQLite schema from migrations...');
      const journal = migrations.journal;
      const migrationFiles = migrations.migrations as Record<string, string>;

      for (const entry of journal.entries) {
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
                // Ignore idempotent errors such as table/index already exists
                const msg = String(sqlErr).toLowerCase();
                if (!msg.includes('already exists')) {
                  console.warn(`[WebDB] Migration query warning on: ${trimmed.slice(0, 50)}...`, sqlErr);
                }
              }
            }
          }
        }
      }
      // Save initial snapshot
      await persistDatabaseSnapshot();
    }

    initializedDrizzleDb = drizzle(rawSqlDatabase, { schema });
    return initializedDrizzleDb;
  })();

  return initPromise;
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

// Proxy interceptor to also trigger snapshot persistence on writes
export const db = new Proxy(intercepted, {
  get(target, prop, receiver) {
    const orig = Reflect.get(target, prop, receiver);
    if (prop === 'insert' || prop === 'update' || prop === 'delete') {
      return function (...args: any[]) {
        const res = orig.apply(target, args);
        // Persist DB snapshot to IndexedDB shortly after mutation
        setTimeout(() => {
          persistDatabaseSnapshot().catch(() => {});
        }, 100);
        return res;
      };
    }
    return orig;
  },
});

export { registerSyncTrigger };
