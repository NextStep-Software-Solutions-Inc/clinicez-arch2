# Clinic EZ Patient App — Backend API Reference

> **Base URL (Development):** `http://localhost:5154/api/v1`  
> **Authentication:** All endpoints require a valid Clerk JWT: `Authorization: Bearer <token>`  
> **Content-Type:** `application/json` for all request bodies.  
> **Interactive docs (Dev):** `http://localhost:5154/scalar/v1`  
> **Hangfire dashboard (Dev):** `http://localhost:5154/hangfire`

Every response is wrapped in `ApiResponse<T>`:

```json
{
  "succeeded": true,
  "message": null,
  "data": { "...": "..." },
  "errors": []
}
```

---

## Standard Error Shape

Field-level errors (validation):

```json
{
  "succeeded": false,
  "message": "One or more validation errors occurred.",
  "data": null,
  "errors": [
    { "field": "firstName", "code": "REQUIRED_FIELD_MISSING", "message": "First name is required." },
    { "field": "email",     "code": "INVALID_FIELD_FORMAT",   "message": "Email address is not valid." }
  ]
}
```

Non-field errors (404, 409, 503 …) — `field` is `null`:

```json
{
  "succeeded": false,
  "message": "Patient 'abc' was not found.",
  "data": null,
  "errors": [{ "field": null, "code": "NOT_FOUND", "message": "Patient 'abc' was not found." }]
}
```

### Error code reference

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Field-level validation failure |
| `BAD_REQUEST` | 400 | General bad request |
| `UNAUTHORIZED` | 401 | Missing or invalid JWT |
| `FORBIDDEN` | 403 | Authenticated but not allowed |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Duplicate or state conflict |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded |
| `SERVICE_UNAVAILABLE` | 503 | Upstream clinic API unavailable |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Enum serialisation

Enums travel as **the C# member name, exactly as written (PascalCase), always as a string**; property names stay
camelCase. The API never emits and never accepts a number for an enum: `{"stage": 3}` is a `400`, and so is an unknown
name. (Names are matched case-insensitively on input, but only the PascalCase form is ever produced.)

The same rule holds in the database: every enum column is `varchar` holding the member name (a `[Flags]` enum such as
the sharing scopes is stored as `"Allergies, Vitals"`, all bits as `"All"`).

| C# enum | JSON wire value |
|---|---|
| `SexType.Male` | `"Male"` |
| `BloodType.ABPositive` | `"ABPositive"` |
| `AppointmentStatus.ActionRequired` | `"ActionRequired"` |
| `NotificationCategory.Appointments` | `"Appointments"` |
| `SyncStatus.ConflictResolved` | `"ConflictResolved"` |
| `LabSlipStage.AwaitingPayment` | `"AwaitingPayment"` |

---

## Patients

### `POST /api/v1/patients` — Create profile

Called **once** on first sign-in. `clerkUserId` links the patient row to the Clerk identity for
all subsequent look-ups.

**Request body**

```json
{
  "clerkUserId": "user_2abc123",
  "firstName": "Juan",
  "middleName": null,
  "lastName": "Dela Cruz",
  "suffix": null,
  "sex": "Male",
  "dateOfBirth": "1990-05-15",
  "nationality": "Filipino"
}
```

**201 Created** — `data` is the server-assigned patient UUID. Persist it in `SecureStore`.

```json
{
  "succeeded": true,
  "message": "Patient profile created.",
  "data": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "errors": []
}
```

**Errors**

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `firstName`, `lastName`, or `clerkUserId` missing; invalid `sex` or `dateOfBirth` |
| 409 | `CONFLICT` | A profile already exists for this `clerkUserId` |

---

### `GET /api/v1/patients/by-clerk/{clerkUserId}` — Look up by Clerk ID

Called on every sign-in to retrieve the patient UUID. Returns 404 for first-time users —
use that signal to start the onboarding flow.

**200 OK**

```json
{
  "succeeded": true,
  "data": {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "firstName": "Juan",
    "middleName": null,
    "lastName": "Dela Cruz",
    "suffix": null,
    "sex": "Male",
    "dateOfBirth": "1990-05-15",
    "placeOfBirth": "Manila",
    "bloodType": "OPositive",
    "civilStatus": "Single",
    "nationality": "Filipino",
    "ethnicity": null,
    "religion": "Roman Catholic",
    "primaryLanguage": "Filipino",
    "educationLevel": "College",
    "mobile": "+639171234567",
    "altPhone": null,
    "email": "juan@example.com",
    "messengerHandle": null,
    "avatarUrl": null,
    "consentToShareInfo": true
  },
  "errors": []
}
```

**404** — not found; begin onboarding → `POST /patients`.

---

### `GET /api/v1/patients/{id}` — Slim profile

Returns demographics + addresses + emergency contacts. Suitable for dashboards and list views.

**200 OK**

```json
{
  "succeeded": true,
  "data": {
    "demographics": {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "firstName": "Juan",
      "middleName": null,
      "lastName": "Dela Cruz",
      "sex": "Male",
      "dateOfBirth": "1990-05-15",
      "placeOfBirth": "Manila",
      "bloodType": "OPositive",
      "civilStatus": "Married",
      "nationality": "Filipino",
      "mobile": "+639171234567",
      "email": "juan@example.com",
      "consentToShareInfo": true
    },
    "addresses": [
      {
        "id": "addr-uuid",
        "clientId": "client-uuid",
        "type": "home",
        "street": "123 Rizal St",
        "barangay": "Sampaloc",
        "city": "Manila",
        "province": "Metro Manila",
        "zipCode": "1008",
        "country": "Philippines",
        "isPrimary": true,
        "updatedAt": "2026-06-17T10:00:00Z"
      }
    ],
    "emergencyContacts": [
      {
        "id": "ec-uuid",
        "clientId": "client-uuid",
        "fullName": "Maria Dela Cruz",
        "relationship": "Mother",
        "mobile": "+639179876543",
        "altPhone": null,
        "isPrimary": true,
        "updatedAt": "2026-06-17T10:00:00Z"
      }
    ]
  },
  "errors": []
}
```

---

### `GET /api/v1/patients/{id}/full-record` — Complete record (device hydration)

Returns **all 22 ISyncable entity categories** in a single request.
Call this on **first install or re-install** to seed local SQLite from server state.
After the initial hydration, use `POST /sync` for all subsequent writes.

> ⚠️ This is an expensive query. Do **not** call it on every app-foreground event.
> Use `revalidateOnFocus: false` in the SWR hook (`usePatientFullRecord`).

**200 OK** — only the first few categories shown; all arrays follow the same shape:

