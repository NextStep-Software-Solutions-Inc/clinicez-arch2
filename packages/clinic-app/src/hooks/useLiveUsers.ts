import { useLiveQuery } from "drizzle-orm/expo-sqlite";
import { db } from "../db/client";
import { users } from "../db/schema";

/**
 * This function uses the useLiveQuery hook from drizzle-orm to fetch
 * the list of live users from the database. It returns an array of user
 * objects that automatically updates when the underlying data changes.
 * @returns An object containing the list of users and any error encountered.
 */
export function useLiveUsers() {
  const result = useLiveQuery(db.select().from(users).orderBy(users.id));
  return {
    users: result || [],
    error: result.error,
  };
}
