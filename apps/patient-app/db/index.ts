import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';
import * as schema from './schema/index';
import { createDbWithInterceptor, registerSyncTrigger } from './interceptor';

const APP_VARIANT = process.env.APP_VARIANT ?? 'production';
const expo = SQLite.openDatabaseSync(`Clinic EZ_patient_${APP_VARIANT}.db`);

export const originalDb = drizzle(expo, { schema });
export const db = createDbWithInterceptor(originalDb);
export { registerSyncTrigger };

/** Web-only concern (sql.js snapshot to IndexedDB); native SQLite persists itself. */
export async function flushDatabaseSnapshot(): Promise<void> {}