```json
{
  "succeeded": true,
  "data": {
    "demographics": {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "firstName": "Juan",
      "lastName": "Dela Cruz",
      "sex": "Male",
      "dateOfBirth": "1990-05-15",
      "placeOfBirth": "Manila",
      "bloodType": "OPositive",
      "civilStatus": "Single",
      "nationality": "Filipino",
      "religion": "Roman Catholic",
      "primaryLanguage": "Filipino",
      "educationLevel": "College",
      "mobile": "+639171234567",
      "email": "juan@example.com",
      "consentToShareInfo": true
    },

    "governmentIds": [
      {
        "id": "gov-uuid",
        "clientId": "client-uuid",
        "idType": "philSys",
        "idNumber": "1234-5678-9012",
        "issuedAt": "2020-01-01",
        "expiresAt": null,
        "updatedAt": "2026-06-17T10:00:00Z"
      }
    ],

    "addresses": [
      {
        "id": "addr-uuid",
        "clientId": "client-uuid",
        "type": "home",
        "street": "123 Rizal St",
        "barangay": "Sampaloc",
        "city": "Manila",
        "province": "Metro Manila",
        "zipCode": "1008",
        "country": "Philippines",
        "isPrimary": true,
        "updatedAt": "2026-06-17T10:00:00Z"
      }
    ],

    "emergencyContacts": [
      {
        "id": "ec-uuid",
        "clientId": "client-uuid",
        "fullName": "Maria Dela Cruz",
        "relationship": "Mother",
        "mobile": "+639179876543",
        "altPhone": null,
        "isPrimary": true,
        "updatedAt": "2026-06-17T10:00:00Z"
      }
    ],

    "healthcareProviders": [
      {
        "id": "hp-uuid",
        "clientId": "client-uuid",
        "providerType": "primaryCare",
        "name": "Dr. Santos",
        "specialty": "Family Medicine",
        "clinicHospital": "St. Luke's Medical Center",
        "phone": "+63291234567",
        "updatedAt": "2026-06-17T10:00:00Z"
      }
    ],

    "allergies": [
      {
        "id": "allergy-uuid",
        "clientId": "client-uuid",
        "allergenName": "Penicillin",
        "allergyType": "drug",
        "severity": "severe",
        "reaction": "Anaphylaxis",
        "onsetDate": "2010-03-15",
        "notes": null,
        "updatedAt": "2026-06-17T10:00:00Z"
      }
    ],

    "medications": [
      {
        "id": "med-uuid",
        "clientId": "client-uuid",
        "medicationName": "Metformin",
        "genericName": "Metformin HCl",
        "dosage": "500mg",
        "frequency": "Twice daily",
        "route": "Oral",
        "startDate": "2024-01-01",
        "endDate": null,
        "isCurrentlyTaking": true,
        "prescribedBy": "Dr. Reyes",
        "purpose": "Type 2 Diabetes management",
        "notes": null,
        "updatedAt": "2026-06-17T10:00:00Z"
      }
    ],

    "surgicalHistories": [
      {
        "id": "surg-uuid",
        "clientId": "client-uuid",
        "procedureName": "Appendectomy",
        "surgeonName": "Dr. Garcia",
        "hospital": "Philippine General Hospital",
        "surgeryDate": "2015-08-20",
        "anesthesiaType": "General",
        "complications": null,
        "notes": null,
        "updatedAt": "2026-06-17T10:00:00Z"
      }
    ],

    "pastIllnesses": [
      {
        "id": "ill-uuid",
        "clientId": "client-uuid",
        "illnessName": "Dengue Fever",
        "diagnosedAt": "2018-07-01",
        "resolvedAt": "2018-07-21",
        "treatmentReceived": "IV fluids, paracetamol",
        "notes": null,
        "updatedAt": "2026-06-17T10:00:00Z"
      }
    ],

    "chronicConditions": [
      {
        "id": "chronic-uuid",
        "clientId": "client-uuid",
        "conditionName": "Type 2 Diabetes Mellitus",
        "diagnosedAt": "2023-06-01",
        "isControlled": true,
        "treatmentNotes": "Lifestyle modification + Metformin",
        "currentMedications": "Metformin 500mg BID",
        "updatedAt": "2026-06-17T10:00:00Z"
      }
    ],

    "familyHistories": [
      {
        "id": "fam-uuid",
        "clientId": "client-uuid",
        "relation": "mother",
        "conditionName": "Hypertension",
        "ageOfOnset": 55,
        "isDeceased": false,
        "notes": null,
        "updatedAt": "2026-06-17T10:00:00Z"
      }
    ],

    "immunizationsSelf": [
      {
        "id": "imm-uuid",
        "clientId": "client-uuid",
        "immunizationCategory": "other",
        "vaccineName": "COVID-19 Booster (Moderna)",
        "doseNumber": "Booster 1",
        "lotNumber": "AB1234",
        "date": "2022-10-15",
        "administeredBy": "RHU Manila",
        "updatedAt": "2026-06-17T10:00:00Z"
      }
    ],

    "disabilities": [
      {
        "id": "dis-uuid",
        "clientId": "client-uuid",
        "bodyPart": "Left leg",
        "classification": "Physical — locomotor",
        "isPwdCertified": true,
        "updatedAt": "2026-06-17T10:00:00Z"
      }
    ],

    "travelHistories": [
      {
        "id": "travel-uuid",
        "clientId": "client-uuid",
        "destination": "Japan",
        "cityProvince": "Tokyo",
        "departureDate": "2024-04-01",
        "returnDate": "2024-04-10",
        "purpose": "leisure",
        "illnessDuringAfterTravel": null,
        "updatedAt": "2026-06-17T10:00:00Z"
      }
    ],

    "contraceptiveHistories": [
      {
        "id": "contra-uuid",
        "clientId": "client-uuid",
        "method": "Oral Contraceptive Pill",
        "isCurrent": false,
        "dateStarted": "2019-01-01",
        "reasonForStopping": "Planning pregnancy",
        "updatedAt": "2026-06-17T10:00:00Z"
      }
    ],

    "pregnancies": [
      {
        "id": "preg-uuid",
        "clientId": "client-uuid",
        "year": 2022,
        "outcome": "Live birth",
        "gestationalAgeWeeks": 38,
        "deliveryType": "NSD",
        "birthWeightKg": 3.2,
        "complications": null,
        "facility": "St. Luke's Medical Center",
        "updatedAt": "2026-06-17T10:00:00Z"
      }
    ],

    "socialHistory": {
      "id": "sh-uuid",
      "clientId": "client-uuid",
      "smokingStatus": "neverSmoked",
      "cigsPerDay": null,
      "packYears": null,
      "quitDate": null,
      "otherTobaccoProducts": null,
      "alcoholUse": "occasional",
      "alcoholType": "Beer",
      "alcoholFrequencyDaysPerWeek": 1,
      "alcoholQuantityPerOccasion": 2,
      "usesSubstances": false,
      "substanceName": null,
      "substanceRoute": null,
      "substanceFrequency": null,
      "activityLevel": "moderatelyActive",
      "exerciseType": "Walking / jogging",
      "exerciseFrequencyDaysPerWeek": 3,
      "dietPattern": "Regular Filipino diet",
      "foodRestrictions": null,
      "sleepAvgHours": 7.0,
      "sleepQuality": "good",
      "isSexuallyActive": true,
      "waterIntake": "8 glasses/day",
      "occupationalHazards": null,
      "updatedAt": "2026-06-17T10:00:00Z"
    },

    "occupation": {
      "id": "occ-uuid",
      "clientId": "client-uuid",
      "occupation": "Software Engineer",
      "employer": "Acme Corp",
      "industry": "Information Technology",
      "workEnvironment": "office",
      "yearsInOccupation": 5,
      "hazardExposure": null,
      "updatedAt": "2026-06-17T10:00:00Z"
    },

    "obstetricProfile": {
      "id": "ob-uuid",
      "clientId": "client-uuid",
      "gravida": 2,
      "para": 1,
      "abortusCount": 1,
      "livingChildren": 1,
      "lastMenstrualPeriod": "2026-05-15",
      "menarche": "2005-01-01",
      "isPregnant": false,
      "menstrualCycleLengthDays": 28,
      "hasDysmenorrhea": false,
      "notes": null,
      "updatedAt": "2026-06-17T10:00:00Z"
    },

    "maleReproductive": null,

    "dentalVision": {
      "id": "dv-uuid",
      "clientId": "client-uuid",
      "dentistName": "Dr. Lim",
      "dentistClinic": "Smile Dental Clinic",
      "orthodonticDevice": null,
      "eyeDoctorName": "Dr. Cruz",
      "correctiveLenses": "glasses",
      "updatedAt": "2026-06-17T10:00:00Z"
    },

    "mentalHealthProfile": {
      "id": "mh-uuid",
      "clientId": "client-uuid",
      "hasDiagnosis": true,
      "diagnosisName": "Generalized Anxiety Disorder",
      "isOnMedication": false,
      "medicationName": null,
      "therapistName": "Dr. Tan",
      "therapyType": "Cognitive Behavioural Therapy (CBT)",
      "sessionFrequency": "Biweekly",
      "notes": null,
      "updatedAt": "2026-06-17T10:00:00Z"
    }
  },
  "errors": []
}
```

