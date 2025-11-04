import { ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite";
import AsyncStorage from "expo-sqlite/kv-store";
import { users } from "./schema";

/**
 * This seeding is still subject to change as the ERD is still not
 * finalized and we may need to adjust the seeding process accordingly.
 */
export const seedUserData = async (db: ExpoSQLiteDatabase) => {
  const value = await AsyncStorage.getItemAsync("seeded_user");
  console.log("Seed check - already seeded?", value);
  if (value) {
    console.log("Data already seeded, skipping");
    return;
  }

  console.log("Inserting seed data...");
  await db.insert(users).values([
    {
      firstName: "John",
      lastName: "Doe",
      email: "john.doe@example.com",
      phoneNumber: "+1234567890",
    },
    {
      firstName: "Jane",
      lastName: "Smith",
      email: "jane.smith@example.com",
      phoneNumber: "+0987654321",
    }
  ]);

  await AsyncStorage.setItemAsync("seeded_user", "true");
  console.log("Seed data inserted successfully");
};
