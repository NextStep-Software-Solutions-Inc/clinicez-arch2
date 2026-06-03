import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';
import * as schema from './schema/index';

const expo = SQLite.openDatabaseSync('clinicez_patient.db');

export const db = drizzle(expo, { schema });