---

### `PUT /api/v1/patients/{id}/demographics` — Direct demographics update

> ⚠️ **Dashboard / admin use only.**  
> Mobile clients **must** use `POST /sync` to preserve:
>
> - the `SyncLog` audit trail
> - Last-Write-Wins conflict resolution
> - Hangfire automatic retry on failure

**Request body**

```json
{
  "firstName": "Juan",
  "middleName": null,
  "lastName": "Dela Cruz",
  "suffix": null,
  "sex": "Male",
  "dateOfBirth": "1990-05-15",
  "placeOfBirth": "Manila",
  "civilStatus": "Married",
  "bloodType": "OPositive",
  "nationality": "Filipino",
  "ethnicity": null,
  "religion": "Roman Catholic",
  "primaryLanguage": "Filipino",
  "educationLevel": "College",
  "mobile": "+639171234567",
  "altPhone": null,
  "email": "juan@example.com",
  "messengerHandle": null,
  "consentToShareInfo": true
}
```

**204 No Content**

---

## Sync

### `POST /api/v1/patients/{patientId}/sync` — Push offline changes

The **primary write path for the mobile app.**  
Accepts a batch of up to **500 items**. The server acknowledges receipt immediately (202)
and processes each item in the background via Hangfire with automatic retry.

**Key rules**

| Rule | Detail |
|---|---|
| `clientId` | Device-generated UUID. Guarantees idempotency — the same item can be submitted multiple times safely. |
| `clientTimestamp` | Must be **UTC ISO-8601**. Rejected if more than 5 minutes in the future. |
| `payloadJson` | Full serialised entity at time of change. Set to `null` for `delete` operations. |
| Conflict resolution | **Last-Write-Wins** — if `clientTimestamp < server.updatedAt`, server retains its version and records a `conflictResolved` log entry. |
| Duplicate detection | Items with a `clientId` already in `SyncLog` are counted as `alreadyProcessed` (not re-processed). |

**Supported `entityType` values**

```
patient                        patient_government_ids
patient_addresses              emergency_contacts
patient_healthcare_providers   patient_allergies
patient_medications            patient_surgical_history
patient_past_illnesses         patient_chronic_conditions
patient_family_history         patient_immunizations_self
patient_disabilities           patient_social_history
patient_occupation             patient_travel_history
patient_obstetric_profile      patient_pregnancies
patient_contraceptive_history  patient_male_reproductive
patient_dental_vision          patient_mental_health_profile
file                           file_folder
clinic_memberships             organization_memberships
booking_drafts                 notification_preferences
```

**Request body — mixed batch (3 entity types)**

```json
{
  "items": [
    {
      "clientId": "550e8400-e29b-41d4-a716-446655440000",
      "entityType": "patient",
      "operation": "update",
      "clientTimestamp": "2026-06-17T14:30:00.000Z",
      "payloadJson": "{\"clientId\":\"550e8400-e29b-41d4-a716-446655440000\",\"patientId\":\"3fa85f64-5717-4562-b3fc-2c963f66afa6\",\"firstName\":\"Juan\",\"lastName\":\"Dela Cruz\",\"nationality\":\"Filipino\",\"updatedAt\":\"2026-06-17T14:30:00.000Z\"}"
    },
    {
      "clientId": "660e8400-e29b-41d4-a716-446655440001",
      "entityType": "patient_allergies",
      "operation": "create",
      "clientTimestamp": "2026-06-17T14:31:00.000Z",
      "payloadJson": "{\"clientId\":\"660e8400-e29b-41d4-a716-446655440001\",\"patientId\":\"3fa85f64-5717-4562-b3fc-2c963f66afa6\",\"allergenName\":\"Shellfish\",\"allergyType\":\"food\",\"severity\":\"moderate\",\"reaction\":\"Hives\",\"updatedAt\":\"2026-06-17T14:31:00.000Z\"}"
    },
    {
      "clientId": "770e8400-e29b-41d4-a716-446655440002",
      "entityType": "patient_allergies",
      "operation": "delete",
      "clientTimestamp": "2026-06-17T14:32:00.000Z",
      "payloadJson": null
    }
  ]
}
```

**202 Accepted**

```json
{
  "succeeded": true,
  "message": "Accepted 2 item(s). 1 already processed.",
  "data": {
    "accepted": 2,
    "alreadyProcessed": 1,
    "acknowledgedAt": "2026-06-17T14:32:05.123Z"
  },
  "errors": []
}
```

| Field | Meaning |
|---|---|
| `accepted` | Items queued for Hangfire background processing |
| `alreadyProcessed` | Duplicate `clientId` found in SyncLog — safely ignored |
| `acknowledgedAt` | Server timestamp of this acknowledgment |

**Validation errors — 400**

```json
{
  "errors": [
    { "field": "Items[1].EntityType", "code": "SYNC_ENTITY_TYPE_UNKNOWN",
      "message": "Entity type 'unknown_type' is not a syncable type." },
    { "field": "Items[2].ClientTimestamp", "code": "FUTURE_DATE_NOT_ALLOWED",
      "message": "ClientTimestamp cannot be more than 5 minutes in the future." }
  ]
}
```

---

### `GET /api/v1/patients/{patientId}/sync/status` — Sync log

Returns recent sync log entries. Use for debugging stuck or failed items.

**Query params:** `?take=50` (default 50)

**200 OK**

```json
{
  "succeeded": true,
  "data": {
    "pendingCount": 0,
    "appliedCount": 47,
    "rejectedCount": 1,
    "recentItems": [
      {
        "clientId": "550e8400-e29b-41d4-a716-446655440000",
        "entityType": "patient",
        "operation": "update",
        "status": "applied",
        "clientTimestamp": "2026-06-17T14:30:00.000Z",
        "serverTimestamp": "2026-06-17T14:30:05.123Z",
        "conflictDetail": null
      },
      {
        "clientId": "770e8400-e29b-41d4-a716-446655440002",
        "entityType": "patient_allergies",
        "operation": "delete",
        "status": "conflictResolved",
        "clientTimestamp": "2026-06-17T14:32:00.000Z",
        "serverTimestamp": "2026-06-17T14:32:01.500Z",
        "conflictDetail": "Server version is newer. Client=2026-06-17T14:32:00Z, Server=2026-06-17T14:32:01Z. Server version retained."
      }
    ]
  },
  "errors": []
}
```

**Status values:** `pending` | `applied` | `rejected` | `conflictResolved`

---

## Device Sessions

A patient can be signed in on **any number of devices at once**. Signing in on a new device never signs another device
out; a session ends only when it is revoked explicitly (one device, or all). Sessions are stored in the database only
(patient-api no longer uses Redis).

### `POST /api/v1/patients/{patientId}/sessions` — Register this device

