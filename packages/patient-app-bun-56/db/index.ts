import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';
import * as schema from './schema/index';

const APP_VARIANT = process.env.APP_VARIANT ?? 'production';
const expo = SQLite.openDatabaseSync(`clinicez_patient_${APP_VARIANT}.db`);

export const db = drizzle(expo, { schema });
