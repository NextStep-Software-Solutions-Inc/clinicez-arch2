import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';
import Constants from 'expo-constants';
import * as schema from './schema/index';
import { createDbWithInterceptor, registerSyncTrigger } from './interceptor';

const APP_VARIANT = process.env.APP_VARIANT ?? 'production';
const dbName =
  process.env.SQLITE_DB_NAME ??
  Constants.expoConfig?.extra?.sqliteDbName ??
  Constants.expoConfig?.extra?.dbName ??
  (APP_VARIANT === 'production' ? 'Clinic EZ_patient.db' : `Clinic EZ_patient_${APP_VARIANT}.db`);

const expo = SQLite.openDatabaseSync(dbName);

export const originalDb = drizzle(expo, { schema });
export const db = createDbWithInterceptor(originalDb);
export { registerSyncTrigger };

/** Web-only concern (sql.js snapshot to IndexedDB); native SQLite persists itself. */
export async function flushDatabaseSnapshot(): Promise<void> {}

/** Web-only concern (clearing persisted IndexedDB snapshot on logout); native SQLite truncates tables directly. */
export async function clearWebDatabaseSnapshot(): Promise<void> {}

/** Native SQLite is synchronous and always ready; web awaits initWebDatabase. */
export async function ensureDatabaseReady(): Promise<void> {}