Registers (or refreshes) the calling device: one active session per `deviceId`. Registering a device that is already
active updates its label, Clerk session and push token and keeps the same `sessionId`; registering a new device adds a
session. Call it on every sign-in and whenever the push token changes.

**Request body**

```json
{
  "deviceId": "expo-device-id-or-uuid",
  "deviceLabel": "iPhone 15 Pro",
  "clerkSessionId": "sess_2xyz789",
  "pushToken": "ExponentPushToken[...]"
}
```

**201 Created**

```json
{
  "succeeded": true,
  "message": "Device session registered.",
  "data": {
    "sessionId": "srv-session-uuid",
    "deviceId": "expo-device-id-or-uuid",
    "deviceLabel": "iPhone 15 Pro",
    "issuedAt": "2026-06-17T08:00:00.000Z"
  },
  "errors": []
}
```

`issuedAt` is when the session was first created. `404` if the patient does not exist; `400` for a missing or too-long
field.

---

### `GET /api/v1/patients/{patientId}/sessions` — My devices

Every active device of the patient, most recently active first. The app marks the current device by comparing
`deviceId` with its own.

```json
{ "succeeded": true, "data": [
  { "id": "srv-session-uuid", "deviceId": "expo-device-id-or-uuid", "deviceLabel": "iPhone 15 Pro",
    "createdAt": "2026-06-17T08:00:00.000Z", "lastActiveAt": "2026-06-20T09:12:00.000Z" }
], "errors": [] }
```

---

### `DELETE /api/v1/patients/{patientId}/sessions/{sessionId}` — Sign one device out

Revokes that one session. Only that device receives `SessionRevoked` (SignalR group
`sync:device:{patientId}:{deviceId}`); the patient's other devices stay signed in.

**204 No Content** · **404** the session is not an active session of this patient (including one that is already
revoked).

---

### `DELETE /api/v1/patients/{patientId}/sessions` — Sign out everywhere

Revokes every active session of the patient; all connected devices receive `SessionRevoked`.

**204 No Content**

---

### Syncing from several devices

Push and pull are per patient, not per device, so any device can be used at any time:

- **Idempotency** — every pushed item carries an `idempotencyKey`; a key the server has already seen is skipped and
  counted in `alreadyProcessed`, whichever device sends it. A device may therefore retry a batch safely, and two
  devices can never apply the same change twice.
- **Conflicts** — for records with a version (such as the profile), Last-Write-Wins applies across devices: an update
  older than the server's current version is not applied and is reported as a `ConflictResolved` item (counted in
  `conflicts`), and the server version stays. Pull `full-record` / `sync/changes` to converge.
- **Notifications** — when a push is applied, every connected device gets `SyncCompleted` (SignalR) and every
  registered push token receives a `sync_ready` push, so the other device refreshes.

---

## Notifications

### `GET /api/v1/patients/{patientId}/notifications`

**Query params**

| Param | Type | Default | Description |
|---|---|---|---|
| `unreadOnly` | `bool` | `false` | Return only unread notifications |
| `skip` | `int` | `0` | Pagination offset |
| `take` | `int` | `30` | Page size |

**200 OK**

```json
{
  "succeeded": true,
  "data": {
    "items": [
      {
        "id": "notif-uuid",
        "type": "appointmentReminder",
        "category": "appointments",
        "title": "Appointment Tomorrow",
        "body": "Your appointment with Dr. Santos is tomorrow at 9:00 AM.",
        "isRead": false,
        "readAt": null,
        "expiresAt": "2026-06-19T09:00:00.000Z",
        "sourceId": "appt-uuid",
        "payload": "{\"appointmentId\":\"appt-uuid\",\"clinicId\":\"clinic-uuid\"}",
        "createdAt": "2026-06-17T10:00:00.000Z"
      }
    ],
    "unreadCount": 3,
    "totalCount": 1
  },
  "errors": []
}
```

**Notification types**
`appointmentReminder` | `clinicAnnouncement` | `medicationReminder` | `labResult` | `newMessage` | `system` | `syncConflict`

**Notification categories**
`appointments` | `reminders` | `clinic` | `messages` | `system`

---

### `PATCH /api/v1/patients/{patientId}/notifications/{notificationId}/read`

**204 No Content**

---

### `POST /api/v1/patients/{patientId}/notifications/mark-all-read`

**204 No Content**

---

### `GET /api/v1/patients/{patientId}/notification-preferences`

**200 OK**

```json
{
  "succeeded": true,
  "data": [
    { "id": "pref-uuid-1", "category": "appointments", "pushEnabled": true,  "inAppEnabled": true  },
    { "id": "pref-uuid-2", "category": "reminders",    "pushEnabled": true,  "inAppEnabled": true  },
    { "id": "pref-uuid-3", "category": "clinic",       "pushEnabled": false, "inAppEnabled": true  },
    { "id": "pref-uuid-4", "category": "messages",     "pushEnabled": true,  "inAppEnabled": true  },
    { "id": "pref-uuid-5", "category": "system",       "pushEnabled": false, "inAppEnabled": true  }
  ],
  "errors": []
}
```

---

### `PUT /api/v1/patients/{patientId}/notification-preferences/{category}`

`category` = `appointments` | `reminders` | `clinic` | `messages` | `system`

Creates the preference row if it doesn't exist; updates it if it does.

**Request body**

```json
{ "pushEnabled": false, "inAppEnabled": true }
```

**200 OK**

```json
{
  "succeeded": true,
  "data": { "id": "pref-uuid-3", "category": "clinic", "pushEnabled": false, "inAppEnabled": true },
  "errors": []
}
```

---

## Discovery — Organizations

### `GET /api/v1/organizations` — Search catalogue

**Query params**

| Param | Type | Default | Description |
|---|---|---|---|
| `q` | `string` | — | Name search (case-insensitive) |
| `skip` | `int` | `0` | Pagination offset |
| `take` | `int` | `20` | Page size |

Results are ordered by `featuredScore DESC, name ASC`.

**200 OK**

```json
{
  "succeeded": true,
  "data": {
    "items": [
      {
        "id": "org-uuid",
        "slug": "metro-manila-family-wellness-1",
        "name": "Metro Manila Family Wellness Network",
        "description": "A public patient community for Metro Manila members who want coordinated care.",
        "isPublic": true,
        "logoUrl": "https://picsum.photos/seed/org-logo-0/80/80",
        "coverImageUrl": "https://picsum.photos/seed/org-cover-0/400/180",
        "addressHint": "Metro Manila",
        "featuredScore": 120,
        "activeMemberCount": 342,
        "requiredShareFieldsJson": "[\"fullName\",\"mobile\",\"email\"]",
        "rolesJson": "[{\"id\":\"member\",\"name\":\"Member\",\"description\":\"General community access.\"}]"
      }
    ],
    "totalCount": 120,
    "skip": 0,
    "take": 20
  },
  "errors": []
}
```

---

### `GET /api/v1/organizations/by-invite/{inviteCode}` — Preview by invite code

Show the organisation details and its linked clinics **before** the patient confirms joining.

**Example:** `GET /api/v1/organizations/by-invite/INV-0020`

**200 OK**

