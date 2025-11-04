import { env } from "@env";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { openDatabaseSync } from "expo-sqlite";

export const expoDb = openDatabaseSync(env.EXPO_PUBLIC_DATABASE_NAME);
export const db = drizzle(expoDb);
export type DrizzleDB = typeof db;