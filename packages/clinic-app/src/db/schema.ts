import { sqliteTable as table, unique } from "drizzle-orm/sqlite-core";
import * as t from "drizzle-orm/sqlite-core";
import { softDelete, timestamps } from "./columns.helper";
import { createId } from "@paralleldrive/cuid2";

/**
 * This is the users table schema
 * It includes personal and contact information
 * as well as timestamps and soft delete columns
 */

/**
 * Not yet finalized. All the necessary tables that are bound to be in this
 * clinic-app will be added in the future once the ERD is finalized by the team.
 */
export const users = table("users", {
  id: t.text().$defaultFn(() => createId()).primaryKey(),

  // Clerk unique identifier
  // Test the seeding for now without using this field yet.
  // authUserId: t.text().notNull().unique(),

  // TODO: User type: Patient, Clinic Staff, Clinic Admin

  // name
  firstName: t.text().notNull(),
  middleName: t.text(),
  lastName: t.text().notNull(),
  suffix: t.text(),
  nickname: t.text(),

  // contact info
  email: t.text().notNull().unique(),
  phoneNumber: t.text().notNull().unique(),

  // personal info
  gender: t.text({ enum: ["MALE", "FEMALE"] }),
  civilStatus: t.text({ enum: ["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "SEPARATED"] }),
  dateOfBirth: t.text(),
  nationality: t.text(),
  religion: t.text(),
  bloodType: t.text(),

  // createdAt, updatedAt
  ...timestamps,

  // soft delete columns can be added similarly
  ...softDelete
}, (t) => [
  // unique().on(t.id, t.authUserId)
]);

export const patientUser = table("patient_user", {
  id: t.text().$defaultFn(() => createId()).primaryKey(),
  userId: t.text().notNull().references(() => users.id),

  // TODO: Additional patient-specific fields can be added here
});

export const address = table("address", {
  id: t.text().$defaultFn(() => createId()).primaryKey(),
  userId: t.text().notNull().references(() => users.id),
})
