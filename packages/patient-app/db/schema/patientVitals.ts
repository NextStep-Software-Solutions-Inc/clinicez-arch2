import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { patients } from "./patients";

/**
 * Patient vitals and physical metrics — PhilHealth PKA v1.1 PEPERT data group.
 * Captures physical measurements, vital signs, and visual acuity.
 * One row per patient (most recent reading).
 */
export const patientVitals = sqliteTable("patient_vitals", {
	id: text("id").primaryKey(),
	patientId: text("patient_id")
		.notNull()
		.unique()
		.references(() => patients.id, { onDelete: "cascade" }),

	/** Systolic blood pressure in mmHg (pSystolic) */
	systolic: real("systolic"),
	/** Diastolic blood pressure in mmHg (pDiastolic) */
	diastolic: real("diastolic"),
	/** Heart rate in beats per minute (pHr) */
	hr: real("hr"),
	/** Respiratory rate in breaths per minute (pRr) */
	rr: real("rr"),
	/** Core body temperature in Celsius, e.g. 36.50 (pTemp) */
	temp: real("temp"),
	/** Standing height in centimeters (pHeight) */
	height: real("height"),
	/** Weight in kilograms (pWeight) */
	weight: real("weight"),
	/** Body Mass Index: weight(kg) / [height(m)]² (pBMI) */
	bmi: real("bmi"),
	/** Pediatric Z-score string for children up to 60 months, e.g. "> +3SD" (pZScore) */
	zScore: text("z_score"),
	/** Left eye visual acuity measurement string (pLeftVision) */
	leftVision: text("left_vision"),
	/** Right eye visual acuity measurement string (pRightVision) */
	rightVision: text("right_vision"),

	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
});

export type PatientVitals = typeof patientVitals.$inferSelect;
export type NewPatientVitals = typeof patientVitals.$inferInsert;