```json
{
  "succeeded": true,
  "data": {
    "id": "org-uuid",
    "slug": "metro-manila-senior-care-20",
    "name": "Metro Manila Senior Care Network",
    "description": "A private patient community for senior care coordination.",
    "isPublic": false,
    "privacyPolicyUrl": "https://Clinic EZ.app/privacy/metro-manila-senior-care-20",
    "termsAndConditionsUrl": "https://Clinic EZ.app/terms/metro-manila-senior-care-20",
    "requiredShareFieldsJson": "[\"fullName\",\"dateOfBirth\",\"mobile\"]",
    "rolesJson": "[{\"id\":\"member\",\"name\":\"Member\"},{\"id\":\"volunteer\",\"name\":\"Volunteer\"}]",
    "featuredScore": 100,
    "activeMemberCount": 87,
    "linkedClinics": [
      {
        "id": "clinic-uuid",
        "name": "Metro Manila Family Medicine Clinic",
        "address": "Metro Manila, Philippines",
        "isPublic": true,
        "supportsAppointments": true,
        "specialtiesJson": "[\"Family Medicine\",\"Telehealth\"]",
        "featuredScore": 100
      }
    ]
  },
  "errors": []
}
```

**404** — invite code is invalid or expired.

---

### `POST /api/v1/patients/{patientId}/organization-memberships` — Join organisation

Validates the invite code, resolves `roleId` against the org's `rolesJson`, and creates the membership.

**Request body**

```json
{
  "inviteCode": "INV-0020",
  "roleId": "member",
  "consentPrivacyPolicy": true,
  "consentTermsAndConditions": true,
  "consentDataSharing": true
}
```

**201 Created**

```json
{
  "succeeded": true,
  "message": "Joined organization successfully.",
  "data": {
    "id": "membership-uuid",
    "organizationId": "org-uuid",
    "organizationName": "Metro Manila Senior Care Network",
    "roleId": "member",
    "roleName": "Member",
    "status": "Active",
    "consentDataSharing": true,
    "consentedAt": "2026-06-17T08:00:00.000Z",
    "createdAt": "2026-06-17T08:00:00.000Z"
  },
  "errors": []
}
```

**404** — invite code not found.  
**409** — already a member of this organisation.

---

## Discovery — Clinics

### `GET /api/v1/clinics` — Search catalogue

**Query params**

| Param | Type | Default | Description |
|---|---|---|---|
| `q` | `string` | — | Name search |
| `organizationId` | `uuid` | — | Scope to clinics linked to this org |
| `skip` | `int` | `0` | Pagination offset |
| `take` | `int` | `20` | Page size |

Pass `organizationId` to show only the clinics accessible through a joined organisation.

**200 OK**

```json
{
  "succeeded": true,
  "data": {
    "items": [
      {
        "id": "clinic-uuid",
        "name": "Metro Manila Family Medicine Clinic",
        "description": "A public family medicine clinic for online consultations.",
        "address": "Metro Manila, Philippines",
        "isPublic": true,
        "supportsAppointments": true,
        "logoUrl": "https://picsum.photos/seed/clinic-logo-0/80/80",
        "coverImageUrl": "https://picsum.photos/seed/clinic-cover-0/400/180",
        "specialtiesJson": "[\"Family Medicine\",\"Telehealth\"]",
        "requiredShareFieldsJson": "[\"fullName\",\"mobile\",\"email\"]",
        "featuredScore": 100
      }
    ],
    "totalCount": 120,
    "skip": 0,
    "take": 20
  },
  "errors": []
}
```

---

### `GET /api/v1/clinics/{clinicId}` — Clinic detail

Returns full clinic info, linked organisations, and the requesting patient's membership status.

**Query params:** `?forPatientId={patientId}` (optional — include to populate `membershipStatus`)

**200 OK**

```json
{
  "succeeded": true,
  "data": {
    "id": "clinic-uuid",
    "name": "Metro Manila Family Medicine Clinic",
    "description": "A public family medicine clinic.",
    "address": "Metro Manila, Philippines",
    "isPublic": true,
    "supportsAppointments": true,
    "privacyPolicyUrl": "https://Clinic EZ.app/privacy/family-medicine-metro-manila-1",
    "termsAndConditionsUrl": "https://Clinic EZ.app/terms/family-medicine-metro-manila-1",
    "specialtiesJson": "[\"Family Medicine\",\"Telehealth\"]",
    "requiredShareFieldsJson": "[\"fullName\",\"mobile\",\"email\"]",
    "featuredScore": 100,
    "linkedOrganizations": [
      {
        "id": "org-uuid",
        "name": "Metro Manila Senior Care Network",
        "isPublic": false,
        "featuredScore": 100,
        "activeMemberCount": 87
      }
    ],
    "membershipStatus": "Active"
  },
  "errors": []
}
```

`membershipStatus`: `"Pending"` | `"Active"` | `null` (not joined)

**404** — clinic not found.

---

### `POST /api/v1/patients/{patientId}/clinic-memberships` — Join clinic

Patients join clinics directly — **consent only, no invite code required**.

**Request body**

```json
{
  "clinicId": "clinic-uuid",
  "consentPrivacyPolicy": true,
  "consentTermsAndConditions": true,
  "consentDataSharing": true
}
```

**201 Created** — `data` is the new membership server UUID.

```json
{
  "succeeded": true,
  "message": "Joined clinic successfully.",
  "data": "membership-server-uuid",
  "errors": []
}
```

**404** — clinic not found.  
**409** — already a member of this clinic.

---

## Booking Drafts

### `POST /api/v1/patients/{patientId}/booking-drafts` — Create draft

Creates an appointment request. The draft can be submitted to the clinic later.

**Request body**

```json
{
  "clinicId": "clinic-uuid",
  "organizationId": null,
  "preferredDate": "2026-07-15",
  "preferredTime": "09:00",
  "reason": "Annual physical exam",
  "notes": "Please prepare CBC and lipid panel results if available.",
  "shareFieldsJson": "[\"fullName\",\"dateOfBirth\",\"mobile\",\"philhealthId\"]",
  "shareSections": ["Allergies", "Medications"]
}
```

