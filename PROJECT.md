# Project: ClinicEZ Generic Entity Custom Metadata Engine

## Architecture
ClinicEZ is a multi-tenant clinical workstation and healthcare platform composed of Clean Architecture .NET microservices (`services/clinic-api`, `services/patient-api`, `services/interop-hub`) backed by PostgreSQL, alongside a cross-platform React Native Expo mobile/tablet application (`apps/clinic-app`) and Next.js portal (`apps/portal-web`).
- **Domain Layer (`ClinicEz.Clinic.Domain`)**: `ClinicCustomFieldDefinition` with `EntityType` scoping, `FieldKey`, `Label`, `Category`, `DisplayOrder`, `IsRequired`, `DataType`, `VisibilityRuleJson`, `ConditionalOptionsJson`, and `ClinicPatient.CustomFields` dictionary.
- **Application Layer (`ClinicEz.Clinic.Application`)**: CQRS with MediatR, command validators, `UpdateCustomFieldDefinitionCommand`, `ReorderCustomFieldsCommand`, `InstallCustomFieldTemplateCommand`, `GetCustomFieldTemplatesQuery`, and `GetClinicCustomFieldsQuery`.
- **Infrastructure Layer (`ClinicEz.Clinic.Infrastructure`)**: EF Core DbContext, PostgreSQL text columns with JSON serialization, idempotent migrations, multi-tenant query filters (`ClinicId == CurrentClinicId`).
- **API Layer (`ClinicEz.Clinic.Api`)**: `CustomFieldsController` exposing CRUD, `PUT /api/v1/custom-fields/reorder`, and template installation.
- **Client Settings Layer (`apps/clinic-app/components/settings/`)**: `CustomFieldsTab.tsx` and `AddEditFieldModal.tsx` providing mandatory toggles, Move Up/Down reordering controls, live condition rule builder, cascading mapper, and 1-click template library presets.
- **Client Intake Layer (`apps/clinic-app/components/custom-fields/`)**: `DynamicCustomFieldsRenderer.tsx` evaluating visibility rules in real-time, deriving cascading dropdown choices, enforcing mandatory validation only when visible, resetting hidden fields, and integrating into `Patients.screen.tsx`, `EditPatientModal.tsx`, and `StudentIntakeClient.tsx`.
- **Design Tokens (`@clinicez/design-tokens`)**: Strict adherence to semantic tokens (`lightColors.primary #0D6963`, `lightColors.emergencyText`, `lightColors.border`, etc.), 4 core UX states (Loading, Empty, Error, Active/Success), and responsive workstation density.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | CustomField Schema & EF Core Model | `VisibilityRuleJson` and `ConditionalOptionsJson` columns on `ClinicCustomFieldDefinition` | M1 | R1 |
| 2 | CQRS CustomField CRUD & Query | Create, Update (`PUT /api/v1/custom-fields/{id}`), Delete, and deterministic ordering by `DisplayOrder` | M1 | R1 |
| 3 | Bulk Reorder Custom Fields Endpoint | `PUT /api/v1/custom-fields/reorder` for visual arrangement persistence | M1 | R1 |
| 4 | Template Catalog & Install Backend | `InstallCustomFieldTemplateCommand` (`POST /api/v1/custom-fields/templates/install`) with USTP, Workplace, Demographics presets | M1 | R1 |
| 5 | Admin Mandatory Toggle & Badges | Toggle in field modal and `Required` (emergency) vs `Optional` (neutral) badges in `CustomFieldsTab.tsx` | M2 | R2 |
| 6 | Admin Move Up/Down Sequence Controls | Interactive movement controls calling reorder API with minimum 44px touch target | M2 | R2 |
| 7 | Live Visibility Condition Rule Builder | Modal rule builder selecting parent field, operator, and expected value with live preview badge | M2 | R2 |
| 8 | Cascading Dropdown Options Mapper | Modal mapper binding parent select value to child choices with fallback | M2 | R2 |
| 9 | 1-Click Suggested Templates Library UI | Administrative preset library toolbar with 1-click install for USTP, Workplace, Demographics | M2 | R2 |
| 10 | Reusable DynamicCustomFieldsRenderer | Component rendering fields in `DisplayOrder`, red asterisk `*`, data type UI variants | M3 | R3 |
| 11 | Dynamic Visibility Evaluation Engine | Real-time rule evaluation supporting static patient properties (`gender`, `civilStatus`, `age`) and custom fields | M3 | R3 |
| 12 | Cascading Select Choices Engine | Dynamic dropdown choice derivation based on selected parent field, clearing stale child selections | M3 | R3 |
| 13 | Defensive Submission Validation | Blocks submission if a visible required field is empty; does NOT block for hidden fields | M3 | R3 |
| 14 | Hidden Field Value Sanitization | Strips hidden/empty values before persistence to prevent dirty state | M3 | R3 |
| 15 | Patient Registration Integration | Replaces hardcoded silos in `Patients.screen.tsx` registration modal with `DynamicCustomFieldsRenderer` | M3 | R3 |
| 16 | Patient Demographic Edit Integration | Replaces hardcoded inputs in `EditPatientModal.tsx` with dynamic fields support | M3 | R3 |
| 17 | Patient Chart View Integration | Renders dynamic custom metadata on patient cards and chart workstation views | M3 | R3 |
| 18 | Public Student Intake Cascading | Enforces college-to-program cascading and dynamic field binding in `StudentIntakeClient.tsx` | M3 | R3 |
| 19 | UI/UX Design System Compliance | 100% semantic token usage, zero raw hex colors, 4 core UX states, responsive density | M1, M2, M3 | R4 |
| 20 | Comprehensive E2E Testing Suite | Opaque-box Tier 1-4 tests and adversarial Tier 5 coverage hardening covering all features | M4 | Dual Track |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Generic Entity Metadata Engine Architecture (Backend) | Features 1-4, 19 (Domain schema, EF Core migration, DTOs, CQRS commands/queries, reorder API, template install, tests) | none | DONE |
| M2 | Clinic Admin Intake Fields Management & Template Library | Features 5-9, 19 (CustomFieldsTab, Move Up/Down controls, Add/Edit modal with rule builder & cascading mapper, 1-click templates) | M1 | PLANNED |
| M3 | Dynamic Patient Intake, Registration & Chart Integration | Features 10-18, 19 (DynamicCustomFieldsRenderer, Patients.screen.tsx, EditPatientModal.tsx, chart view, StudentIntakeClient.tsx) | M1, M2 | PLANNED |
| M4 | Final Milestone: 100% E2E Test Suite Pass & Adversarial Hardening | Feature 20 (Pass 100% E2E test suite Tiers 1-4, then Tier 5 adversarial hardening) | M1, M2, M3 | PLANNED |

