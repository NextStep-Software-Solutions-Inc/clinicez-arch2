---
description: "Add a new Drizzle ORM table or column to the Patient App schema. Handles table definition, type inference, index.ts export, syncQueue integration, and reminds you to generate migrations. Use when: new DB table, new column, schema change, Drizzle migration."
name: "New Drizzle Schema"
agent: "agent"
argument-hint: "Describe the table or column to add (e.g. 'medications table with name, dosage, patientId')"
tools: [read, edit, search]
---
You are adding a new Drizzle ORM table or column to the ClinicEZ Patient App schema at `packages/patient-app/`.

## Steps

1. **Read existing schema** — Read all files in `packages/patient-app/db/schema/` to understand current table patterns, naming conventions, and column types in use.

2. **Define the table/column** — Create or update the appropriate file in `packages/patient-app/db/schema/`. Follow these rules:
   - Use `sqliteTable` from `drizzle-orm/sqlite-core`.
   - Column naming: `camelCase` in TypeScript, `snake_case` in the DB (`columnName: text('column_name')`).
   - Always include `createdAt` and `updatedAt` timestamp columns on new tables.
   - Use `integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true })` for surrogate keys.
   - For foreign keys to `patients`, use `patientId: integer('patient_id').references(() => patients.id)`.

3. **Export from index** — Add the new table (and its inferred types) to `packages/patient-app/db/schema/index.ts`:
   ```ts
   export * from './newTable';
   export type NewTable = typeof newTable.$inferSelect;
   export type NewNewTable = typeof newTable.$inferInsert;
   ```

4. **SyncQueue consideration** — If the new table stores data that must sync to a clinic backend, confirm with the user whether mutations to this table should be enqueued in `syncQueue`. If yes, show the enqueue pattern using the existing `syncQueue` schema as a reference.

5. **Remind about migration** — After all edits, output this reminder:
   > Run the following in `packages/patient-app/` to generate the migration:
   > ```
   > yarn drizzle-kit generate
   > ```
   > Then restart the Expo dev server so the new migration is applied on next app launch.

## Constraints
- DO NOT edit any file inside `packages/patient-app/drizzle/` — those are auto-generated.
- DO NOT write manual TypeScript interfaces for DB row types — always use `$inferSelect` / `$inferInsert`.
- Stay inside `packages/patient-app/`.