`shareSections` (optional) lists the extra record categories the patient agrees to send with this booking, using the
[sharing scope](#sharing) wire names. `Demographics` is always shared and is rejected here; an unknown name is a **400**.
Nothing is shared unless it is listed. The choice is stored on the draft and enforced when the draft is submitted.

**201 Created** — `data` is the new booking draft UUID.

```json
{
  "succeeded": true,
  "data": "booking-draft-uuid",
  "errors": []
}
```

---

### `POST /api/v1/patients/{patientId}/booking-drafts/{draftId}/submit` — Submit to clinic

Publishes a `patient.appointment.booked` message to the clinic through the Interop hub. The message is written to the
outbox in the same transaction as the draft status change, so delivery is at-least-once and never lost on a crash. Only
the fields the patient chose to share (plus name and mobile) are included. The clinic answers asynchronously with
`clinic.appointment.updated` messages, which appear in `GET /api/v1/patients/{patientId}/appointments`.

The returned `PENDING-{draftId}` reference is a placeholder until the clinic confirms.

Submitting also records a `booking` access grant for that clinic (see [Sharing](#sharing)) and shares each unencrypted
attachment of at most 10 MB with the clinic by reference (`patient.record.shared`). No clinic is called over HTTP.

The grant and the event are limited to `Demographics` plus the draft's `shareSections`. The server builds the event's
`sharedItems` only for those sections (`sharedScopes` names them), so a client cannot widen what is released after the
patient chose; the access log lists the sections shared.

**202 Accepted**

```json
{
  "succeeded": true,
  "message": "Booking submitted to clinic.",
  "data": "PENDING-3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "errors": []
}
```

**404** — draft not found or does not belong to this patient.  
**409** — draft has already been submitted, or the clinic has no tenant yet (not provisioned in the directory).

---

## Appointments

### `GET /api/v1/patients/{patientId}/appointments` — List appointments

Returns the patient's appointments as last reported by their clinics (`clinic.appointment.updated` Interop messages).
No clinic is contacted at request time.

**200 OK**

```json
{
  "succeeded": true,
  "data": {
    "items": [
      {
        "id": "appt-uuid",
        "clinicId": "clinic-uuid",
        "clinicName": "Metro Manila Family Medicine Clinic",
        "provider": {
          "id": "prov-uuid",
          "name": "Dr. Reyes",
          "specialty": "Family Medicine",
          "avatarUrl": null
        },
        "serviceType": "Annual Physical Exam",
        "scheduledAt": "2026-07-15T01:00:00.000Z",
        "durationMinutes": 30,
        "status": "Confirmed",
        "notes": null
      }
    ],
    "totalCount": 1
  },
  "errors": []
}
```

**Appointment statuses:** `Pending` | `Confirmed` | `Cancelled` | `Completed` | `NoShow` | `ActionRequired`

---

## Sharing

The patient decides who sees their record. Sharing is pull-based and scoped: the patient signs a short-lived token for
the categories they tick, a facility redeems it over the Interop hub, and patient-api answers with a snapshot containing
**only** those categories.

**Scopes** (wire names): `Demographics`, `Allergies`, `Medications`, `Conditions`, `Immunizations`, `LabResults`,
`Prescriptions`, `Vitals`.

Every patient has a stable `clinicEzId` (e.g. `CE-7K2M-9QX4`), returned on the profile DTOs and by `share-tokens`.

### `POST /api/v1/patients/{patientId}/share-tokens` — Create a share token

```json
{ "scopes": ["Allergies", "Vitals"], "purpose": "Consultation", "maxRedemptions": 3 }
```

`maxRedemptions` is optional (default 1, at most `Sharing:MaxShareRedemptions`).

**200** — `data: { token, expiresAt, ttlSeconds, clinicEzId, scopes, purpose, maxRedemptions }`. `token` is the QR content:
an opaque, HMAC-signed string valid for `ttlSeconds` (default 120) that can be redeemed `maxRedemptions` times (default
once). Request a new one before `expiresAt`.  
**400** — `scopes` empty or contains an unknown scope, or `maxRedemptions` is outside `1..Sharing:MaxShareRedemptions`.

### `POST /api/v1/patients/{patientId}/share-codes` — Create a one-time code

For a facility that cannot scan: the patient reads out a short code, and the facility types it with the patient's
`clinicEzId`.

```json
{ "scopes": ["Allergies", "Vitals"], "purpose": "Consultation" }
```

**200** — `data: { code, expiresAt, ttlSeconds, clinicEzId, scopes, purpose }`. `code` looks like `K7QM-X4NP` (eight
characters from an alphabet without `0 O 1 I L`; the hyphen and case are ignored when typed). It lives
`Sharing:ShareCodeTtlMinutes` (default 10) and works once. Only an HMAC of the code is stored, never the code itself.  
**400** — `scopes` empty or contains an unknown scope.  
**409** — the patient already has `Sharing:MaxLiveShareCodes` unexpired, unused codes.

Redeeming a code by hand is throttled: after `Sharing:MaxShareCodeFailuresPerFacility` wrong attempts by one facility
(or `Sharing:MaxShareCodeFailuresPerPatient` against one patient) within `Sharing:ShareCodeFailureWindowMinutes`, further
attempts are answered `RateLimited` even when correct. A wrong code and an unknown `clinicEzId` get the same `Invalid`
answer so the response does not reveal which patients exist.

### `GET /api/v1/patients/{patientId}/access-grants` — Who has access

Newest first, including expired and revoked grants.

`AccessGrantDto { id, tenantId, facilityId, facilityName, scopes[], purpose, source: Qr|Booking|Manual, status: Active|Expired|Revoked, expiresAt, revokedAt, createdAt }`

A QR redemption creates a grant valid for `Sharing:QrGrantHours`; a code redemption creates a `Manual` grant of the same
length; submitting a booking creates a `Booking` grant (`Demographics` plus the draft's `shareSections`) valid for
`Sharing:BookingGrantDays`.

### `DELETE /api/v1/patients/{patientId}/access-grants/{grantId}` — Revoke

**200** on success, **404** when the grant is not this patient's. Revoking ends *future* fetches by that facility. Whatever
the facility already imported into its own chart stays there; tell the patient so.

### `GET /api/v1/patients/{patientId}/access-log?grantId=&skip=0&take=50` — Audit trail

`data: { items: AccessLogDto[], totalCount }` with `AccessLogDto { id, grantId, facilityName, actor, action, detail, at }`,
newest first. Grant creation, redemptions (with the categories released), denials, revocations and booking shares are logged.
Every redemption of a multi-use token is its own entry: `Redeemed` or `Refreshed` with "(use n of m)", suffixed "by code"
for manual codes.

### `GET /api/v1/patients/{patientId}/export` — Export my data

Not wrapped in the API envelope: one JSON attachment (`Content-Disposition`, `Cache-Control: no-store`) with `exportedAt`,
`clinicEzId`, `patient` (the full record), `appointments`, `labRequests`, `prescriptions`, `labResults`,
`medicalCertificates`, `grants` and `accessLog`.

---

## Documents from facilities

Clinics, laboratories and pharmacies send everything they issue to the patient (`patient.document.issued`) and keep the
stage of each order up to date (`lab.order.status.changed`, `rx.status.changed`). The patient-api keeps the patient's own
copy. Apps read it with the incremental pull below; row ids are stable, so rows are upserts.

### `GET /api/v1/patients/{patientId}/sync/changes?since={cursor}&take=200` — Incremental pull

Omit `since` for the first full pull. `take` is capped at 500.

```json
{
  "succeeded": true,
  "data": {
    "cursor": "638000000000000000",
    "hasMore": false,
    "labRequests": [], "prescriptions": [], "labResults": [], "medicalCertificates": [],
    "grants": [], "notifications": []
  },
  "errors": []
}
```

Persist `cursor` and send it back as `since`; keep calling while `hasMore` is `true`. Only rows that changed after the
cursor are returned. **400** when `since` is not a cursor previously returned.

- `LabRequestDto { id, requisitionId, orderingTenantId, orderingFacilityId, orderingFacilityName, accessionNumber, title, urgency, items[{code,name,category}], stage, quotedAmount, currency, paymentRequired, paymentStatus: None|Pending|Paid, laboratoryName, claimToken, reason, issuedAt, updatedAt }` —
  `stage`: `Issued Routed Claimed AwaitingPayment Paid SpecimenCollected InProcess ResultFinalized ExternalSubmitted Reviewed Rejected Cancelled`.
  `claimToken` is the QR content shown at any ClinicEZ laboratory.
- `PrescriptionDto { id, prescriptionNumber, orderingTenantId, orderingFacilityId, orderingFacilityName, prescriberName, prescriberPrcLicense, diagnosis, instructions, items[{genericName,brandName,dosage,form,sig,quantity,durationDays,remarks}], stage, quotedAmount, pharmacyName, claimToken, verificationUrl, receiptNumber, dispensedAt, externalPharmacyName, issuedAt, updatedAt }` —
  `stage`: `Issued Accepted PartiallyAccepted Rejected Dispensed ExternalDispensed`.
- `LabResultDto { id, requisitionId, laboratoryName, title, source: ClinicEzLab|ExternalLab|PatientUploaded, verification: Verified|Unverified|Rejected, reviewedByName, reviewedAt, remarks, impression, isCritical, resultedAt, fileUrl, observations[{panel,name,value,unit,referenceRange,flag}], updatedAt }` —
  `fileUrl` is a short-lived download URL. ClinicEZ-lab results arrive `verified`; external and patient-uploaded results stay `unverified` until the ordering doctor reviews them.
- `MedicalCertificateDto { id, certificateNumber, issuerName, doctorName, doctorPrcLicense, purpose, diagnosis, remarks, restDays, validFrom, validTo, verificationUrl, issuedAt, updatedAt }`
- `notifications` use the existing notification shape; document notifications carry `payload` JSON `{ "kind": "labRequest|labResult|prescription|medicalCertificate", "documentId": "…" }`.

A status message can arrive before the document it belongs to. The row is then created with only its stage and completed
when the document arrives; a status older than the recorded one never overwrites a newer one.

### `POST /api/v1/patients/{patientId}/lab-requests/{requisitionId}/results` — Upload a result

`multipart/form-data`: `file` (required; PDF, JPEG, PNG or HEIC, at most 10 MB) and `notes` (optional).

**202** — `data: { resultId, verification: "Unverified", source: "PatientUploaded" }`. The file is stored by patient-api and
the ordering clinic is sent a download link (`lab.result.external.submitted`), valid for 7 days. The ordering doctor's
verdict returns through `sync/changes` (`verification` becomes `Verified` or `Rejected`).  
**400** no or empty file · **404** the lab request is not the patient's · **409** the request is closed, or the ordering
clinic is not known yet · **413** over 10 MB · **415** type not allowed.

### `POST /api/v1/patients/{patientId}/prescriptions/{prescriptionId}/external-dispense` — Filled elsewhere

`multipart/form-data`: `pharmacyName` (required), `branchLocation`, `pharmacistName`, `receiptNumber`, `notes` and an
optional `receipt` file (same limits as above).

**202** — `data: { prescriptionId, stage: "ExternalDispensed" }`. The issuing clinic is told (`rx.external.dispensed`) with a
7-day link to the receipt photo, if one was attached.  
**404** not the patient's prescription · **409** already dispensed · **413** / **415** as above.

---

## Interop messages

Patient plane address: `Party.ForPatient({patientId})`. Messages are authenticated by the hub; each handler also checks
that the authenticated sender is the facility the payload names and that the envelope is addressed to the patient the
payload is about. A message that fails those checks is acknowledged and ignored, never retried.

| Direction | Type | Purpose |
| --- | --- | --- |
| in | `patient.share.redeem` | A facility redeems a share token, or a one-time code with the patient's `clinicEzId`; answered with `patient.share.snapshot` to the same facility |
| in | `patient.document.issued` | Lab request, prescription, lab result, medical certificate or dispense receipt (upsert by document id) |
| in | `lab.order.status.changed` | Stage, quote and payment state of a lab request |
| in | `rx.status.changed` | Stage and quote of a prescription |
| in | `lab.result.reviewed` | The ordering doctor's verdict on an unverified result (only from the ordering facility) |
| in | `facility.directory.updated`, `clinic.record.verified`, `clinic.appointment.updated` | Directory, verified records, appointment status |
| out | `patient.share.snapshot` | Scoped snapshot (or a denial with `denialReason`) in reply to a redeem |
| out | `patient.appointment.booked` | A submitted booking draft |
| out | `patient.record.shared` | A booking attachment, by reference: file metadata plus a 24 h presigned download URL |
| out | `lab.result.external.submitted` | A patient-uploaded lab result, by reference |
| out | `rx.external.dispensed` | A prescription the patient had filled outside ClinicEZ |

Redemption rules: the token must verify against `Sharing:SigningKey`, be unexpired, be for an existing patient and have
redemptions left. A token carries the number of redemptions the patient allowed (`maxRedemptions`, default 1); each
redemption, by any facility, is numbered and a fresh snapshot is built from the patient's current record every time. When
the same facility redeems again it keeps its existing grant and the snapshot is marked `isRefresh: true`; a different
facility gets its own grant. If the patient revoked that facility's grant, the redemption is denied as `Revoked`. A
redelivered message is answered again from the use already recorded, so retries never create a second grant or consume
another redemption. Redemptions are serialised by a unique `(token, sequence)` key.

A redeem may instead carry `clinicEzId` and `code` (with an empty `shareToken`) to redeem a one-time code; the same
checks apply, the grant source is `Manual`, and the facility is throttled as described under
[share codes](#post-apiv1patientspatientidshare-codes--create-a-one-time-code).

`PatientShareSnapshotPayload` additions: `denialCode` (`Invalid`, `Expired`, `Exhausted`, `PatientUnknown`, `RateLimited`,
`Revoked`; PascalCase string, null when granted), `redemptionNumber`, `maxRedemptions` and `isRefresh`. A denied snapshot
(`granted: false`) still carries a short `denialReason` the facility can show the patient, now alongside `denialCode` for
machine handling. `PatientShareRedeemPayload` additions: `clinicEzId` and `code`. The `patient.appointment.booked`
payload gains `sharedScopes` and `sharedItems` (the sections the patient chose for the booking).

**Booking attachments.** At submit time each *unencrypted* attachment of at most 10 MB is shared with the clinic by
reference in a `patient.record.shared` message. Client-encrypted or larger files are not transferred; only their
metadata is sent.

### Configuration

| Key | Environment variable | Notes |
| --- | --- | --- |
| `Sharing:SigningKey` | `Sharing__SigningKey` | **Required**, at least 32 characters. The service refuses to start without it. Never commit a real value. |
| `Sharing:ShareTokenTtlSeconds` | `Sharing__ShareTokenTtlSeconds` | Token lifetime, default 120 |
| `Sharing:QrGrantHours` | `Sharing__QrGrantHours` | Grant length after a QR redemption, default 24 |
| `Sharing:BookingGrantDays` | `Sharing__BookingGrantDays` | Grant length after a booking, default 30 |
| `Sharing:MaxShareRedemptions` | `Sharing__MaxShareRedemptions` | Upper bound a patient may set on a token's `maxRedemptions`, default 10 |
| `Sharing:ShareCodeTtlMinutes` | `Sharing__ShareCodeTtlMinutes` | Lifetime of a one-time code, default 10 |
| `Sharing:MaxLiveShareCodes` | `Sharing__MaxLiveShareCodes` | Unexpired, unused codes a patient may hold, default 5 |
| `Sharing:ShareCodeFailureWindowMinutes` | `Sharing__ShareCodeFailureWindowMinutes` | Window over which wrong code attempts are counted, default 10 |
| `Sharing:MaxShareCodeFailuresPerFacility` | `Sharing__MaxShareCodeFailuresPerFacility` | Wrong attempts one facility may make in the window, default 5 |
| `Sharing:MaxShareCodeFailuresPerPatient` | `Sharing__MaxShareCodeFailuresPerPatient` | Wrong attempts against one patient in the window, default 15 |

---

## Real-Time: SignalR Hub

**Hub URL:** `ws://localhost:5154/hubs/sync`  
**Auth:** Pass the Clerk JWT via `accessTokenFactory`. The server joins the client to
`sync:patient:{patientId}` automatically on connect. Add `?deviceId={deviceId}` to the hub URL to also join
`sync:device:{patientId}:{deviceId}`, the group that receives a single-device `SessionRevoked`.

### Events pushed by the server

**`SyncCompleted`** — fired when Hangfire finishes processing a sync batch.

```json
{ "applied": 3, "conflicts": 1 }
```

- `applied` — items successfully written to the server.
- `conflicts` — items skipped because the server version was newer (Last-Write-Wins).
  Call `GET /sync/status` to surface details for the conflicted items.

**`SessionRevoked`** — fired when this device was signed out from another device (sent to its device group only) or
when the patient signed out everywhere (sent to every connected device). Signing in on another device never fires it.

```json
{ "reason": "This device has been signed out from another device." }
```

Mobile action: clear local session, navigate to the sign-in screen.

### TypeScript example

```typescript
import * as signalR from '@microsoft/signalr';

const connection = new signalR.HubConnectionBuilder()
  .withUrl(`http://localhost:5154/hubs/sync?deviceId=${encodeURIComponent(deviceId)}`, {
    accessTokenFactory: async () => getToken(),
  })
  .withAutomaticReconnect()
  .build();

connection.on('SyncCompleted', ({ applied, conflicts }) => {
  console.log(`Sync done: ${applied} applied, ${conflicts} conflicts`);
  if (conflicts > 0) {
    fetchSyncStatus(); // show conflict badge in UI
  }
});

connection.on('SessionRevoked', ({ reason }) => {
  console.warn('Session revoked:', reason);
  clearSecureStore();
  router.replace('/sign-in');
});

await connection.start();
```

---

## Hangfire Dashboard

**URL:** `http://localhost:5154/hangfire`  
**Auth:** HTTP Basic (`Hangfire:DashboardUsername` / `Hangfire:DashboardPassword` from user-secrets or environment). There is no default password: with none configured the dashboard is denied to everyone.  
**Mode:** Read-only in Production; full control in Development.

Use the dashboard to inspect queued / failed sync jobs and trigger manual retries.

---

## Required configuration

patient-api has **no default secrets**. The connection string, `Clerk__Authority`, and `Sharing__SigningKey` are validated at start-up (the service refuses to start without them); the others are required for the feature they serve:

| Key (env var) | Purpose |
|---|---|
| `ConnectionStrings__DefaultConnection` | PostgreSQL (also used by Hangfire) |
| `Clerk__Authority` | Clerk JWT issuer (`Clerk__Audience` optional) |
| `Sharing__SigningKey` | HMAC key (≥ 32 characters) for share tokens and one-time codes |
| `Facility__BaseDomain` and/or `Cors__AllowedDomains__0…`, `Cors__AllowedOrigins__0…` | Browser origins trusted for CORS. **Required outside Development** — the service refuses to start without at least one, and `Cors__AllowAnyOrigin=true` is refused. Native mobile clients do not use CORS. Development allows any origin. |
| `Messaging__HubUrl`, `Messaging__ClientId`, `Messaging__ClientSecret` | Interop hub client credentials |
| `Messaging__SigningKey` | This service's envelope-signing private key; required wherever the hub enforces signatures (the default outside Development, see `docs/architecture/interop-hub.md`) |
| `R2__AccountId`, `R2__BucketName`, `R2__AccessKeyId`, `R2__SecretAccessKey`, `R2__PublicUrl` | Cloudflare R2 object storage |
| `Hangfire__DashboardPassword` | Dashboard Basic-Auth password (empty = dashboard disabled for everyone) |

Development-only placeholders live in `appsettings.Development.json`; `appsettings.json` carries no secret values.
Redis is not required by patient-api.

---

## Mobile Integration: End-to-End Flow Examples

### First sign-in

```
1. Clerk sign-in  →  JWT + clerkUserId
2. GET /patients/by-clerk/{clerkUserId}
   → 404?  → onboarding → POST /patients  → store patientId in SecureStore
   → 200?  → read patientId from response.data.id
3. POST /patients/{id}/sessions                 (register this device)
4. GET  /patients/{id}/full-record              (hydrate all 22 entity categories into SQLite)
5. Connect ws://localhost:5154/hubs/sync        (listen for SyncCompleted + SessionRevoked)
```

### Return sign-in

```
1. Clerk sign-in  →  JWT
2. GET /patients/by-clerk/{clerkUserId}  →  patientId
3. POST /patients/{id}/sessions
4. POST /patients/{id}/sync              (flush pending syncQueue rows)
5. Connect to /hubs/sync
```

### Offline edit → push on connectivity restored

```typescript
// 1. Always write to local SQLite first (offline-first)
const newAllergyId = randomUUID();
await db.insert(patientAllergies).values({
  id: newAllergyId,
  patientId,
  allergenName: 'Shellfish',
  allergyType: 'food',
  severity: 'moderate',
  reaction: 'Hives',
  createdAt: new Date(),
  updatedAt: new Date(),
});

// 2. Enqueue in syncQueue
const clientId = randomUUID();
await db.insert(syncQueue).values({
  id: clientId,
  entityType: 'patient_allergies',
  entityId: newAllergyId,
  operation: 'create',
  payloadJson: JSON.stringify({
    clientId,
    patientId,
    allergenName: 'Shellfish',
    allergyType: 'food',
    severity: 'moderate',
    reaction: 'Hives',
    updatedAt: new Date().toISOString(),
  }),
  status: 'pending',
  retryCount: 0,
  createdAt: new Date(),
});

// 3. When NetInfo reports connectivity:
const pending = await db.select().from(syncQueue)
  .where(eq(syncQueue.status, 'pending'));

const ack = await pushSyncPayload(getToken, patientId, pending.map(item => ({
  clientId: item.id,
  entityType: item.entityType,
  operation: item.operation,
  clientTimestamp: new Date(item.createdAt).toISOString(),
  payloadJson: item.payloadJson,
})));

// 4. Mark accepted items as syncing (Hangfire is now processing)
await db.update(syncQueue)
  .set({ status: 'syncing' })
  .where(inArray(syncQueue.id, pending.map(i => i.id)));

// 5. SignalR SyncCompleted fires when Hangfire finishes
connection.on('SyncCompleted', async () => {
  await db.update(syncQueue)
    .set({ status: 'synced' })
    .where(eq(syncQueue.status, 'syncing'));
});
```

### ApiError handling in screens

```typescript
import { ApiError } from '@/services/api';

try {
  const ack = await pushSyncPayload(getToken, patientId, items);
} catch (err) {
  if (err instanceof ApiError) {
    // Single toast with all error messages
    showToast(err.userMessage);

    // First error only (most common case)
    showToast(err.firstMessage);

    // React Hook Form field-level errors
    Object.entries(err.fieldErrors).forEach(([field, msg]) => {
      form.setError(field, { message: msg });
    });

    // Handle specific status codes
    if (err.status === 401) router.replace('/sign-in');
    if (err.status === 409) showConflictBanner();
    if (err.status === 503) showOfflineFallback();
  }
}
```

### SWR hooks (reactive UI)

```typescript
import {
  usePatientByClerkId,
  usePatientFullRecord,
  useNotifications,
  useOrganizations,
  useClinics,
  useSubmitBooking,
} from '@/services/api';

// Look up patient on sign-in screen
const { data: patient, isLoading } = usePatientByClerkId(getToken, clerkUserId);

// Hydrate device on first install (called once, not on every focus)
const { data: fullRecord } = usePatientFullRecord(getToken, patientId);

// Notification badge count
const { data: notifs } = useNotifications(getToken, patientId, { unreadOnly: true, take: 1 });
const unreadCount = notifs?.unreadCount ?? 0;

// Search organisations
const { data: orgs } = useOrganizations(getToken, searchQuery);

// Filter clinics by joined organisation
const { data: clinics } = useClinics(getToken, undefined, organizationId);

// Submit booking (mutation)
const { trigger: submitBooking, isMutating } = useSubmitBooking(getToken, patientId, draftId);
await submitBooking();
```