## Interface Contracts
### Custom Fields Backend ↔ Frontend Client (M1 ↔ M2 & M3)
- `ClinicCustomFieldDefinitionDto`:
  - `Id: Guid`, `TenantId: string`, `ClinicId: Guid`, `EntityType: string`, `FieldKey: string`, `Label: string`, `DataType: CustomFieldDataType` (`Text`, `Number`, `Date`, `Select`, `Boolean`), `Category: string?`, `IsRequired: bool`, `DisplayOrder: int`, `OptionsJson: string?`, `Placeholder: string?`, `IsActive: bool`, `VisibilityRuleJson: string?`, `ConditionalOptionsJson: string?`
- Endpoints:
  - `GET /api/v1/custom-fields?entityType=ClinicPatient` -> sorted by `DisplayOrder` then `Label`
  - `POST /api/v1/custom-fields` -> creates field
  - `PUT /api/v1/custom-fields/{id}` -> updates field definition
  - `DELETE /api/v1/custom-fields/{id}` -> soft-deletes field
  - `PUT /api/v1/custom-fields/reorder` -> payload `{ items?: [{ id, displayOrder }], orderedIds?: [id] }` -> returns updated sorted list
  - `GET /api/v1/custom-fields/templates` -> list of available preset bundles
  - `POST /api/v1/custom-fields/templates/install` -> payload `{ templateKey: string }` -> installs bundle and returns active fields

### VisibilityRuleJson Specification
```json
{
  "source": "custom_field", // or "static"
  "field": "affiliation",    // or "gender", "civilStatus", "dateOfBirth"
  "operator": "equals",      // "equals", "not_equals", "in", "contains", "not_empty"
  "value": "Student"
}
```

### ConditionalOptionsJson Specification
```json
{
  "parentField": "college",
  "mapping": {
    "College of Engineering": ["BS Civil Engineering", "BS Mechanical Engineering"],
    "College of Information Technology": ["BS Computer Science", "BS Information Technology"]
  },
  "defaultOptions": []
}
```

### Dynamic Custom Fields ↔ Patient Registration / Edit (M3)
- Input: `definitions: ClinicCustomFieldDefinition[]`, `values: Record<string, any>`, `staticValues: { gender?: string, civilStatus?: string, dateOfBirth?: string }`, `onChange: (key, value) => void`
- Submission:
  - Validates `isRequired && isVisible && !value` -> blocks submission with inline error.
  - Hidden fields stripped from submission payload.
  - Submits cleaned dictionary to `RegisterClinicPatientCommand.CustomFields` or `UpdateClinicPatientCommand.CustomFields`.

## Code Layout
### Backend (`services/clinic-api/`)
- Domain: `ClinicEz.Clinic.Domain/Entities/ClinicCustomFieldDefinition.cs`
- Infrastructure: `ClinicEz.Clinic.Infrastructure/Persistence/ApplicationDbContext.cs`, `ClinicEz.Clinic.Infrastructure/Migrations/`
- Application:
  - Features: `ClinicEz.Clinic.Application/Features/CustomFields/Commands/` (`CreateCustomFieldDefinitionCommand.cs`, `UpdateCustomFieldDefinitionCommand.cs`, `ReorderCustomFieldsCommand.cs`, `InstallCustomFieldTemplateCommand.cs`)
  - Queries: `ClinicEz.Clinic.Application/Features/CustomFields/Queries/` (`GetClinicCustomFieldsQuery.cs`, `GetCustomFieldTemplatesQuery.cs`)
  - DTOs: `ClinicEz.Clinic.Application/Features/CustomFields/Dtos/ClinicCustomFieldDefinitionDto.cs`
- Controllers: `ClinicEz.Clinic.Api/Controllers/CustomFieldsController.cs`
- Tests: `services/clinic-api/ClinicEz.Clinic.Application.Tests/TenantCustomFieldsAndVerificationTests.cs`

### Frontend (`apps/clinic-app/`)
- Settings: `components/settings/CustomFieldsTab.tsx`, `components/settings/AddEditFieldModal.tsx`
- Intake / Dynamic Rendering: `components/custom-fields/DynamicCustomFieldsRenderer.tsx`
- Screens: `navigation/screens/Patients.screen.tsx`, `components/patient/EditPatientModal.tsx`
- Services: `services/clinicService.ts`
- Tests: `tests/customFieldsTab.test.ts`, `tests/dynamicCustomFieldsRenderer.test.ts`

### Portal Web (`apps/portal-web/`)
- Intake: `src/app/student-intake/[tenantSlug]/StudentIntakeClient.tsx`
