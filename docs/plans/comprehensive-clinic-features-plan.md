# Clinic EZ: Master Architectural Specification & Implementation Plan
## Comprehensive High-Impact Clinic Features & PhilHealth-Case1 Yakap Alignment

**Document Version:** 1.0.0  
**Target Systems:** `services/clinic-api/`, `apps/clinic-app/`, `services/interop-hub/`, `services/patient-api/`, `services/philhealth-proxy/`  
**Governing Statutory Standards:** PhilHealth Konsulta / Yakap Data Dictionary (`KonsultaData_v1.14.dtd`), PhilHealth Annex D Technical Guidelines, WHO Child Growth Standards (LMS Box-Cox), PhilHealth Statutory Catalogs (`lib_immchild`, `lib_immyoungw`, `lib_immpregw`, `lib_immelderly`, `lib_zscore`, `lib_ncdq`, `lib_icd`, `lib_mdiseases`).  
**Author:** Master Architectural Plan Author (Worker 1)  
**Date:** October 2026  
**Status:** Approved for Implementation (Strict Zero Source Code Modification Phase)

---

## Table of Contents
1. [Executive Summary & Architectural Vision](#1-executive-summary--architectural-vision)
2. [Section 1: R1. Doctor Schedule, Rostering & Availability Engine](#2-section-1-r1-doctor-schedule-rostering--availability-engine)
   - [1.1 Problem Statement & Existing Architectural Gap](#11-problem-statement--existing-architectural-gap)
   - [1.2 Domain Models & Aggregate Specifications](#12-domain-models--aggregate-specifications)
   - [1.3 EF Core Configurations, Indexing & PostgreSQL GiST Constraints](#13-ef-core-configurations-indexing--postgresql-gist-constraints)
   - [1.4 MediatR Commands, Queries, Handlers & Validation Rules](#14-mediatr-commands-queries-handlers--validation-rules)
   - [1.5 Slot Availability Engine Algorithm & Concurrency Prevention](#15-slot-availability-engine-algorithm--concurrency-prevention)
   - [1.6 API Controller Contracts](#16-api-controller-contracts)
   - [1.7 React Native Expo UI Components & Hooks](#17-react-native-expo-ui-components--hooks)
3. [Section 2: R2. PhilHealth-Case1 Compliant Immunization Management](#3-section-2-r2-philhealth-case1-compliant-immunization-management)
   - [2.1 PhilHealth Statutory Libraries & Statutory Fallback 999](#21-philhealth-statutory-libraries--statutory-fallback-999)
   - [2.2 Domain Entities & Audit Specifications](#22-domain-entities--audit-specifications)
   - [2.3 EF Core Persistence & Database Schema](#23-ef-core-persistence--database-schema)
   - [2.4 MediatR Commands, Queries & Handlers](#24-mediatr-commands-queries--handlers)
   - [2.5 Interop Hub Cross-Service Event Bus & Synchronization](#25-interop-hub-cross-service-event-bus--synchronization)
   - [2.6 1:1 Yakap XML Transmittal Generation & DTD Compliance](#26-11-yakap-xml-transmittal-generation--dtd-compliance)
   - [2.7 Point-of-Care Mobile UI, Barcode Scanning & Safety Guards](#27-point-of-care-mobile-ui-barcode-scanning--safety-guards)
4. [Section 3: R3. Structured Problem List, Allergies & PhilHealth Chronic Care (NCD)](#4-section-3-r3-structured-problem-list-allergies--philhealth-chronic-care-ncd)
   - [3.1 Longitudinal Problem List & ICD-10 Lifecycle Engine](#31-longitudinal-problem-list--icd-10-lifecycle-engine)
   - [3.2 Structured Patient Allergies & CDS Integration](#32-structured-patient-allergies--cds-integration)
   - [3.3 PhilPEN 24-Question NCD Framework & Relational Modeling](#33-philpen-24-question-ncd-framework--relational-modeling)
   - [3.4 Longitudinal Biomarker Tracking & WHO/ISH Cardiovascular Risk Scoring](#34-longitudinal-biomarker-tracking--whoish-cardiovascular-risk-scoring)
   - [3.5 EF Core Configurations & MediatR Handlers](#35-ef-core-configurations--mediatr-handlers)
   - [3.6 React Native Expo UI & SVG Trend Visualizations](#36-react-native-expo-ui--svg-trend-visualizations)
5. [Section 4: R4. Clinical SOAP Templates, Physical Exam Checklists & WHO Pediatric Growth Charts](#5-section-4-r4-clinical-soap-templates-physical-exam-checklists--who-pediatric-growth-charts)
   - [4.1 Clinical SOAP Templating Engine & Specialty Presets](#41-clinical-soap-templating-engine--specialty-presets)
   - [4.2 Clinical Macros ("Dot-Phrases") Engine](#42-clinical-macros-dot-phrases-engine)
   - [4.3 Modular Physical Exam Checklist & 1-Click Normal Organ Mapping](#43-modular-physical-exam-checklist--1-click-normal-organ-mapping)
   - [4.4 WHO Pediatric Growth Standards & LMS Z-Score Calculator](#44-who-pediatric-growth-standards--lms-z-score-calculator)
   - [4.5 Bi-directional Yakap XML Mapper Alignment (`<SOAP>` & `<PROFILE>`)](#45-bi-directional-yakap-xml-mapper-alignment-soap--profile)
   - [4.6 React Native Expo UI & SVG Growth Curve Visualizer](#46-react-native-expo-ui--svg-growth-curve-visualizer)
6. [Section 5: Cross-Cutting Architectural Patterns](#6-section-5-cross-cutting-architectural-patterns)
   - [5.1 Multi-Tenancy & Schema Isolation](#51-multi-tenancy--schema-isolation)
   - [5.2 Security, RBAC & Permissions Matrix](#52-security-rbac--permissions-matrix)
   - [5.3 Transactional Outbox Pattern & Interop Hub Envelopes](#53-transactional-outbox-pattern--interop-hub-envelopes)
   - [5.4 Audit Logging & Soft Deletion Lifecycle](#54-audit-logging--soft-deletion-lifecycle)
7. [Section 6: Frontend Architecture & State Management (`apps/clinic-app`)](#7-section-6-frontend-architecture--state-management-appsclinic-app)
   - [6.1 Dual Layout Paradigm (Mobile Bottom-Tabs vs Workstation Desktop)](#61-dual-layout-paradigm-mobile-bottom-tabs-vs-workstation-desktop)
   - [6.2 Design Token & Theme Enforcement](#62-design-token--theme-enforcement)
   - [6.3 Offline Outbox Synchronization & Idempotency](#63-offline-outbox-synchronization--idempotency)
   - [6.4 Frontend Component Manifest & File Organization](#64-frontend-component-manifest--file-organization)
8. [Section 7: Phased Implementation Roadmap, Migrations & Dependency Graph](#8-section-7-phased-implementation-roadmap-migrations--dependency-graph)
   - [7.1 Implementation Milestones (M1 to M5)](#71-implementation-milestones-m1-to-m5)
   - [7.2 Dependency Graph](#72-dependency-graph)
   - [7.3 Database Migration Sequencing & SQL DDL Scripts](#73-database-migration-sequencing--sql-ddl-scripts)
   - [7.4 Legacy Data Migration & CustomFields Extraction](#74-legacy-data-migration--customfields-extraction)
9. [Section 8: Quality Assurance, Verification & Compliance Matrix](#9-section-8-quality-assurance-verification--compliance-matrix)
   - [8.1 Test Suites Strategy (Unit, Integration & E2E)](#81-test-suites-strategy-unit-integration--e2e)
   - [8.2 PhilHealth DTD v1.14 Pre-flight Validation Test Harness](#82-philhealth-dtd-v114-pre-flight-validation-test-harness)
   - [8.3 Verification Checklist & Forensic Integrity Attestation](#83-verification-checklist--forensic-integrity-attestation)

---

## 1. Executive Summary & Architectural Vision

The Clinic EZ platform is an enterprise Philippine healthcare operating system designed to serve private clinics, health maintenance organizations (HMOs), and government Rural Health Units (RHUs). A foundational pillar of Clinic EZ is full statutory accreditation as a **PhilHealth Konsulta / Yakap Primary Care EMR**.

While the current codebase provides functional implementations for basic appointment booking, consultation encounter logging, GAMOT pharmacy dispensing, and encrypted claims packaging, in-depth architectural reconnaissance has uncovered four critical operational deficiencies:
1. **Unconstrained Doctor Scheduling**: Appointments are persisted with flat 30-minute intervals without physician schedule templates, break intervals, blackout/leave tracking, or concurrency collision checks.
2. **Unstructured Immunization Tracking**: Vaccine administration records reside in an untyped JSON dictionary (`CustomFields["philhealth_profile"]`), lacking relational lot/batch tracking, expiration guarding, dose sequences, injection site tracking, and cross-service synchronization with the patient mobile app.
3. **Unstructured Problem Lists & Chronic Care (NCD)**: Allergies and chronic diseases are stored as flat text strings, compromising Clinical Decision Support (CDS) safety rules and forcing the PhilPEN 24-question non-communicable disease assessment into un-queryable JSON blobs.
4. **Unstructured Clinical Notes & Pediatric Anthropometry**: Encounter documentation relies on raw text areas without specialty SOAP templates or clinical macros, while WHO pediatric growth standards and PhilHealth's statutory `lib_zscore.json` dataset (656 KB) remain completely detached from clinical workflows.

This specification establishes the exhaustive architectural blueprint to implement all four missing domains across `.NET 9 Clean Architecture` backend services and `React Native Expo SDK 56` frontends, guaranteeing **100% loss-free bi-directional alignment with PhilHealth Konsulta Data DTD v1.14**.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 CLINIC EZ MONOREPO TOPOLOGY                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
                                  │                                  │
                          [REST / JSON HTTP]                 [Transactional Outbox]
                                  │                                  │
                                  ▼                                  ▼
┌───────────────────────────────────────────────┐     ┌───────────────────────────────────────┐
│        apps/clinic-app (Expo SDK 56)          │     │        services/interop-hub           │
│  - DoctorRosterCalendarModal & SlotPicker     │     │     (Event Routing & Mailboxes)       │
│  - VaccineAdminModal & Barcode Scanner        │     └───────────────────────────────────────┘
│  - ProblemListManager & AllergyManagerModal   │          ▲                          ▲
│  - NcdTrendChart & PhilPEN 24 Wizard          │          │                          │
│  - SoapTemplateSelector & PhysicalExamCheck   │   [Interop Envelope]         [Interop Envelope]
│  - WhoGrowthChartVisualizer (SVG LMS curves)  │          │                          │
└───────────────────────────────────────────────┘     ┌────┴───────────────┐    ┌─────┴───────────────┐
                        │                             │ services/clinic-api │    │ services/patient-api│
                        ▼                             │ (Clean Arch .NET 9) │    │  (Patient Passport) │
┌───────────────────────────────────────────────┐     └─────────────────────┘    └─────────────────────┘
│        services/philhealth-proxy              │                │
│    (SOAP Proxy, AES Annex D, DTD v1.14)       │◄───────────────┘
└───────────────────────────────────────────────┘
```

---

## 2. Section 1: R1. Doctor Schedule, Rostering & Availability Engine

### 1.1 Problem Statement & Existing Architectural Gap
In the existing codebase:
- `AppointmentsController.cs` and `CreateAppointmentCommandHandler.cs` directly insert records into the database with a default duration of 30 minutes.
- No entity models represent doctor working hours, shift templates, break times, or blackout leaves.
- There is no collision validation: if two bookings target the same doctor at the same instant, both are accepted.
- In `Appointments.screen.tsx`, front-desk users must manually key in dates and times using raw string text boxes (`YYYY-MM-DD` and `HH:MM`).

### 1.2 Domain Models & Aggregate Specifications
Located in `services/clinic-api/ClinicEz.Clinic.Domain/Entities/`:

#### 1.2.1 `DoctorScheduleTemplate.cs`
Represents the recurring weekly schedule for a doctor.
```csharp
namespace ClinicEz.Clinic.Domain.Entities;

using ClinicEz.Clinic.Domain.Common;

public sealed class DoctorScheduleTemplate : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid? BranchId { get; set; }
    public Guid DoctorId { get; set; }
    public required string DoctorName { get; set; }

    /// <summary>Day of the week (Sunday = 0, Monday = 1, etc.)</summary>
    public DayOfWeek DayOfWeek { get; set; }

    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }

    /// <summary>Indicates shift crosses midnight into the subsequent calendar day (e.g., 22:00 to 06:00).</summary>
    public bool IsOvernightShift { get; set; } = false;

    /// <summary>Slot interval in minutes: 15, 20, 30, 45, 60.</summary>
    public int SlotIntervalMinutes { get; set; } = 30;

    /// <summary>Maximum simultaneous patients per slot (typically 1, >1 for walk-in queues).</summary>
    public int MaxPatientsPerSlot { get; set; } = 1;

    public bool IsActive { get; set; } = true;
    public DateOnly EffectiveStartDate { get; set; }
    public DateOnly? EffectiveEndDate { get; set; }

    public ICollection<DoctorBreakTime> BreakTimes { get; set; } = new List<DoctorBreakTime>();
}
```

#### 1.2.2 `DoctorBreakTime.cs`
Defines non-bookable windows (lunch, ward rounds, meetings) within a shift template.
```csharp
namespace ClinicEz.Clinic.Domain.Entities;

using ClinicEz.Clinic.Domain.Common;

public sealed class DoctorBreakTime : BaseEntity
{
    public Guid DoctorScheduleTemplateId { get; set; }
    public DoctorScheduleTemplate DoctorScheduleTemplate { get; set; } = null!;

    public required string Description { get; set; } // "Lunch Break", "Endorsement"
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
}
```

#### 1.2.3 `DoctorLeave.cs`
Defines blackout periods, vacations, CME, sick leaves, and clinic-wide holiday closures.
```csharp
namespace ClinicEz.Clinic.Domain.Entities;

using ClinicEz.Clinic.Domain.Common;

public enum DoctorLeaveType
{
    Vacation = 1,
    SickLeave = 2,
    ContinuingMedicalEducation = 3,
    Emergency = 4,
    ClinicHoliday = 5
}

public sealed class DoctorLeave : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid? DoctorId { get; set; } // Null if entire facility is closed
    public required string DoctorName { get; set; }

    public DoctorLeaveType LeaveType { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }

    /// <summary>Set if leave covers only part of the day.</summary>
    public TimeOnly? PartialDayStartTime { get; set; }
    public TimeOnly? PartialDayEndTime { get; set; }

    public string? Reason { get; set; }
    public bool IsApproved { get; set; } = true;
    public string? ApprovedByStaffId { get; set; }
}
```

#### 1.2.4 `DoctorScheduleOverride.cs`
Handles date-specific shift modifications (e.g., weekend coverage or shifted hours).
```csharp
namespace ClinicEz.Clinic.Domain.Entities;

using ClinicEz.Clinic.Domain.Common;

public sealed class DoctorScheduleOverride : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid DoctorId { get; set; }
    public required string DoctorName { get; set; }

    public DateOnly OverrideDate { get; set; }
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
    public bool IsOvernightShift { get; set; } = false;
    public int SlotIntervalMinutes { get; set; } = 30;

    /// <summary>If true, cancels all bookings and normal template for this date.</summary>
    public bool IsCancelled { get; set; } = false;
    public string? Reason { get; set; }
}
```

#### 1.2.5 Enhancement to `Appointment.cs`
Add calculated `EndTimeUtc` and concurrency token:
```csharp
// Added to Appointment.cs:
public DateTime EndTimeUtc { get; set; }
public uint Version { get; set; } // Maps to PostgreSQL xmin for optimistic concurrency
```

### 1.3 EF Core Configurations, Indexing & PostgreSQL GiST Constraints
Located in `services/clinic-api/ClinicEz.Clinic.Infrastructure/Persistence/Configurations/`:

```csharp
public sealed class DoctorScheduleTemplateConfiguration : IEntityTypeConfiguration<DoctorScheduleTemplate>
{
    public void Configure(EntityTypeBuilder<DoctorScheduleTemplate> builder)
    {
        builder.ToTable("DoctorScheduleTemplates");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.TenantId).HasMaxLength(100).IsRequired();
        builder.Property(e => e.DoctorName).HasMaxLength(150).IsRequired();
        builder.HasIndex(e => new { e.ClinicId, e.DoctorId, e.DayOfWeek, e.IsActive });
        builder.HasMany(e => e.BreakTimes)
               .WithOne(b => b.DoctorScheduleTemplate)
               .HasForeignKey(b => b.DoctorScheduleTemplateId)
               .OnDelete(DeleteBehavior.Cascade);

        // Note: Multi-tenant query filter is configured centrally in ApplicationDbContext.OnModelCreating
        // using `e => !e.IsDeleted && e.ClinicId == CurrentClinicId` to prevent cross-clinic leakage.
    }
}

public sealed class DoctorLeaveConfiguration : IEntityTypeConfiguration<DoctorLeave>
{
    public void Configure(EntityTypeBuilder<DoctorLeave> builder)
    {
        builder.ToTable("DoctorLeaves");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.TenantId).HasMaxLength(100).IsRequired();
        builder.Property(e => e.DoctorName).HasMaxLength(150).IsRequired();
        builder.HasIndex(e => new { e.ClinicId, e.DoctorId, e.StartDate, e.EndDate });

        // Multi-tenant filter configured centrally in ApplicationDbContext.OnModelCreating
    }
}
```

#### Central Multi-Tenant Query Filter Configuration (`ApplicationDbContext.cs`):
To strictly eliminate cross-tenant data leak risks, all scheduling entities enforce the central repository pattern in `ApplicationDbContext.OnModelCreating`:
```csharp
modelBuilder.Entity<DoctorScheduleTemplate>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
modelBuilder.Entity<DoctorLeave>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
modelBuilder.Entity<DoctorScheduleOverride>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
```

#### PostgreSQL GiST Exclusion Constraint & Double-Booking Prevention:
A standard B-tree index on `(ClinicId, DoctorId, ScheduledAt, EndTimeUtc)` does **not** prevent overlapping intervals under concurrent booking traffic (classic TOCTOU race condition). True physical database serialization is enforced using PostgreSQL's `btree_gist` extension and an exclusion constraint using the temporal range operator `&&` on half-open timestamps `[)`:

```csharp
// In ApplicationDbContext.OnModelCreating:
modelBuilder.HasPostgresExtension("btree_gist");

modelBuilder.Entity<Appointment>(entity =>
{
    entity.Property(e => e.Version).IsRowVersion(); // xmin optimistic concurrency token
});
```

Physical PostgreSQL DDL Migration (`20261010_01_AddDoctorSchedulingSuite.cs`):
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Appointments" ADD CONSTRAINT "UQ_Doctor_No_Overlapping_Appointments"
EXCLUDE USING gist (
    "ClinicId" WITH =,
    "DoctorId" WITH =,
    tstzrange("ScheduledAt", "EndTimeUtc", '[)') WITH &&
)
WHERE ("Status" != 'Cancelled');
```

#### Database Collision Exception Handling:
When concurrent requests attempt overlapping bookings, PostgreSQL throws `Npgsql.PostgresException` with SqlState `23P01` (`exclusion_violation`). Application handlers (`CreateAppointmentCommandHandler` and `RescheduleAppointmentCommandHandler`) catch this database exception and map it directly to a standardized `409 Conflict` domain result:
```csharp
catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.ExclusionViolation }) // "23P01"
{
    return Result.Failure<AppointmentDto>(new Error(
        "Appointment.Conflict",
        "The doctor has an existing overlapping booking during the requested time window."));
}
```

### 1.4 MediatR Commands, Queries, Handlers & Validation Rules

#### 1.4.1 `UpsertDoctorScheduleTemplateCommand`
```csharp
public sealed record UpsertDoctorScheduleTemplateCommand(
    Guid DoctorId,
    string DoctorName,
    DayOfWeek DayOfWeek,
    TimeOnly StartTime,
    TimeOnly EndTime,
    bool IsOvernightShift,
    int SlotIntervalMinutes,
    int MaxPatientsPerSlot,
    DateOnly EffectiveStartDate,
    DateOnly? EffectiveEndDate,
    List<DoctorBreakTimeDto> Breaks
) : IRequest<Result<Guid>>;

public sealed record DoctorBreakTimeDto(
    string Description,
    TimeOnly StartTime,
    TimeOnly EndTime
);

public sealed class UpsertDoctorScheduleTemplateValidator : AbstractValidator<UpsertDoctorScheduleTemplateCommand>
{
    public UpsertDoctorScheduleTemplateValidator()
    {
        RuleFor(x => x.DoctorId).NotEmpty();
        RuleFor(x => x.DoctorName).NotEmpty().MaximumLength(150);
        
        RuleFor(x => x)
            .Must(x => x.StartTime != x.EndTime)
            .WithMessage("Shift start time and end time cannot be identical.");

        RuleFor(x => x)
            .Must(x => x.IsOvernightShift || x.EndTime > x.StartTime)
            .WithMessage("Standard day shifts require end time to be greater than start time. Flag IsOvernightShift for shifts crossing midnight.");

        RuleFor(x => x.SlotIntervalMinutes).Must(x => new[] { 10, 15, 20, 30, 45, 60 }.Contains(x))
            .WithMessage("Slot interval must be 10, 15, 20, 30, 45, or 60 minutes.");

        RuleForEach(x => x.Breaks).ChildRules(b =>
        {
            b.RuleFor(x => x.Description).NotEmpty().MaximumLength(100);
            b.RuleFor(x => x.EndTime).NotEqual(x => x.StartTime)
                .WithMessage("Break end time cannot equal start time.");
        });

        // Break alignment & boundaries validation
        RuleFor(x => x).Custom((cmd, context) =>
        {
            var interval = cmd.SlotIntervalMinutes;
            var orderedBreaks = cmd.Breaks.OrderBy(b => b.StartTime).ToList();

            for (int i = 0; i < orderedBreaks.Count; i++)
            {
                var brk = orderedBreaks[i];

                // 1. Grid alignment rule: breaks must start and end on slot interval multiples
                if (brk.StartTime.Minute % interval != 0 || brk.EndTime.Minute % interval != 0)
                {
                    context.AddFailure($"Break '{brk.Description}' must align with the {interval}-minute slot grid to avoid straddling partial appointment slots.");
                }

                // 2. Shift containment rule
                if (!cmd.IsOvernightShift)
                {
                    if (brk.StartTime < cmd.StartTime || brk.EndTime > cmd.EndTime)
                    {
                        context.AddFailure($"Break '{brk.Description}' must fall entirely within the shift window [{cmd.StartTime} - {cmd.EndTime}].");
                    }
                }
                else
                {
                    // For overnight shifts (e.g. 22:00 to 06:00), breaks must be either >= StartTime or <= EndTime
                    bool validOvernight = (brk.StartTime >= cmd.StartTime && brk.EndTime > brk.StartTime) ||
                                          (brk.StartTime < cmd.EndTime && brk.EndTime <= cmd.EndTime) ||
                                          (brk.StartTime >= cmd.StartTime && brk.EndTime <= cmd.EndTime); // break crossing midnight
                    if (!validOvernight)
                    {
                        context.AddFailure($"Break '{brk.Description}' falls outside the overnight shift boundaries.");
                    }
                }

                // 3. Non-overlapping breaks rule
                if (i > 0 && !cmd.IsOvernightShift)
                {
                    var prev = orderedBreaks[i - 1];
                    if (brk.StartTime < prev.EndTime)
                    {
                        context.AddFailure($"Break '{brk.Description}' overlaps with preceding break '{prev.Description}'.");
                    }
                }
            }
        });
    }
}
```

#### 1.4.2 `GetDoctorAvailableSlotsQuery`
```csharp
public sealed record GetDoctorAvailableSlotsQuery(
    Guid DoctorId,
    DateOnly Date,
    int? RequestedSlotIntervalMinutes = null
) : IRequest<Result<DoctorAvailabilityDto>>;

public sealed record DoctorAvailabilityDto(
    Guid DoctorId,
    string DoctorName,
    DateOnly Date,
    bool IsOnDuty,
    string? NonAvailabilityReason,
    List<AvailableSlotItemDto> Slots
);

public sealed record AvailableSlotItemDto(
    TimeOnly StartTime,
    TimeOnly EndTime,
    DateTimeOffset SlotStartUtc,
    DateTimeOffset SlotEndUtc,
    bool IsAvailable,
    string Status, // "Available", "Booked", "Break", "Past", "OnLeave"
    Guid? ExistingAppointmentId
);
```

### 1.5 Slot Availability Engine Algorithm & Concurrency Prevention
The calculation engine `ISlotAvailabilityService` executes in `ClinicEz.Clinic.Application/Features/Scheduling/Services/`:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                     SLOT AVAILABILITY ENGINE ALGORITHM (TIMEZONE-AWARE)                     │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
  Input: (DoctorId, TargetDate [Local Philippine DateOnly], ClinicId)
    │
    ▼
  1. Evaluate Leaves & Blackouts:
     Query DoctorLeaves where ClinicId == current and (DoctorId == target or DoctorId == null)
     and TargetDate >= StartDate and TargetDate <= EndDate and IsApproved == true.
     ├─ If Full-Day Leave Found ──► Return: IsOnDuty = false, NonAvailabilityReason = "On Leave"
     └─ If Partial-Day Leave ─────► Record Blackout Time Window
    │
    ▼
  2. Evaluate Shift Template / Override (Including Adjacent Overnight Shifts):
     Query DoctorScheduleOverride for (DoctorId, TargetDate).
     ├─ If Override exists and IsCancelled == true ──► Return: IsOnDuty = false
     ├─ If Override exists and active ──────────────► Use Override StartTime, EndTime, IsOvernight
     └─ Else Query DoctorScheduleTemplates matching:
        (DoctorId == target AND IsActive == true AND TargetDate between EffectiveStartDate and EffectiveEndDate)
        AND (DayOfWeek == TargetDate.DayOfWeek OR 
            (DayOfWeek == TargetDate.AddDays(-1).DayOfWeek AND IsOvernightShift == true))
        ├─ If No Templates Found ─────────────────────► Return: IsOnDuty = false ("No Roster")
        └─ If Found ──────────────────────────────────► Normalize shifts spanning into TargetDate
    │
    ▼
  3. Generate Discretized Slots Across Midnight Boundary:
     Anchor calculations to clinic timezone ("Asia/Manila", UTC+8):
     For standard shift: iterate local time from StartTime stepping by SlotIntervalMinutes to EndTime.
     For overnight shift from previous day: iterate from StartTime (Day - 1) across midnight to EndTime (Day).
     Filter generated slots to retain those that commence within TargetDate [00:00:00 to 23:59:59 PST].
     For each [SlotStart, SlotEnd]:
     - Check overlap with Breaks ────────────────────► If overlaps: Mark Status = "Break", IsAvailable = false
     - Check overlap with Partial Leaves ────────────► If overlaps: Mark Status = "OnLeave", IsAvailable = false
     - Check if SlotEndUtc < DateTimeOffset.UtcNow ──► Mark Status = "Past", IsAvailable = false
    │
    ▼
  4. Query Existing Bookings (Timezone-Aware UTC Boundary Range):
     Convert TargetDate local day [00:00:00, 23:59:59] PST to exact UTC bounds:
       dayStartUtc = TimeZoneInfo.ConvertTimeToUtc(TargetDate.ToDateTime(TimeOnly.MinValue), clinicTz);
       dayEndUtc   = TimeZoneInfo.ConvertTimeToUtc(TargetDate.ToDateTime(TimeOnly.MaxValue), clinicTz);
     
     Query Appointments where ClinicId == current and DoctorId == target and Status != Cancelled
     and ScheduledAt < dayEndUtc and EndTimeUtc > dayStartUtc.
     Count active bookings overlapping each [SlotStartUtc, SlotEndUtc]:
     ├─ If Count >= MaxPatientsPerSlot ──────────────► Mark Status = "Booked", IsAvailable = false
     └─ Else ────────────────────────────────────────► Mark Status = "Available", IsAvailable = true
    │
    ▼
  5. Return Result Payload to Client
```

#### Collision Guard in `CreateAppointmentCommandHandler.cs`:
```csharp
// 1. Calculate UTC range:
var duration = request.DurationMinutes > 0 ? request.DurationMinutes : 30;
var newAppointmentStartUtc = request.ScheduledAt.ToUniversalTime();
var newAppointmentEndUtc = newAppointmentStartUtc.AddMinutes(duration);

// 2. Application-level check (fast path):
var hasCollision = await _appointmentRepo.Query(a =>
    a.ClinicId == _clinicContext.ClinicId &&
    a.DoctorId == request.DoctorId &&
    a.Status != AppointmentStatus.Cancelled &&
    a.ScheduledAt < newAppointmentEndUtc &&
    newAppointmentStartUtc < a.EndTimeUtc)
    .AnyAsync(ct);

if (hasCollision)
{
    return Result.Failure(new Error("Appointment.Conflict", 
        "The selected doctor is already booked during this time window."));
}

var appointment = new Appointment
{
    ClinicId = _clinicContext.ClinicId,
    DoctorId = request.DoctorId,
    PatientId = request.PatientId,
    ScheduledAt = newAppointmentStartUtc,
    DurationMinutes = duration,
    EndTimeUtc = newAppointmentEndUtc,
    Status = AppointmentStatus.Scheduled
};

try
{
    await _appointmentRepo.AddAsync(appointment, ct);
    await _unitOfWork.SaveChangesAsync(ct);
    return Result.Success(appointment.Id);
}
catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.ExclusionViolation }) // 23P01
{
    return Result.Failure(new Error("Appointment.Conflict",
        "A concurrent booking completed first for this doctor and time slot."));
}
```

#### Collision Guard & EndTimeUtc Integration in `RescheduleAppointmentCommandHandler.cs`:
The existing `RescheduleAppointmentCommandHandler` is updated to recalculate `EndTimeUtc`, execute collision validation, and catch PostgreSQL GiST exclusion violations:

```csharp
public async Task<Result<AppointmentDto>> Handle(RescheduleAppointmentCommand request, CancellationToken ct)
{
    var appointment = await _appointmentRepo.Query()
        .FirstOrDefaultAsync(a => a.Id == request.Id, ct);

    if (appointment == null)
    {
        return Result.Failure<AppointmentDto>(new Error("Appointment.NotFound", 
            $"Appointment with ID {request.Id} was not found."));
    }

    var duration = request.DurationMinutes.GetValueOrDefault(appointment.DurationMinutes);
    if (duration <= 0) duration = 30;

    var newStartUtc = request.NewScheduledAt.ToUniversalTime();
    var newEndUtc = newStartUtc.AddMinutes(duration);

    // Concurrency collision check against all other active appointments
    var hasCollision = await _appointmentRepo.Query(a =>
        a.ClinicId == appointment.ClinicId &&
        a.DoctorId == appointment.DoctorId &&
        a.Status != AppointmentStatus.Cancelled &&
        a.Id != appointment.Id &&
        a.ScheduledAt < newEndUtc &&
        newStartUtc < a.EndTimeUtc)
        .AnyAsync(ct);

    if (hasCollision)
    {
        return Result.Failure<AppointmentDto>(new Error("Appointment.Conflict",
            "Cannot reschedule: the selected doctor is already booked during this time window."));
    }

    appointment.ScheduledAt = newStartUtc;
    appointment.DurationMinutes = duration;
    appointment.EndTimeUtc = newEndUtc;
    appointment.UpdatedAt = DateTime.UtcNow;
    appointment.UpdatedBy = _clinicContext.StaffName ?? "ClinicStaff";

    if (!string.IsNullOrWhiteSpace(request.Reason))
    {
        appointment.Notes = string.IsNullOrWhiteSpace(appointment.Notes)
            ? $"Rescheduled: {request.Reason}"
            : $"{appointment.Notes} | Rescheduled: {request.Reason}";
    }

    try
    {
        await _unitOfWork.SaveChangesAsync(ct);
        return Result.Success(AppointmentDto.From(appointment));
    }
    catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.ExclusionViolation }) // 23P01
    {
        return Result.Failure<AppointmentDto>(new Error("Appointment.Conflict",
            "Cannot reschedule: a concurrent transaction locked an overlapping appointment slot."));
    }
}
```

### 1.6 API Controller Contracts

#### `DoctorSchedulesController.cs` (`Route: api/v1/doctors/{doctorId}/schedules`)
- `GET /api/v1/doctors/{doctorId}/schedules/templates`
  - **Permissions**: `schedules:read`
  - **Response 200**: `ApiResponse<List<DoctorScheduleTemplateDto>>`
- `POST /api/v1/doctors/{doctorId}/schedules/templates`
  - **Permissions**: `schedules:manage`
  - **Body**: `UpsertDoctorScheduleTemplateCommand`
  - **Response 200/201**: `ApiResponse<Guid>` (Template ID)
  - **Response 400**: Validation failure (break misalignment, invalid interval)
- `GET /api/v1/doctors/{doctorId}/schedules/availability?date={YYYY-MM-DD}&interval={minutes}`
  - **Permissions**: `schedules:read`
  - **Response 200**: `ApiResponse<DoctorAvailabilityDto>` (Discretized slot matrix)
- `POST /api/v1/doctors/{doctorId}/schedules/leaves`
  - **Permissions**: `schedules:manage`
  - **Body**: `CreateDoctorLeaveCommand` (`LeaveType`, `StartDate`, `EndDate`, `Reason`)
  - **Response 201**: `ApiResponse<Guid>`
- `GET /api/v1/doctors/{doctorId}/schedules/leaves`
  - **Permissions**: `schedules:read`
  - **Response 200**: `ApiResponse<List<DoctorLeaveDto>>`

#### `AppointmentsController.cs` (Updated Integration Contracts)
- `POST /api/v1/appointments`
  - **Permissions**: `appointments:create`
  - **Body**: `CreateAppointmentCommand` (`DoctorId`, `PatientId`, `ScheduledAt`, `DurationMinutes`)
  - **Response 201**: `ApiResponse<Guid>`
  - **Response 409 Conflict**: Doctor already booked (PostgreSQL GiST exclusion violation or application collision)
- `PATCH /api/v1/appointments/{id}/reschedule`
  - **Permissions**: `appointments:manage`
  - **Body**: `RescheduleAppointmentCommand` (`NewScheduledAt`, `DurationMinutes`, `Reason`)
  - **Response 200**: `ApiResponse<AppointmentDto>` with recalculated `EndTimeUtc`
  - **Response 409 Conflict**: Doctor already booked in new slot

### 1.7 React Native Expo UI Components & Hooks
Located in `apps/clinic-app/components/roster/`:

#### 1.7.1 `SlotPicker.tsx`
Renders an interactive time-slot grid replacing raw text inputs:
- Groups slots into Morning (before 12:00 PM), Afternoon (12:00 PM - 5:00 PM), and Evening/Night (after 5:00 PM).
- Highlights available slots in `theme.colors.surface` with border token `theme.colors.border`.
- Booked slots render as muted chips (`theme.colors.textMuted`, label "Booked").
- Break slots display a coffee cup badge with tooltip description.
- Automatically handles 409 Conflict responses by invalidating cache and animating adjacent open slots.

#### 1.7.2 `DoctorRosterCalendarModal.tsx`
Provides clinic administrators and doctors a monthly/weekly visual view to configure:
- Weekly shift templates with toggleable days (Mon - Sun).
- Start and end time pickers with `IsOvernightShift` toggle.
- Break interval grid alignment enforcement.
- Dense workstation modal rendering: `maxWidth={isWorkstation ? 960 : 540}` to avoid horizontal clipping on desktop viewports.

#### 1.7.3 `useDoctorAvailability.ts` Hook (Real-Time Polling & Collision Self-Healing)
```typescript
import { useState, useEffect, useCallback, useRef } from 'react';
import { clinicService } from '../../services/clinicService';
import type { DoctorAvailabilityDto } from '../../types/scheduling';

export function useDoctorAvailability(doctorId: string | null, date: string, interval?: number, isVisible: boolean = true) {
  const [data, setData] = useState<DoctorAvailabilityDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchAvailability = useCallback(async (isBackground: boolean = false) => {
    if (!doctorId || !date) {
      setData(null);
      return;
    }
    if (!isBackground) setLoading(true);

    try {
      const result = await clinicService.getDoctorAvailability(doctorId, date, interval);
      setData(result);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load doctor availability');
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [doctorId, date, interval]);

  // Initial fetch and 30-second interval polling when modal is active
  useEffect(() => {
    if (!isVisible) {
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
      return;
    }

    fetchAvailability(false);

    pollingTimerRef.current = setInterval(() => {
      fetchAvailability(true);
    }, 30_000);

    return () => {
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    };
  }, [isVisible, fetchAvailability]);

  return {
    data,
    loading,
    error,
    refresh: () => fetchAvailability(false)
  };
}
```

---

## 3. Section 2: R2. PhilHealth-Case1 Compliant Immunization Management

### 2.1 PhilHealth Statutory Libraries & Statutory Fallback 999
PhilHealth Konsulta and Yakap claim transmittals are governed by `KonsultaData_v1.14.dtd`.
Line 160 of the DTD mandates that `<PROFILE>` contains `<IMMUNIZATIONS (IMMUNIZATION)+>`.
An empty `<IMMUNIZATIONS/>` node triggers immediate XML parser termination.

#### Statutory Coding Libraries Seeded in `services/clinic-api/ClinicEz.Clinic.Infrastructure/PhilHealth/Catalog/Seed/`:
1. `lib_immchild`: Pediatric vaccines for children 0-17 years (e.g., `C01` = BCG, `C02`-`C04` = OPV 1-3, `C05`-`C07` = DPT-HepB-Hib 1-3, `C08` = Measles, `C12` = Hepatitis A).
2. `lib_immyoungw`: Adolescent and young women vaccines (e.g., `Y01` = HPV, `Y02` = MMR).
3. `lib_immpregw`: Maternal vaccines (e.g., `P01` = Tetanus Toxoid / Td).
4. `lib_immelderly`: Senior citizen vaccines (e.g., `E01` = Pneumococcal, `E02` = Seasonal Influenza).
5. `OtherImm`: Non-statutory vaccines (Rabies, Japanese Encephalitis, COVID-19, Typhoid).
6. **Statutory Fallback `999` ("None / Not Given")**: Mandatory statutory code emitted when a patient has received no immunizations or documentation is unavailable.

### 2.2 Domain Entities & Audit Specifications
Located in `services/clinic-api/ClinicEz.Clinic.Domain/Entities/PatientImmunization.cs`:

```csharp
namespace ClinicEz.Clinic.Domain.Entities;

using ClinicEz.Clinic.Domain.Common;

public sealed class PatientImmunization : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid? BranchId { get; set; }
    public Guid PatientId { get; set; }
    public required string PatientName { get; set; }
    public Guid? ConsultationEncounterId { get; set; }

    // PhilHealth Statutory Alignment
    /// <summary>Catalog library: lib_immchild, lib_immyoungw, lib_immpregw, lib_immelderly, or OtherImm.</summary>
    public required string PhilHealthLibrary { get; set; }
    
    /// <summary>Statutory code (e.g., "C01", "Y01", "P01", "E01", or "999").</summary>
    public required string PhilHealthCode { get; set; }
    public required string VaccineName { get; set; }

    // Clinical Administration Parameters
    public string? BrandName { get; set; }
    public string? Manufacturer { get; set; }
    public required string LotBatchNumber { get; set; }
    public DateOnly ExpirationDate { get; set; }

    public int DoseSequence { get; set; } = 1; // 1 = Dose 1, 2 = Dose 2, 3 = Dose 3, 4 = Booster
    public bool IsSeriesCompleted { get; set; } = false;
    public string Route { get; set; } = "Intramuscular"; // IM, SC, Intradermal, Oral
    public string InjectionSite { get; set; } = "Left Deltoid"; // Left Deltoid, Right Deltoid, Anterolateral Thigh

    public DateTime AdministeredAtUtc { get; set; } = DateTime.UtcNow;
    public Guid AdministeredByStaffId { get; set; }
    public required string AdministeredByStaffName { get; set; }
    public string? AdministeredByPrcLicense { get; set; }

    // Adverse Event Following Immunization (AEFI)
    public bool HasAdverseReaction { get; set; } = false;
    public string AdverseReactionSeverity { get; set; } = "None"; // None, Mild, Moderate, Severe, Anaphylaxis
    public string? AdverseReactionRemarks { get; set; }
    public DateTime? AdverseReactionRecordedAtUtc { get; set; }

    // Cross-Service Interoperability
    public bool IsSynchronizedToPatientApp { get; set; } = false;
    public DateTime? SynchronizedAtUtc { get; set; }
}
```

### 2.3 EF Core Persistence & Database Schema
In `ClinicEz.Clinic.Infrastructure/Persistence/Configurations/PatientImmunizationConfiguration.cs`:
```csharp
public sealed class PatientImmunizationConfiguration : IEntityTypeConfiguration<PatientImmunization>
{
    public void Configure(EntityTypeBuilder<PatientImmunization> builder)
    {
        builder.ToTable("PatientImmunizations");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.TenantId).HasMaxLength(100).IsRequired();
        builder.Property(e => e.PatientName).HasMaxLength(150).IsRequired();
        builder.Property(e => e.PhilHealthLibrary).HasMaxLength(50).IsRequired();
        builder.Property(e => e.PhilHealthCode).HasMaxLength(20).IsRequired();
        builder.Property(e => e.VaccineName).HasMaxLength(150).IsRequired();
        builder.Property(e => e.LotBatchNumber).HasMaxLength(100).IsRequired();
        builder.Property(e => e.Route).HasMaxLength(50).IsRequired();
        builder.Property(e => e.InjectionSite).HasMaxLength(100).IsRequired();
        builder.Property(e => e.AdministeredByStaffName).HasMaxLength(150).IsRequired();
        builder.Property(e => e.AdverseReactionSeverity).HasMaxLength(50).IsRequired().HasDefaultValue("None");

        builder.HasIndex(e => new { e.ClinicId, e.PatientId });
        builder.HasIndex(e => new { e.ClinicId, e.AdministeredAtUtc });
        builder.HasIndex(e => new { e.LotBatchNumber, e.ExpirationDate });

        // Note: Multi-tenant query filter is configured centrally in ApplicationDbContext.OnModelCreating
        // using `e => !e.IsDeleted && e.ClinicId == CurrentClinicId` to eliminate cross-tenant data leaks.
    }
}
```

### 2.4 MediatR Commands, Queries & Handlers
Implemented in `ClinicEz.Clinic.Application/Features/Immunizations/`:

#### 2.4.1 `AdministerVaccineCommand` (Point-of-Care Administration)
```csharp
public sealed record AdministerVaccineCommand(
    Guid PatientId,
    Guid? ConsultationEncounterId,
    string PhilHealthLibrary,
    string PhilHealthCode,
    string VaccineName,
    string? BrandName,
    string? Manufacturer,
    string LotBatchNumber,
    DateOnly ExpirationDate,
    int DoseSequence,
    bool IsSeriesCompleted,
    string Route,
    string InjectionSite,
    DateTime AdministeredAtUtc,
    string? Notes
) : IRequest<Result<Guid>>;

public sealed class AdministerVaccineValidator : AbstractValidator<AdministerVaccineCommand>
{
    public AdministerVaccineValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty();
        RuleFor(x => x.PhilHealthLibrary).NotEmpty();
        RuleFor(x => x.PhilHealthCode).NotEmpty();
        RuleFor(x => x.VaccineName).NotEmpty();
        RuleFor(x => x.LotBatchNumber).NotEmpty();
        
        // Expiration safety gate against clinic local date (Asia/Manila, UTC+8)
        RuleFor(x => x.ExpirationDate).Must(exp =>
        {
            var todayManila = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(
                DateTime.UtcNow, TimeZoneInfo.FindSystemTimeZoneById("Asia/Manila")));
            return exp >= todayManila;
        }).WithMessage("Cannot administer expired vaccine batch.");

        RuleFor(x => x.DoseSequence).GreaterThanOrEqualTo(1);
        RuleFor(x => x.Route).NotEmpty();
        RuleFor(x => x.InjectionSite).NotEmpty();
    }
}
```

#### 2.4.2 `RecordHistoricalImmunizationCommand` (Historical & Baseline Profiling)
Allows documenting vaccinations administered in prior years or outside facilities for PhilHealth `<PROFILE>` baseline transmittal without being blocked by point-of-care inventory or expiration gates:

```csharp
public sealed record RecordHistoricalImmunizationCommand(
    Guid PatientId,
    string PhilHealthLibrary,
    string PhilHealthCode,
    string VaccineName,
    DateOnly DateAdministered,
    int DoseSequence,
    bool IsSeriesCompleted,
    string? LotBatchNumber = null,
    DateOnly? ExpirationDate = null,
    string? InjectionSite = null,
    string? HistoricalFacilityName = null,
    string? Remarks = null
) : IRequest<Result<Guid>>;

public sealed class RecordHistoricalImmunizationValidator : AbstractValidator<RecordHistoricalImmunizationCommand>
{
    public RecordHistoricalImmunizationValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty();
        RuleFor(x => x.PhilHealthLibrary).NotEmpty();
        RuleFor(x => x.PhilHealthCode).NotEmpty();
        RuleFor(x => x.VaccineName).NotEmpty();

        RuleFor(x => x.DateAdministered).Must(d =>
        {
            var todayManila = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(
                DateTime.UtcNow, TimeZoneInfo.FindSystemTimeZoneById("Asia/Manila")));
            return d <= todayManila;
        }).WithMessage("Historical immunization date cannot be in the future.");

        RuleFor(x => x.DoseSequence).GreaterThanOrEqualTo(1);
    }
}
```

#### 2.4.3 `RecordImmunizationAefiCommand` (Retroactive Adverse Event Tracking)
Captures Adverse Events Following Immunization occurring 15 minutes to days after injection:

```csharp
public sealed record RecordImmunizationAefiCommand(
    Guid PatientId,
    Guid ImmunizationId,
    string AdverseReactionSeverity, // "Mild", "Moderate", "Severe", "Anaphylaxis"
    string AdverseReactionRemarks,
    DateTime RecordedAtUtc
) : IRequest<Result<Unit>>;

public sealed class RecordImmunizationAefiValidator : AbstractValidator<RecordImmunizationAefiCommand>
{
    public RecordImmunizationAefiValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty();
        RuleFor(x => x.ImmunizationId).NotEmpty();
        RuleFor(x => x.AdverseReactionSeverity).Must(s => 
            new[] { "Mild", "Moderate", "Severe", "Anaphylaxis" }.Contains(s))
            .WithMessage("Adverse reaction severity must be Mild, Moderate, Severe, or Anaphylaxis.");
        RuleFor(x => x.AdverseReactionRemarks).NotEmpty().MaximumLength(1000);
    }
}
```

### 2.5 Interop Hub Cross-Service Event Bus & Synchronization
Upon successful vaccine administration in `clinic-api`, an interop event is published to `interop-hub` to synchronize the patient's lifelong vaccination record with `patient-api`.

#### Interop Event Topic Contract (`packages/shared-dotnet/Interop/InteropTypes.cs`):
```csharp
public const string ClinicalImmunizationAdministered = "clinical.immunization.administered";
```

#### Envelope Payload Contract (`ImmunizationAdministeredPayload.cs`):
```csharp
public sealed record ImmunizationAdministeredPayload
{
    public Guid ImmunizationId { get; init; }
    public Guid PatientId { get; init; }
    public string VaccineName { get; init; } = string.Empty;
    public string PhilHealthCode { get; init; } = string.Empty;
    public string PhilHealthLibrary { get; init; } = string.Empty;
    public string LotBatchNumber { get; init; } = string.Empty;
    public DateOnly ExpirationDate { get; init; }
    public int DoseSequence { get; init; }
    public bool IsSeriesCompleted { get; init; }
    public string Route { get; init; } = string.Empty;
    public string InjectionSite { get; init; } = string.Empty;
    public DateTime AdministeredAtUtc { get; init; }
    public string AdministeredByName { get; init; } = string.Empty;
    public string? AdministeredByPrcLicense { get; init; }
    public string FacilityName { get; init; } = string.Empty;
}
```

#### Publishing via Transactional Outbox (Strongly Typed Enum Contract):
```csharp
await _interopPublisher.EnqueueAsync(new InteropEnvelope
{
    MessageId = Guid.NewGuid(),
    CorrelationId = _clinicContext.CorrelationId,
    Type = InteropTypes.ClinicalImmunizationAdministered,
    SchemaVersion = 1,
    From = Party.ForFacility(_clinicContext.TenantId, _clinicContext.ClinicId.ToString(), FacilityType.Clinic),
    To = Party.ForPatient(command.PatientId.ToString()),
    Payload = JsonSerializer.SerializeToElement(payload)
}, cancellationToken);
```

### 2.6 1:1 Yakap XML Transmittal Generation & DTD Compliance
In `YakapClinicalMapper.cs`, query results from `PatientImmunization` are mapped directly to Yakap DTOs:

```csharp
private static List<YakapImmunizationDto> MapImmunizations(
    IEnumerable<PatientImmunization> immunizations,
    IPhilHealthCatalogResolver resolver)
{
    var list = new List<YakapImmunizationDto>();

    foreach (var imm in immunizations.Where(i => !i.IsDeleted))
    {
        list.Add(new YakapImmunizationDto(
            ChildImmcode: imm.PhilHealthLibrary == "lib_immchild" ? imm.PhilHealthCode : "",
            YoungwImmcode: imm.PhilHealthLibrary == "lib_immyoungw" ? imm.PhilHealthCode : "",
            PregwImmcode: imm.PhilHealthLibrary == "lib_immpregw" ? imm.PhilHealthCode : "",
            ElderlyImmcode: imm.PhilHealthLibrary == "lib_immelderly" ? imm.PhilHealthCode : "",
            OtherImm: imm.PhilHealthLibrary == "OtherImm" ? imm.PhilHealthCode : "",
            ReportStatus: "U",
            DeficiencyRemarks: imm.HasAdverseReaction ? $"AEFI: {imm.AdverseReactionSeverity}" : ""
        ));
    }

    // MANDATORY STATUTORY FALLBACK 999:
    // DTD v1.14 dictates <!ELEMENT IMMUNIZATIONS (IMMUNIZATION)+>.
    // If no immunizations were recorded, emit statutory code 999 under pOtherImm.
    if (list.Count == 0)
    {
        list.Add(new YakapImmunizationDto(
            ChildImmcode: "",
            YoungwImmcode: "",
            PregwImmcode: "",
            ElderlyImmcode: "",
            OtherImm: resolver.NoImmunizationCode(), // Returns "999"
            ReportStatus: "U",
            DeficiencyRemarks: ""
        ));
    }

    return list;
}
```

Generated XML in `KonsultaXmlGenerator.cs`:
```xml
<!-- When immunizations exist: -->
<IMMUNIZATIONS>
  <IMMUNIZATION pChildImmcode="C01" pYoungwImmcode="" pPregwImmcode="" pElderlyImmcode="" pOtherImm="" pReportStatus="U" pDeficiencyRemarks="" />
  <IMMUNIZATION pChildImmcode="C05" pYoungwImmcode="" pPregwImmcode="" pElderlyImmcode="" pOtherImm="" pReportStatus="U" pDeficiencyRemarks="" />
</IMMUNIZATIONS>

<!-- When NO immunizations exist (Statutory Fallback 999): -->
<IMMUNIZATIONS>
  <IMMUNIZATION pChildImmcode="" pYoungwImmcode="" pPregwImmcode="" pElderlyImmcode="" pOtherImm="999" pReportStatus="U" pDeficiencyRemarks="" />
</IMMUNIZATIONS>
```

### 2.7 API Controller Contracts (`ImmunizationsController.cs`)
Located at `Route: api/v1/patients/{patientId}/immunizations`:

- `GET /api/v1/patients/{patientId}/immunizations`
  - **Permissions**: `immunizations:read`
  - **Response 200**: `ApiResponse<List<PatientImmunizationDto>>`
- `POST /api/v1/patients/{patientId}/immunizations`
  - **Permissions**: `immunizations:manage`
  - **Body**: `AdministerVaccineCommand`
  - **Response 201**: `ApiResponse<Guid>` (Immunization Record ID)
  - **Response 400**: Expired batch, missing lot, invalid route
- `POST /api/v1/patients/{patientId}/immunizations/historical`
  - **Permissions**: `immunizations:manage`
  - **Body**: `RecordHistoricalImmunizationCommand`
  - **Response 201**: `ApiResponse<Guid>`
- `POST /api/v1/patients/{patientId}/immunizations/{id}/aefi`
  - **Permissions**: `immunizations:manage`
  - **Body**: `RecordImmunizationAefiCommand`
  - **Response 200**: `ApiResponse<Unit>` (Updated adverse event status)
- `GET /api/v1/catalogs/immunizations?library={library}&search={query}`
  - **Permissions**: `immunizations:read`
  - **Response 200**: `ApiResponse<List<PhilHealthCatalogItemDto>>` (From `lib_immchild`, `lib_immyoungw`, etc.)

### 2.8 Point-of-Care Mobile UI, Barcode Scanning & Safety Guards
Located in `apps/clinic-app/components/immunization/`:
- **`VaccineAdminModal.tsx`**: Point-of-care dialog for administering vaccines.
- **Robust GS1 2D DataMatrix Parser (`gs1BarcodeParser.ts`)**: Supports both human-readable strings and raw GS1 Element Strings with ASCII 29 (`\x1d`) FNC1 delimiters:
  - AI `(01)`: 14-character GTIN (fixed length)
  - AI `(17)`: 6-character Expiration Date `YYMMDD` (fixed length)
  - AI `(10)`: Batch/Lot Number (variable length, up to 20 chars, terminated by `\x1d` or bitstream end)
  - Correctly converts `YYMMDD` (e.g. `261231`) to ISO Date `2026-12-31`.
- **Expiration Safety Gate**: Evaluates `expirationDate < TodayLocal`. If expired, renders an emergency red banner: *"VACCINE BATCH EXPIRED. ADMINISTRATION PROHIBITED."* and disables the confirm button.
- **`HistoricalImmunizationModal.tsx`**: Streamlined dialog for logging prior childhood or adult vaccinations for baseline profile entry.
- **`AefiRecorderModal.tsx`**: Captures Adverse Events Following Immunization with onset time, severity, manifestations (anaphylaxis, fever, seizures), and emergency epinephrine administration notes.

---

## 4. Section 3: R3. Structured Problem List, Allergies & PhilHealth Chronic Care (NCD)

### 3.1 Longitudinal Problem List & ICD-10 Lifecycle Engine
Replaces flat strings with a structured, queryable registry of patient problems with full ICD-10 validation.

#### Domain Model: `PatientProblem.cs`
Located in `services/clinic-api/ClinicEz.Clinic.Domain/Entities/PatientProblem.cs`:
```csharp
namespace ClinicEz.Clinic.Domain.Entities;

using ClinicEz.Clinic.Domain.Common;

public enum ProblemStatus
{
    Active = 1,
    Resolved = 2,
    Inactive = 3,
    Relapsed = 4
}

public enum ProblemSeverity
{
    Mild = 1,
    Moderate = 2,
    Severe = 3
}

public sealed class PatientProblem : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid PatientId { get; set; }
    public Guid? ConsultationEncounterId { get; set; }

    public required string Icd10Code { get; set; } // e.g. "I10", "E11.9"
    public required string ProblemTitle { get; set; }

    /// <summary>Direct link to PhilHealth lib_mdiseases code for 1:1 Yakap MEDHIST generation.</summary>
    public string? PhilHealthMdiseaseCode { get; set; }

    public ProblemStatus Status { get; set; } = ProblemStatus.Active;
    public ProblemSeverity Severity { get; set; } = ProblemSeverity.Moderate;
    public bool IsChronicNcd { get; set; } = false;

    public DateOnly? OnsetDate { get; set; }
    public DateOnly? ResolvedDate { get; set; }
    public string? ClinicalNotes { get; set; }

    public Guid RecordedByDoctorId { get; set; }
    public required string RecordedByDoctorName { get; set; }
}
```

### 3.2 Structured Patient Allergies & CDS Integration
Replaces flat text strings (`ClinicPatient.Allergies`) with structured classifications.

#### Domain Model: `PatientAllergy.cs`
```csharp
namespace ClinicEz.Clinic.Domain.Entities;

using ClinicEz.Clinic.Domain.Common;

public enum AllergyCategory
{
    Medication = 1,
    Food = 2,
    Environmental = 3,
    Biologic = 4,
    Other = 5
}

public enum AllergySeverity
{
    Mild = 1,
    Moderate = 2,
    Severe = 3,
    LifeThreatening = 4 // Anaphylaxis
}

public enum AllergyStatus
{
    Active = 1,
    Inactive = 2,
    Refuted = 3
}

public sealed class PatientAllergy : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid PatientId { get; set; }

    public AllergyCategory Category { get; set; }
    public required string Allergen { get; set; } // e.g., "Amoxicillin", "Penicillin G", "Peanuts"
    
    /// <summary>PNF generic code or RxNorm concept code for medication cross-reactivity screening.</summary>
    public string? AllergenDrugCode { get; set; }

    public AllergySeverity Severity { get; set; } = AllergySeverity.Moderate;
    public string? ReactionManifestation { get; set; } // e.g., "Angioedema, Bronchospasm, Urticaria"
    public bool IsAnaphylactic { get; set; } = false;

    public AllergyStatus Status { get; set; } = AllergyStatus.Active;
    public DateOnly? OnsetDate { get; set; }
}
```

#### Refactored CDS Evaluator (`ClinicalDecisionSupportEvaluator.cs`):
Implements case-insensitive matching, explicit cross-reactivity matrices, anaphylaxis hard stops, and Drug-Disease Interaction (DDI) rules:

```csharp
public sealed record CdsAlert(
    CdsAlertLevel Level,
    string Category, // "Allergy", "CrossReactivity", "DrugDisease"
    string Message,
    bool IsHardStop,
    bool RequiresOverrideReason
);

public static class ClinicalDecisionSupportEvaluator
{
    // Pharmacological cross-reactivity ontology
    private static readonly Dictionary<string, HashSet<string>> DrugClasses = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Penicillins"] = new(StringComparer.OrdinalIgnoreCase) {
            "Penicillin", "Penicillin G", "Penicillin V", "Ampicillin", "Amoxicillin", "Co-amoxiclav",
            "Oxacillin", "Cloxacillin", "Piperacillin", "Piperacillin-Tazobactam", "Ampicillin-Sulbactam"
        },
        ["Cephalosporins_1st_Gen"] = new(StringComparer.OrdinalIgnoreCase) {
            "Cephalexin", "Cefazolin", "Cephradine"
        },
        ["Cephalosporins_2nd_Gen"] = new(StringComparer.OrdinalIgnoreCase) {
            "Cefuroxime", "Cefaclor", "Cefoxitin"
        },
        ["Sulfonamides"] = new(StringComparer.OrdinalIgnoreCase) {
            "Sulfamethoxazole", "Cotrimoxazole", "Sulfadiazine"
        },
        ["NSAIDs"] = new(StringComparer.OrdinalIgnoreCase) {
            "Ibuprofen", "Naproxen", "Mefenamic Acid", "Ketorolac", "Aspirin", "Diclofenac", "Celecoxib", "Meloxicam"
        },
        ["BetaBlockers_NonSelective"] = new(StringComparer.OrdinalIgnoreCase) {
            "Propranolol", "Carvedilol", "Nadolol", "Sotalol", "Timolol"
        }
    };

    public static List<CdsAlert> EvaluateMedicationSafety(
        IEnumerable<PrescriptionCandidate> candidates,
        IEnumerable<PatientAllergy> allergies,
        IEnumerable<PatientProblem> problems)
    {
        var alerts = new List<CdsAlert>();
        
        // 1. Filter active allergies (case-insensitive enum alignment)
        var activeDrugAllergies = allergies
            .Where(a => a.Category == AllergyCategory.Medication && a.Status == AllergyStatus.Active)
            .ToList();

        // 2. Filter active problems for DDI evaluation
        var activeProblems = problems
            .Where(p => p.Status == ProblemStatus.Active || p.Status == ProblemStatus.Relapsed)
            .ToList();

        foreach (var drug in candidates)
        {
            var drugName = drug.GenericName.Trim();

            // A. Allergy & Cross-Reactivity Evaluation
            foreach (var allergy in activeDrugAllergies)
            {
                var allergen = allergy.Allergen.Trim();
                bool isDirectMatch = string.Equals(drugName, allergen, StringComparison.OrdinalIgnoreCase);
                bool isCrossReactive = CheckCrossReactivity(drugName, allergen);

                if (isDirectMatch || isCrossReactive)
                {
                    bool isCritical = allergy.IsAnaphylactic || 
                                      allergy.Severity == AllergySeverity.LifeThreatening;

                    alerts.Add(new CdsAlert(
                        Level: isCritical ? CdsAlertLevel.Critical : CdsAlertLevel.Warning,
                        Category: isDirectMatch ? "Allergy" : "CrossReactivity",
                        Message: isDirectMatch
                            ? $"Patient has documented {allergy.Severity} allergy to {allergen} ({allergy.ReactionManifestation}). Prescribing {drugName} is contraindicated."
                            : $"Potential cross-reactivity: Patient is allergic to {allergen}. {drugName} shares pharmacological beta-lactam core/class homology.",
                        IsHardStop: isCritical, // HARD STOP: Cannot be bypassed without physician override justification or blocked entirely if Anaphylaxis
                        RequiresOverrideReason: !isCritical
                    ));
                }
            }

            // B. Drug-Disease Interaction (DDI) Evaluation
            foreach (var prob in activeProblems)
            {
                var icd = prob.Icd10Code.ToUpperInvariant();

                // DDI Rule 1: NSAIDs in Active Peptic Ulcer (K25-K28) or CKD (N18)
                if (IsDrugInClass(drugName, "NSAIDs"))
                {
                    if (icd.StartsWith("K25") || icd.StartsWith("K26") || icd.StartsWith("K27") || icd.StartsWith("K28"))
                    {
                        alerts.Add(new CdsAlert(
                            Level: CdsAlertLevel.Critical,
                            Category: "DrugDisease",
                            Message: $"DDI CONTRAINDICATION: Prescribing NSAID '{drugName}' in active Peptic Ulcer Disease ({prob.Icd10Code}) significantly elevates GI bleeding risk.",
                            IsHardStop: true,
                            RequiresOverrideReason: false
                        ));
                    }
                    if (icd.StartsWith("N18"))
                    {
                        alerts.Add(new CdsAlert(
                            Level: CdsAlertLevel.Critical,
                            Category: "DrugDisease",
                            Message: $"DDI WARNING: Prescribing NSAID '{drugName}' in Chronic Kidney Disease ({prob.Icd10Code}) accelerates renal function decline.",
                            IsHardStop: false,
                            RequiresOverrideReason: true
                        ));
                    }
                }

                // DDI Rule 2: Non-selective beta-blockers in Active Asthma (J45) or COPD (J44)
                if (IsDrugInClass(drugName, "BetaBlockers_NonSelective"))
                {
                    if (icd.StartsWith("J45") || icd.StartsWith("J44"))
                    {
                        alerts.Add(new CdsAlert(
                            Level: CdsAlertLevel.Critical,
                            Category: "DrugDisease",
                            Message: $"DDI CONTRAINDICATION: Non-selective beta-blocker '{drugName}' prescribed for patient with active reactive airway disease ({prob.Icd10Code} - {prob.ProblemTitle}). Risk of severe bronchospasm.",
                            IsHardStop: true,
                            RequiresOverrideReason: false
                        ));
                    }
                }
            }
        }

        return alerts;
    }

    private static bool CheckCrossReactivity(string drugName, string allergen)
    {
        // Penicillin <-> 1st/2nd Gen Cephalosporin cross-reactivity (~3-5% clinical risk)
        bool allergenIsPenicillin = IsDrugInClass(allergen, "Penicillins");
        bool drugIsCeph1 = IsDrugInClass(drugName, "Cephalosporins_1st_Gen");
        bool drugIsCeph2 = IsDrugInClass(drugName, "Cephalosporins_2nd_Gen");
        bool drugIsPenicillin = IsDrugInClass(drugName, "Penicillins");

        if (allergenIsPenicillin && (drugIsCeph1 || drugIsCeph2)) return true;
        if (allergenIsPenicillin && drugIsPenicillin) return true;

        return false;
    }

    private static bool IsDrugInClass(string drugName, string className)
    {
        return DrugClasses.TryGetValue(className, out var list) && 
               list.Any(item => drugName.Contains(item, StringComparison.OrdinalIgnoreCase));
    }
}
```

### 3.3 PhilPEN 24-Question NCD Framework & Relational Modeling
Migrates the 24 questions from `lib_ncdq` out of `CustomFields` JSON into a first-class relational entity.

#### Domain Model: `NcdRiskAssessment.cs`
```csharp
namespace ClinicEz.Clinic.Domain.Entities;

using ClinicEz.Clinic.Domain.Common;

public sealed class NcdRiskAssessment : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid PatientId { get; set; }
    public Guid? ConsultationEncounterId { get; set; }

    public DateTime AssessmentDateUtc { get; set; } = DateTime.UtcNow;
    public Guid AssessedByStaffId { get; set; }
    public required string AssessedByStaffName { get; set; }

    // PhilPEN Behavioral & Nutrition Questions (Q1 - Q4)
    public bool EatsProcessedFoodWeekly { get; set; } // Q1
    public bool ThreeServingsVegetablesDaily { get; set; } // Q2
    public bool TwoToThreeServingsFruitDaily { get; set; } // Q3
    public bool PhysicalActivityAtLeast150MinsWeekly { get; set; } // Q4

    // Diabetes Screening (Q5 - Q8, Q18 - Q19)
    /// <summary>
    /// PhilHealth DTD tri-state Q5 (pQid5_Ynx): "Y" (Yes), "N" (No), "X" (Not Applicable / Unassessed for pediatric or unassessed visits).
    /// </summary>
    public string DiagnosedDiabetes { get; set; } = "N"; // Q5
    public bool HasPolyphagia { get; set; } // Q6
    public bool HasPolydipsia { get; set; } // Q7
    public bool HasPolyuria { get; set; } // Q8
    public string? DiabetesMedicationStatus { get; set; } // Q18: "Y" with med, "N" without
    public bool HasRaisedBloodGlucose { get; set; } // Q19_Yn
    public decimal? FastingBloodSugarMgDl { get; set; } // Q19_Fbsmg
    public decimal? FastingBloodSugarMmolL { get; set; } // Q19_Fbsmmol
    public DateOnly? FastingBloodSugarDate { get; set; } // Q19_Fbsdate

    // Cardiovascular Screening (Q9 - Q16, Q20, Q23 - Q24)
    public bool HasChestPain { get; set; } // Q9
    public bool PainInCenterOfChestOrLeftArm { get; set; } // Q10
    public bool PainWhenWalkingUphill { get; set; } // Q11
    public bool SlowsDownWhenPainOccurs { get; set; } // Q12
    public bool PainRelievedWithin10MinsOrNitrates { get; set; } // Q13 & Q14
    public bool SevereChestPainOver30Mins { get; set; } // Q15
    public bool TransientNeurologicalDeficits { get; set; } // Q16
    public bool HasRaisedBloodLipids { get; set; } // Q20_Yn
    public decimal? TotalCholesterolMgDl { get; set; } // Q20_Choleval
    public DateOnly? TotalCholesterolDate { get; set; } // Q20_Choledate
    public bool HasHistoryAnginaHeartAttack { get; set; } // Q23
    public bool HasHistoryStrokeOrTia { get; set; } // Q24

    // Urinalysis Biomarkers (Q21 - Q22)
    public bool UrineKetonesPresent { get; set; } // Q21_Yn
    public string? UrineKetonesValue { get; set; } // Q21_Ketonval
    public DateOnly? UrineKetonesDate { get; set; }
    public bool UrineProteinPresent { get; set; } // Q22_Yn
    public string? UrineProteinValue { get; set; } // Q22_Proteinval
    public DateOnly? UrineProteinDate { get; set; }

    // WHO/ISH Cardiovascular Risk Stratification (Q17)
    /// <summary>Risk category letter: A = <10%, B = 10-<20%, C = 20-<30%, D = 30-<40%, E = >=40%.</summary>
    public required string RiskLevelLetter { get; set; } = "A";
    public decimal? CalculatedRiskScorePercent { get; set; }
}
```

### 3.4 Longitudinal Biomarker Tracking & WHO/ISH Cardiovascular Risk Scoring
The calculation engine `IPhilPenRiskScorer` computes the 10-year risk of fatal or non-fatal cardiovascular events based on WHO/ISH Western Pacific Region B (WPR B) risk charts:

1. Age & Gender
2. Current Smoking Status (`Q1` / Social History)
3. Systolic Blood Pressure (from recent triage vitals)
4. Total Blood Cholesterol (`Q20_Choleval` from laboratory results)
5. Pre-existing Diabetes (`Q5 == "Y"`)

#### Non-Laboratory Fallback Protocol (Using BMI, not FBS):
In rural primary care facilities where blood cholesterol testing is unavailable, the WHO/ISH guidelines mandate using the **Non-Laboratory Chart**, which substitutes **Body Mass Index (BMI)** for Total Blood Cholesterol. Blood glucose (FBS) cannot be substituted for cholesterol in cardiovascular risk charts.
- When `TotalCholesterolMgDl == null`: The scoring engine automatically branches to the WHO/ISH BMI-based risk matrix using `vitals.Bmi`.

#### Mandatory Clinical Safety Overrides:
To prevent dangerous under-stratification in young or extreme clinical presentations:
1. **Hypertensive Crisis Clinical Override**:
   If $SystolicBP \ge 180\text{ mmHg}$ OR $DiastolicBP \ge 110\text{ mmHg}$:
   The engine automatically forces **Band E ($\ge 40\%$, Critical Risk / Hypertensive Crisis Referral)** regardless of age, smoking, or cholesterol status. Emits `pQid17_Abcde="E"`.
2. **Stage 2 Severe Hypertension Override**:
   If $SystolicBP \ge 160\text{ mmHg}$ OR $DiastolicBP \ge 100\text{ mmHg}$:
   The engine forces a minimum of **Band C ($20\text{--}<30\%$, High Risk)**, prompting immediate antihypertensive initiation.

#### Classification Bands (Mappable to `pQid17_Abcde`):
- **Band A (<10%)**: Low Risk (Green). Annual re-screening and lifestyle reinforcement.
- **Band B (10% to <20%)**: Moderate Risk (Yellow). Dietary counseling and 6-month follow-up.
- **Band C (20% to <30%)**: High Risk (Orange). Pharmacological intervention (Statin + Antihypertensive).
- **Band D (30% to <40%)**: Very High Risk (Red). Intensive specialty referral.
- **Band E (>=40%)**: Critical Risk / Hypertensive Crisis (Dark Red). Immediate hospitalization or emergent cardiovascular stabilization.

### 3.5 EF Core Persistence & Database Schema
Configurations in `ClinicEz.Clinic.Infrastructure/Persistence/Configurations/`:
- Multi-tenant query filters for all three entities (`PatientProblem`, `PatientAllergy`, `NcdRiskAssessment`) are configured centrally in `ApplicationDbContext.OnModelCreating`:
  ```csharp
  modelBuilder.Entity<PatientProblem>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
  modelBuilder.Entity<PatientAllergy>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
  modelBuilder.Entity<NcdRiskAssessment>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
  ```
- All enums (`ProblemStatus`, `ProblemSeverity`, `AllergyCategory`, `AllergySeverity`, `AllergyStatus`) are persisted as strings (`varchar(50)`) via `ApplicationDbContext.ConfigureConventions` (`HaveConversion<string>()`).

### 3.6 API Controller Contracts

#### `PatientProblemsController.cs` (`Route: api/v1/patients/{patientId}/problems`)
- `GET /api/v1/patients/{patientId}/problems`
  - **Permissions**: `clinical:problems:read`
  - **Response 200**: `ApiResponse<List<PatientProblemDto>>`
- `POST /api/v1/patients/{patientId}/problems`
  - **Permissions**: `clinical:problems:manage`
  - **Body**: `CreateProblemCommand` (`Icd10Code`, `ProblemTitle`, `Status`, `Severity`, `OnsetDate`)
  - **Response 201**: `ApiResponse<Guid>`
- `PATCH /api/v1/patients/{patientId}/problems/{id}/status`
  - **Permissions**: `clinical:problems:manage`
  - **Body**: `UpdateProblemStatusCommand` (`Status`, `ResolvedDate`, `Notes`)
  - **Response 200**: `ApiResponse<Unit>`

#### `PatientAllergiesController.cs` (`Route: api/v1/patients/{patientId}/allergies`)
- `GET /api/v1/patients/{patientId}/allergies`
  - **Permissions**: `clinical:problems:read`
  - **Response 200**: `ApiResponse<List<PatientAllergyDto>>`
- `POST /api/v1/patients/{patientId}/allergies`
  - **Permissions**: `clinical:problems:manage`
  - **Body**: `CreateAllergyCommand` (`Category`, `Allergen`, `Severity`, `ReactionManifestation`, `IsAnaphylactic`)
  - **Response 201**: `ApiResponse<Guid>`
- `DELETE /api/v1/patients/{patientId}/allergies/{id}`
  - **Permissions**: `clinical:problems:manage`
  - **Response 200**: `ApiResponse<Unit>` (Soft deletion)

#### `NcdAssessmentsController.cs` (`Route: api/v1/patients/{patientId}/ncd-assessments`)
- `GET /api/v1/patients/{patientId}/ncd-assessments`
  - **Permissions**: `clinical:ncd:read`
  - **Response 200**: `ApiResponse<List<NcdRiskAssessmentDto>>`
- `POST /api/v1/patients/{patientId}/ncd-assessments`
  - **Permissions**: `clinical:ncd:manage`
  - **Body**: `RecordNcdAssessmentCommand` (PhilPEN Q1 - Q24 inputs)
  - **Response 201**: `ApiResponse<NcdRiskAssessmentDto>` (Includes computed RiskLevelLetter and score)

#### `CatalogSearchController.cs` (ICD-10 Search & Performance Guard)
- `GET /api/v1/catalogs/icd10?search={query}&limit={50}`
  - **Permissions**: Authenticated user
  - **Implementation**: Queries database PostgreSQL full-text search index on `lib_icd` table rather than loading 1.25 MB JSON into mobile RAM.
  - **Client debounce**: 300ms debounce in mobile search box.

### 3.7 React Native Expo UI & SVG Trend Visualizations
Located in `apps/clinic-app/components/chronic/`:
- **`ProblemListManager.tsx`**: Searchable modal connecting to debounced server catalog endpoint with active/resolved filter tabs and PhilHealth disease category badge.
- **`AllergyManagerModal.tsx`**: Structured drug/food allergy entry with anaphylaxis toggle and severity radio group.
- **`NcdTrendChart.tsx` (Segmented Sub-Charts & Metric Switcher)**:
  To prevent squashing metrics of drastically different units (BP: 60-200 mmHg, FBS: 70-300 mg/dL, HbA1c: 4-14%), the component features a segmented tab switcher:
  - Tab 1: **Blood Pressure (mmHg)**: Independent y-axis [50 to 220 mmHg], dual curves for Systolic and Diastolic, shaded normal target band (< 130/80 mmHg).
  - Tab 2: **Fasting Blood Sugar (mg/dL)**: Independent y-axis [60 to 300 mg/dL], shaded normal band (< 100 mg/dL) and pre-diabetes band (100-125 mg/dL).
  - Tab 3: **HbA1c (%)**: Dedicated zoomed y-axis [4.0% to 14.0%], shaded ADA/PhilHealth target band (< 7.0%).
  - Responsive layout: On workstation viewports (`isWorkstation == true`), displays all 3 metric cards stacked or side-by-side; on mobile viewports, uses swipeable segmented control tabs.
- **`NcdRiskAssessmentCard.tsx`**: 24-question wizard presenting questions grouped into Nutrition, Diabetes, Cardiovascular, and Urinalysis, with real-time risk level badge calculation.

---

## 5. Section 4: R4. Clinical SOAP Templates, Physical Exam Checklists & WHO Pediatric Growth Charts

### 4.1 Clinical SOAP Templating Engine & Specialty Presets
Physicians seeing high patient volumes require specialty-specific clinical templates that pre-fill clinical documentation prompts while preserving structured coding for claims transmittal.

#### Domain Model: `ClinicalSoapTemplate.cs`
Located in `services/clinic-api/ClinicEz.Clinic.Domain/Entities/ClinicalSoapTemplate.cs`:
```csharp
namespace ClinicEz.Clinic.Domain.Entities;

using ClinicEz.Clinic.Domain.Common;

public sealed class ClinicalSoapTemplate : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid? DoctorId { get; set; } // Null if shared across clinic

    public required string Title { get; set; } // "Pediatric Well-Child", "Hypertension Follow-Up"
    public string Specialty { get; set; } = "GeneralPractice"; // Pediatrics, OBGYN, Cardiology, NCD

    public string? SubjectivePrompt { get; set; }
    public string? ObjectivePrompt { get; set; }
    public string? AssessmentPrompt { get; set; }
    public string? PlanPrompt { get; set; }

    /// <summary>JSON array of default physical exam organ system selections mapped to PhilHealth catalog IDs.</summary>
    public string PhysicalExamChecklistJson { get; set; } = "[]";

    public bool IsDefault { get; set; } = false;
    public bool IsSystemStandard { get; set; } = false;
}
```

#### Specialty Presets Seeded:
1. **General Adult Acute Visit**: Standard acute chief complaint, vitals review, system review.
2. **Pediatric Well-Child Examination**: Feeding history (exclusive breastfeeding vs formula), developmental milestones, immunization review, physical exam.
3. **Chronic NCD Follow-Up (Hypertension / Diabetes)**: Home BP readings, hypoglycemic events, medication compliance, diet/exercise compliance, foot examination.
4. **OB-GYN Prenatal Examination**: Gravida, Para, Full-term, Pre-term, Abortion, Living children (GPAL), Age of Gestation (AOG), Fundic Height, Fetal Heart Tone (FHT).
5. **Acute Upper Respiratory Infection**: Onset, fever curve, cough character, auscultation findings, danger signs.

### 4.2 Clinical Macros ("Dot-Phrases") Engine
A fast text expansion engine implemented in both frontend and backend:

#### Domain Model: `ClinicalMacro.cs`
```csharp
namespace ClinicEz.Clinic.Domain.Entities;

using ClinicEz.Clinic.Domain.Common;

public sealed class ClinicalMacro : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid? DoctorId { get; set; } // Null if shared clinic-wide

    public required string TriggerKey { get; set; } // e.g. ".normPE", ".dietDM", ".warnSigns"
    public required string ReplacementText { get; set; }
    public string? Description { get; set; }
}
```

#### Frontend Macro Expansion:
In `ClinicalMacrosInput.tsx`, when a clinician types a dot-phrase followed by space or tab, the shortcut instantly replaces with the expansion string:
- `.normPE` -> *"Essentially normal physical examination. Anicteric sclerae, pink conjunctivae, clear breath sounds, normal S1/S2 without murmurs, soft non-tender abdomen, full pulses, capillary refill < 2 seconds, no edema."*
- `.dietDM` -> *"Low sodium (<2g/day), low glycemic index diet, portion control, 30 mins moderate aerobic exercise daily, adequate hydration (>2L/day)."*
- `.warnSigns` -> *"Advised patient to seek immediate emergency care if experiencing chest tightness, difficulty breathing, persistent fever > 38.5C, altered sensorium, or severe abdominal pain."*

### 4.3 Modular Physical Exam Checklist & 1-Click Normal Organ Mapping
PhilHealth requires reporting on 9 physical examination systems. The modular checklist allows clinicians to review organ systems with a 1-click **"All Essentially Normal"** button that automatically maps 1:1 to PhilHealth organ tags in `<PROFILE>` and `<SOAP>`:

| Organ System | PhilHealth XML Element | Normal Catalog Code | Statutory Library | Abnormal Options |
|---|---|---|---|---|
| General Survey | `<PE_GENSURVEY>` | `1` (Awake, alert, normal) | Schema Enum | Altered sensorium (`2`), In acute distress (`3`) |
| HEENT | `<PE_HEENT>` | `1` (Essentially normal) | `lib_heent` | Anicteric sclerae, Pale conjunctivae, Lymphadenopathy |
| Chest / Lungs | `<PE_CHEST>` | `1` (Essentially normal) | `lib_chest` | Wheezes, Crackles/Rales, Rhonchi, Decreased breath sounds |
| Heart / CVS | `<PE_HEART>` | `1` (Essentially normal) | `lib_heart` | Murmurs, Tachycardia, Irregular rhythm, Heaves/Thrills |
| Abdomen | `<PE_ABDOMEN>` | `1` (Essentially normal) | `lib_abdomen` | Tenderness, Guarding, Hepatomegaly, Palpable mass |
| Genitourinary | `<PE_GU>` | `1` (Essentially normal) | `lib_genitourinary` | Discharge, Lesions, Tenderness (or Not Examined) |
| Digital Rectal | `<PE_RECTAL>` | `1` (Essentially normal) | `lib_digital_rectal` | Hemorrhoids, Prostatomegaly, Blood on glove (or Not Examined) |
| Skin / Extremities | `<PE_SKIN>` | `1` (Essentially normal) | `lib_skin_extremities` | Cyanosis, Pallor, Jaundice, Pitting edema, Clubbing |
| Neurological | `<PE_NEURO>` | `1` (Essentially normal) | `lib_neuro` | Focal deficit, Motor weakness, Sensory loss, Tremors |

### 4.4 WHO Pediatric Growth Standards & LMS Z-Score Calculator

#### Domain Model: `PediatricGrowthMeasurement.cs`
Located in `services/clinic-api/ClinicEz.Clinic.Domain/Entities/PediatricGrowthMeasurement.cs`:
```csharp
namespace ClinicEz.Clinic.Domain.Entities;

using ClinicEz.Clinic.Domain.Common;

public sealed class PediatricGrowthMeasurement : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid PatientId { get; set; }
    public Guid? ConsultationEncounterId { get; set; }

    public DateOnly MeasurementDate { get; set; }
    public int AgeInMonths { get; set; }
    public string Sex { get; set; } = "Male"; // "Male", "Female"

    public decimal WeightKg { get; set; }
    public decimal LengthHeightCm { get; set; }

    /// <summary>
    /// Indicates whether measurement was taken recumbent (lying down).
    /// WHO protocol: <24m should be recumbent; >=24m should be standing.
    /// Used to apply WHO 0.7 cm posture adjustment.
    /// </summary>
    public bool IsMeasuredRecumbent { get; set; } = false;

    public decimal? HeadCircumferenceCm { get; set; }
    public decimal? MidUpperArmCircumferenceCm { get; set; }

    // Calculated WHO LMS Metrics
    public decimal WeightForAgeZScore { get; set; }
    public decimal HeightForAgeZScore { get; set; }
    public decimal WeightForHeightZScore { get; set; }
    public decimal BmiForAgeZScore { get; set; }
    public decimal? HeadCircumferenceZScore { get; set; }

    public int WeightForAgePercentile { get; set; }
    public int HeightForAgePercentile { get; set; }
    public int BmiForAgePercentile { get; set; }

    /// <summary>
    /// PhilHealth lib_zscore statutory classification string.
    /// Nullable for children >= 60 months (5-19 years) who are evaluated via WHO 2007 reference outside the Under-5 statutory catalog.
    /// </summary>
    public string? PhilHealthZScoreCategory { get; set; } // Normal, Moderately Wasted, Severely Wasted, Overweight, Obese
    public string? PhilHealthZScoreCode { get; set; } // e.g. "boys-0-23/042"
}
```

#### WHO Anthropometric Engine Implementation (`WhoGrowthCalculator.cs`):
Implements the Box-Cox LMS formula with extreme value adjustments, posture correction, and non-positive input guard rails:

```csharp
public static class WhoGrowthCalculator
{
    /// <summary>
    /// Computes standard Box-Cox LMS Z-Score with guard rails against non-positive inputs.
    /// </summary>
    public static decimal CalculateLmsZScore(decimal observedX, decimal L, decimal M, decimal S)
    {
        if (observedX <= 0m || M <= 0m || S <= 0m)
        {
            throw new ArgumentException("Observed value, median (M), and generalized CV (S) must be strictly positive.");
        }

        double x = (double)observedX;
        double l = (double)L;
        double m = (double)M;
        double s = (double)S;

        double z;
        if (Math.Abs(l) < 0.0001)
        {
            z = Math.Log(x / m) / s;
        }
        else
        {
            z = (Math.Pow(x / m, l) - 1.0) / (l * s);
        }

        // WHO Standard adjustment for extreme values (|Z| > 3)
        if (Math.Abs(z) > 3.0)
        {
            double sd3Pos = m * Math.Pow(1.0 + l * s * 3.0, 1.0 / l);
            double sd3Neg = m * Math.Pow(1.0 - l * s * 3.0, 1.0 / l);
            double sd23Diff = sd3Pos - m * Math.Pow(1.0 + l * s * 2.0, 1.0 / l);

            if (z > 3.0)
                z = 3.0 + (x - sd3Pos) / sd23Diff;
            else if (z < -3.0)
                z = -3.0 + (x - sd3Neg) / (m * Math.Pow(1.0 - l * s * 2.0, 1.0 / l) - sd3Neg);
        }

        return Math.Round((decimal)z, 2);
    }

    /// <summary>
    /// Applies WHO 0.7 cm posture adjustment at the 24-month boundary:
    /// - 0-23 months: Standard is recumbent length. If measured standing, ADD 0.7 cm.
    /// - 24-60 months: Standard is standing height. If measured recumbent, SUBTRACT 0.7 cm.
    /// </summary>
    public static decimal AdjustMeasurementPosture(decimal rawCm, int ageInMonths, bool isMeasuredRecumbent)
    {
        if (rawCm <= 0m) throw new ArgumentException("Measurement must be greater than zero.");

        if (ageInMonths < 24 && !isMeasuredRecumbent)
        {
            return rawCm + 0.7m; // Convert standing height to recumbent length
        }
        if (ageInMonths >= 24 && isMeasuredRecumbent)
        {
            return rawCm - 0.7m; // Convert recumbent length to standing height
        }
        return rawCm;
    }
}
```

#### Statutory Cross-Reference & `lib_zscore.json` Ingestion Engine:
The statutory lookup service resolves PhilHealth claims transmittal categories from `lib_zscore.json` with defensive sanitization and discrete range-bracket evaluation:

1. **Defensive Catalog Ingestion Sanitization**:
   - `lib_zscore.json` item 1381 (`boys-0-23/0285`) contains an upstream statutory typo `"7..9"`. The ingestion pipeline sanitizes all attribute weight strings prior to decimal parsing:
     ```csharp
     var cleanWeightStr = rawWeightStr.Replace("..", ".");
     decimal weight = decimal.Parse(cleanWeightStr, CultureInfo.InvariantCulture);
     ```
2. **Attribute Schema Bifurcation Handling**:
   - Items for cohort `0-23` use attribute key `"length"`, while items for cohort `24-60` use attribute key `"height"`. The lookup accessor unifies these keys:
     ```csharp
     var dimStr = item.Attributes.TryGetValue("length", out var l) 
         ? l 
         : item.Attributes.GetValueOrDefault("height");
     ```
3. **Nearest 0.5 cm Range-Bracket Resolution**:
   Because real-world anthropometrics are continuous while `lib_zscore.json` provides discrete 0.5 cm increments with 8 boundary weight points, exact string queries fail. The service executes a two-stage bracket lookup:
   - **Stage 1 (Dimension Snapping)**: Round adjusted length/height to the nearest 0.5 cm increment:
     `roundedDim = Math.Round(adjustedCm * 2, MidpointRounding.AwayFromZero) / 2;`
     Clamped to table bounds ([45.0, 110.0] for 0-23m; [65.0, 120.0] for 24-60m).
   - **Stage 2 (Boundary Bracket Evaluation)**: Retrieve the 8 statutory boundary records for `(Sex, Cohort, roundedDim)` sorted ascending by weight, and map patient weight $W$ to statutory standard deviations:
     - $W < W_{-3SD} \to$ `< -3SD` (`Severely Wasted`)
     - $W == W_{-3SD} \to$ `-3SD` (`Moderately Wasted`)
     - $W_{-3SD} < W < W_{-2SD} \to$ `< -2SD` (`Moderately Wasted`)
     - $W_{-2SD} \le W \le W_{+2SD} \to$ `-2SD` to `+2SD` (`Normal`)
     - $W_{+2SD} < W < W_{+3SD} \to$ `> +2SD` (`Overweight`)
     - $W == W_{+3SD} \to$ `+3SD` (`Overweight`)
     - $W > W_{+3SD} \to$ `> +3SD` (`Obese`)
4. **Age Cohort Clarification**:
   - **Under-5 Cohort (0 to 60 months)**: Evaluated using WHO 2006 Standards and `lib_zscore.json` statutory lookup.
   - **School-Age / Adolescent Cohort (61 to 228 months / 5 to 19 years)**: Evaluated using WHO 2007 Growth Reference for BMI-for-age and Height-for-age. `PhilHealthZScoreCategory` is stored as `null` since PhilHealth's `lib_zscore` Under-5 table does not cover this cohort.

### 4.5 Bi-directional Yakap XML Mapper Alignment & Transmittal Pipeline Orchestration

#### 1:1 Physical Exam Pertinent Mapping (`YakapClinicalMapper.cs`):
```csharp
private static YakapPhysicalExamPertinentDto MapPhysicalExam(
    TriageVitals? vitals,
    PediatricGrowthMeasurement? pedia)
{
    return new YakapPhysicalExamPertinentDto(
        Systolic: vitals?.SystolicBp?.ToString() ?? "",
        Diastolic: vitals?.DiastolicBp?.ToString() ?? "",
        Hr: vitals?.HeartRateBpm?.ToString() ?? "",
        Rr: vitals?.RespiratoryRateBreathsPerMin?.ToString() ?? "",
        Temp: vitals?.TemperatureCelsius?.ToString("F1") ?? "",
        Height: (pedia?.LengthHeightCm ?? vitals?.HeightCm)?.ToString("F1") ?? "",
        Weight: (pedia?.WeightKg ?? vitals?.WeightKg)?.ToString("F1") ?? "",
        BMI: vitals?.Bmi?.ToString("F1") ?? "",
        ZScore: pedia?.PhilHealthZScoreCategory ?? "", // Maps statutory lib_zscore category
        LeftVision: "",
        RightVision: "",
        Length: pedia?.LengthHeightCm.ToString("F1") ?? "",
        HeadCirc: pedia?.HeadCircumferenceCm?.ToString("F1") ?? "",
        SkinfoldThickness: "",
        Waist: vitals?.WaistCircumferenceCm?.ToString("F1") ?? "",
        Hip: vitals?.HipCircumferenceCm?.ToString("F1") ?? "",
        Limbs: "",
        MidUpperArmCirc: pedia?.MidUpperArmCircumferenceCm?.ToString("F1") ?? "",
        ReportStatus: "U",
        DeficiencyRemarks: ""
    );
}
```

Generated XML in `<SOAP>` and `<PROFILE>`:
```xml
<PEPERT 
  pSystolic="120" pDiastolic="80" pHr="78" pRr="18" pTemp="36.6" 
  pHeight="85.5" pWeight="11.8" pBMI="16.1" pZScore="Normal" 
  pLeftVision="" pRightVision="" pLength="85.5" pHeadCirc="47.2" 
  pSkinfoldThickness="" pWaist="" pHip="" pLimbs="" pMidUpperArmCirc="15.0" 
  pReportStatus="U" pDeficiencyRemarks="" />
```

#### Transmittal Pipeline Orchestration in `CreateYakapTransmittalCommandHandler.cs`:
To connect all new relational domain entities to claims transmittal generation, `IYakapClinicalMapper` and `CreateYakapTransmittalCommandHandler` are updated to inject and query the 5 domain repositories:

1. **Updated `IYakapClinicalMapper` Interface**:
```csharp
public interface IYakapClinicalMapper
{
    YakapReportDocumentDto MapToYakapReportDocument(
        string reportTagging,
        string effectiveYear,
        ClinicSettings settings,
        IReadOnlyList<ConsultationEncounter> encounters,
        IReadOnlyDictionary<Guid, ClinicPatient> patients,
        IReadOnlyDictionary<Guid, TriageVitals> vitalsMap,
        string transmittalNumber,
        IReadOnlyDictionary<Guid, YakapNcdAnswersDto>? ncdMap = null,
        IReadOnlyDictionary<Guid, List<ClinicLabOrder>>? labOrdersMap = null,
        IReadOnlyDictionary<string, decimal>? feeScheduleMap = null,
        IReadOnlyDictionary<Guid, List<PatientImmunization>>? immunizationsMap = null,
        IReadOnlyDictionary<Guid, List<PatientProblem>>? problemsMap = null,
        IReadOnlyDictionary<Guid, List<PatientAllergy>>? allergiesMap = null,
        IReadOnlyDictionary<Guid, NcdRiskAssessment>? ncdAssessmentsMap = null,
        IReadOnlyDictionary<Guid, PediatricGrowthMeasurement>? growthMap = null);
}
```

2. **Repository Batch Querying in `CreateYakapTransmittalCommandHandler.cs`**:
```csharp
// Inject 5 new repositories in constructor:
// IRepository<PatientImmunization> immunizationRepo,
// IRepository<PatientProblem> problemRepo,
// IRepository<PatientAllergy> allergyRepo,
// IRepository<NcdRiskAssessment> ncdRepo,
// IRepository<PediatricGrowthMeasurement> growthRepo

var patientIds = encounters.Select(e => e.PatientId).Distinct().ToList();

// Batch query all clinical domains for batch patients:
var immunizations = await _immunizationRepo.Query(i => patientIds.Contains(i.PatientId) && !i.IsDeleted)
    .ToListAsync(cancellationToken);
var immunizationsMap = immunizations.GroupBy(i => i.PatientId)
    .ToDictionary(g => g.Key, g => g.ToList());

var problems = await _problemRepo.Query(p => patientIds.Contains(p.PatientId) && !p.IsDeleted)
    .ToListAsync(cancellationToken);
var problemsMap = problems.GroupBy(p => p.PatientId)
    .ToDictionary(g => g.Key, g => g.ToList());

var allergies = await _allergyRepo.Query(a => patientIds.Contains(a.PatientId) && !a.IsDeleted)
    .ToListAsync(cancellationToken);
var allergiesMap = allergies.GroupBy(a => a.PatientId)
    .ToDictionary(g => g.Key, g => g.ToList());

var ncdAssessments = await _ncdRepo.Query(n => patientIds.Contains(n.PatientId) && !n.IsDeleted)
    .OrderByDescending(n => n.AssessmentDateUtc)
    .ToListAsync(cancellationToken);
var ncdAssessmentsMap = ncdAssessments.GroupBy(n => n.PatientId)
    .ToDictionary(g => g.Key, g => g.First());

var growthRecords = await _growthRepo.Query(g => patientIds.Contains(g.PatientId) && !g.IsDeleted)
    .OrderByDescending(g => g.MeasurementDate)
    .ToListAsync(cancellationToken);
var growthMap = growthRecords.GroupBy(g => g.PatientId)
    .ToDictionary(g => g.Key, g => g.First());

// Pass structured dictionaries into MapToYakapReportDocument
```

### 4.6 API Controller Contracts

#### `SoapTemplatesController.cs` (`Route: api/v1/clinical/soap-templates`)
- `GET /api/v1/clinical/soap-templates`
  - **Permissions**: `clinical:templates:read`
  - **Response 200**: `ApiResponse<List<ClinicalSoapTemplateDto>>` (Includes clinic-wide and doctor-specific templates)
- `POST /api/v1/clinical/soap-templates`
  - **Permissions**: `clinical:templates:manage`
  - **Body**: `UpsertSoapTemplateCommand` (`Title`, `Specialty`, `Prompts`, `PhysicalExamChecklistJson`)
  - **Response 201**: `ApiResponse<Guid>`
- `GET /api/v1/clinical/macros`
  - **Permissions**: `clinical:templates:read`
  - **Response 200**: `ApiResponse<List<ClinicalMacroDto>>`
- `POST /api/v1/clinical/macros`
  - **Permissions**: `clinical:templates:manage`
  - **Body**: `UpsertClinicalMacroCommand` (`TriggerKey`, `ReplacementText`, `Description`)
  - **Response 201**: `ApiResponse<Guid>`

#### `PediatricGrowthController.cs` (`Route: api/v1/patients/{patientId}/growth`)
- `GET /api/v1/patients/{patientId}/growth`
  - **Permissions**: `clinical:growth:read`
  - **Response 200**: `ApiResponse<List<PediatricGrowthMeasurementDto>>`
- `POST /api/v1/patients/{patientId}/growth`
  - **Permissions**: `clinical:growth:manage`
  - **Body**: `RecordGrowthMeasurementCommand` (`MeasurementDate`, `AgeInMonths`, `WeightKg`, `LengthHeightCm`, `IsMeasuredRecumbent`, `HeadCircumferenceCm`)
  - **Response 201**: `ApiResponse<PediatricGrowthMeasurementDto>` (Returns computed LMS z-scores and PhilHealth category)

### 4.7 React Native Expo UI & SVG Growth Curve Visualizer
Located in `apps/clinic-app/components/growth/`:
- **`WhoGrowthChartVisualizer.tsx`**: Interactive multi-tab visualizer supporting:
  1. Weight-for-Age (0 to 60 months)
  2. Length/Height-for-Age (0 to 60 months)
  3. Weight-for-Length/Height (0 to 24 months)
  4. BMI-for-Age (2 to 19 years, bundling WHO 2006 for Under-5 and WHO 2007 for 5-19y)
  5. Head Circumference-for-Age (0 to 60 months)
  - Workstation responsive modal container: `maxWidth={isWorkstation ? 960 : 540}`.
- **`SvgPercentileCurves.tsx`**: Renders smoothed bezier percentile curves using `react-native-svg`:
  - `+3 SD` (99.7th percentile, Red dashed)
  - `+2 SD` (97.7th percentile, Orange)
  - `Median` (50th percentile, Teal solid)
  - `-2 SD` (2.3rd percentile, Orange)
  - `-3 SD` (0.13th percentile, Red dashed)
- **`SvgPatientDataPlot.tsx`**: Renders patient visit measurements plotted as interactive touch dots displaying date, age, exact metric, and z-score on tap.

---

## 6. Section 5: Cross-Cutting Architectural Patterns

### 6.1 Multi-Tenancy & Schema Isolation
Clinic EZ enforces strict tenant isolation:
1. **PostgreSQL Schema Isolation**: Each tenant executes within their assigned database schema (e.g., `clinic_metrohealth`).
2. **Central Multi-Tenant Global Query Filters in EF Core**:
   To strictly prevent accidental cross-tenant data leaks, all entities possessing a `ClinicId` have their multi-tenant query filter defined centrally in `ApplicationDbContext.OnModelCreating`:
   ```csharp
   modelBuilder.Entity<TEntity>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
   ```
   Individual `IEntityTypeConfiguration<T>` classes must **not** register `builder.HasQueryFilter(e => !e.IsDeleted)`, because EF Core treats `HasQueryFilter` calls as overrides, which would erase the `ClinicId == CurrentClinicId` tenant barrier.
3. **Cross-Tenant Prevention**:
   Controllers resolve `IClinicContext` from authenticated JWT claims (`TenantId`, `ClinicId`, `StaffId`). Handlers reject requests if target entities belong to a different `ClinicId`.

### 6.2 Security, RBAC & Permissions Matrix
All new endpoints are protected with explicit permissions in `ClinicPermissions.cs`:

| Permission Constant | String Value | Assigned Roles | Guarded Operations |
|---|---|---|---|
| `SchedulesRead` | `schedules:read` | Doctor, Nurse, Receptionist, Admin | View doctor rosters, shifts, and slot availability |
| `SchedulesManage` | `schedules:manage` | Doctor (own), Clinic Admin | Create shift templates, breaks, leaves, overrides |
| `ImmunizationsRead` | `immunizations:read` | Doctor, Nurse, Receptionist | View patient vaccination history & AEFI reports |
| `ImmunizationsManage`| `immunizations:manage`| Doctor, Nurse | Administer vaccines, record batch/lot, log AEFI |
| `ClinicalProblemsManage`| `clinical:problems:manage` | Doctor | Add, update, resolve patient problems and allergies |
| `NcdAssessmentsManage`| `clinical:ncd:manage` | Doctor, Nurse | Complete PhilPEN 24 assessment, compute risk |
| `SoapTemplatesManage`| `clinical:templates:manage` | Doctor, Clinic Admin | Author and edit SOAP templates and clinical macros |
| `PediatricGrowthManage`| `clinical:growth:manage` | Doctor, Nurse | Record child anthropometrics, compute WHO z-scores |

### 6.3 Transactional Outbox Pattern & Interop Hub Envelopes
Cross-service updates (e.g., vaccine administration sync with `patient-api`) strictly avoid direct synchronous HTTP calls.
1. The originating command writes the business entity and an `InteropOutboxMessage` record within the same relational database transaction.
2. An asynchronous background relay worker polls `InteropOutboxMessages`, signs the `InteropEnvelope` (using strongly typed `Party.ForFacility(tenantId, clinicId, FacilityType.Clinic)`), and posts it to `interop-hub`.
3. The subscriber service (`patient-api`) pulls from its mailbox, records idempotency in `InteropInboxMessages`, and applies changes locally.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                       TRANSACTIONAL OUTBOX & INTEROP HUB WORKFLOW                           │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
  AdministerVaccineCommand
    │
    ├─► INSERT INTO "PatientImmunizations" (...)
    └─► INSERT INTO "InteropOutboxMessages" (Type: "clinical.immunization.administered", ...)
    │
  [COMMIT TRANSACTION]
    │
    ▼ (Async Relay Worker)
  POST /v1/messages ──► [interop-hub] ──► Mailbox: "local:patient"
                                                │
                                                ▼ (Inbox Pull Worker)
                                         [patient-api]
                                         ├─ Verify Idempotency (MessageId)
                                         ├─ INSERT INTO "VaccinationAdministered"
                                         └─ ACK /v1/inbox/ack
```

### 6.4 Audit Logging & Soft Deletion Lifecycle
- All clinical entities inherit from `BaseEntity`:
  - `CreatedAt`, `CreatedBy`, `UpdatedAt`, `UpdatedBy` are automatically populated in `ApplicationDbContext.SaveChangesAsync`.
  - `IsDeleted`, `DeletedAt`, `DeletedBy` manage soft deletion.
  - Hard deletion is blocked by default unless `entity.AllowHardDelete = true` is explicitly passed by administrative purge routines.

---

## 7. Section 6: Frontend Architecture & State Management (`apps/clinic-app`)

### 7.1 Dual Layout Paradigm & Responsive Breakpoint Enforcement
Clinic EZ supports both mobile handhelds (triage nurses, bed-side doctors) and desktop workstations:
- **Responsive Breakpoint Alignment (`useBreakpoint.ts`)**:
  - Tablet Breakpoint ($\ge 768\text{px}$, `theme.breakpoints.tablet`): Activates Workstation Mode (`isWorkstation = true`).
  - Desktop Breakpoint ($\ge 1024\text{px}$, `theme.breakpoints.desktop`): Activates multi-column workstation layouts.
- **Workstation Layout**: Bottom navigation tab bar is hidden. Left sidebar (`WorkstationSidebar.tsx`, using `theme.sizes.sidebarWidth = 260px` fixed width) provides persistent navigation, active physician switcher, and keyboard navigation shortcuts (`Alt+1` to `Alt+9`).
- **Dense Modal Container Sizing**: Standard modals cap width at 540px. Data-heavy clinical views (`DoctorRosterCalendarModal.tsx`, `WhoGrowthChartVisualizer.tsx`, `ProblemListManager.tsx`) explicitly specify `maxWidth={isWorkstation ? 960 : 540}` to render broad calendars and multi-curve SVG charts comfortably without cramped horizontal clipping.
- **Mobile Layout**: Ergonomic bottom tab bar (`MobileBottomTabBar.tsx`) with 5 core tabs; secondary modals slide from the bottom.

### 7.2 Design Token & Theme Enforcement
All components adhere strictly to the repository's design system tokens defined in `constants/tokens.ts` and `constants/theme.ts`, enforced via `bun run lint:tokens`:
- **Colors**:
  - `theme.colors.primary`, `theme.colors.surface`, `theme.colors.border`
  - `theme.colors.text` (slate[900], primary body/header text)
  - `theme.colors.textSecondary` (slate[600], secondary subtitles)
  - `theme.colors.textMuted` (slate[500], captions and placeholders)
  - Zero usage of non-existent tokens (e.g., `textPrimary`).
- **Typography Variants**:
  - `<ThemedText variant="display">`, `variant="h1"`, `variant="h2"`, `variant="title"`, `variant="h3"`, `variant="bodyLarge"`, `variant="body"`, `variant="small"`, `variant="caption"`, `variant="badge"`, `variant="code"`.
  - Zero usage of non-existent variants (e.g., `titleLarge`, `bodyMedium`, `labelSmall`).
- **Spacing Scale (Exact 8-Step Grid from `tokens.ts`)**:
  - `xs: 4`, `sm: 8`, `md: 12`, `lg: 16`, `xl: 20`, `'2xl': 24`, `'3xl': 32`, `'4xl': 40`.
- **Sizes**:
  - `theme.sizes.sidebarWidth = 260`, `theme.sizes.sidebarCollapsedWidth = 72`.

### 7.3 Offline Outbox Synchronization & Idempotency
When mobile clinic workers operate in rural areas with intermittent connectivity:
- The offline queue (`offlineSyncService.ts`) traps failed requests with status 0, 503, or 504.
- Every queued record receives an immutable `Idempotency-Key` header (`Crypto.randomUUID()`).
- `OfflineSyncRunner.tsx` monitors network connectivity via NetInfo and automatically drains pending outbox items when connectivity restores.

### 7.4 Frontend Component Manifest & File Organization

```
apps/clinic-app/
├── components/
│   ├── roster/
│   │   ├── DoctorRosterCalendarModal.tsx       # Doctor weekly roster (maxWidth: isWorkstation ? 960 : 540)
│   │   ├── SlotPicker.tsx                      # Visual slot selection grid with 30s auto-refresh
│   │   ├── DateStripScroller.tsx               # 14-day horizontal date strip
│   │   ├── WorkingHoursTemplateEditor.tsx      # Weekly shift editor panel (with IsOvernightShift toggle)
│   │   ├── DoctorLeaveModal.tsx                # Vacation/CME blackout date recorder
│   │   └── DoubleBookingConflictAlert.tsx      # 409 Conflict collision warning banner
│   │
│   ├── immunization/
│   │   ├── VaccineAdminModal.tsx               # Point-of-care vaccine administration modal
│   │   ├── HistoricalImmunizationModal.tsx     # Historical vaccine entry for baseline PhilHealth profile
│   │   ├── VaccineCatalogPicker.tsx            # Filtered dropdown for lib_imm* statutory catalogs
│   │   ├── VaccineLotExpiryPicker.tsx          # Batch/Lot input with barcode camera scanning
│   │   ├── AnatomicalSitePicker.tsx            # Anatomical site selector (Deltoid, Thigh)
│   │   ├── AefiRecorderModal.tsx               # Retroactive adverse event reporting modal
│   │   └── PatientImmunizationCard.tsx         # Longitudinal vaccine card for patient chart
│   │
│   ├── chronic/
│   │   ├── ProblemListManager.tsx              # Active/resolved problem list manager (maxWidth 960)
│   │   ├── ProblemFormModal.tsx                # Debounced ICD-10 search & problem authoring dialog
│   │   ├── AllergyManagerModal.tsx             # Structured allergy dialog with anaphylaxis flag
│   │   ├── AllergyBadgeList.tsx                # Color-coded allergy chips
│   │   ├── NcdTrendChart.tsx                   # Segmented SVG curves (BP mmHg, FBS mg/dL, HbA1c %)
│   │   └── NcdRiskAssessmentCard.tsx           # PhilPEN 24 wizard & cardiovascular risk card
│   │
│   ├── consultation/
│   │   ├── SoapTemplateSelector.tsx            # Specialty SOAP template selector
│   │   ├── PhysicalExamChecklist.tsx           # 1-click "All Normal" 9-organ checklist
│   │   └── ClinicalMacrosInput.tsx             # Dot-phrase expanding text input
│   │
│   └── growth/
│       ├── WhoGrowthChartVisualizer.tsx        # Multi-tab pediatric growth container (maxWidth 960)
│       ├── SvgGrowthChart.tsx                  # Core SVG canvas for curves and data points
│       ├── SvgPercentileCurves.tsx             # Bezier curves for -3SD, -2SD, Median, +2SD, +3SD
│       └── GrowthInterpretationCard.tsx        # Nutritional classification banner
│
├── constants/
│   ├── soapTemplates.ts                        # Pre-configured clinical note templates
│   ├── clinicalMacros.ts                       # Standard clinical macros dictionary
│   └── whoGrowthLmsData.ts                     # Bundled WHO LMS tables (Boys/Girls 0-60m & 61-228m)
│
├── utils/
│   ├── useDoctorAvailability.ts                # Real-time slot availability hook with 30s polling
│   ├── useWhoGrowthCalculator.ts               # LMS Z-score & percentile calculation hook
│   ├── usePhilPenRiskCalculator.ts             # Cardiovascular risk score calculation hook
│   ├── gs1BarcodeParser.ts                     # Robust GS1 2D DataMatrix FNC1 parser
│   └── vaccineExpiryValidator.ts               # Local timezone-aware vaccine expiry validator
│
└── tests/
    ├── doctorAvailability.test.ts              # Slot generation & conflict prevention tests
    ├── whoGrowthCalculator.test.ts             # LMS formula, lib_zscore matching, and 0.7cm posture tests
    ├── philPenRiskScore.test.ts                # WHO/ISH BMI fallback & hypertensive crisis override tests
    └── vaccineExpiryValidator.test.ts          # Vaccine expiration guard unit tests
```

---

## 8. Section 7: Phased Implementation Roadmap, Migrations & Dependency Graph

### 7.1 Implementation Milestones (M1 to M5)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                            PHASED IMPLEMENTATION ROADMAP (M1 - M5)                          │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
  Phase 1: Milestone M1 (R1) ── Doctor Rostering & Slot Availability Engine
  ├── Domain Entities: DoctorScheduleTemplate, DoctorBreakTime, DoctorLeave, DoctorScheduleOverride
  ├── Application CQRS: UpsertDoctorScheduleTemplate, GetDoctorAvailableSlots, CreateDoctorLeave
  ├── Concurrency Guard: Appointment.EndTimeUtc, Postgres GiST exclusion index, optimistic versioning
  └── Expo UI: SlotPicker, DoctorRosterCalendarModal, useDoctorAvailability hook
  
  Phase 2: Milestone M2 (R2) ── PhilHealth Immunization Management & Interop Sync
  ├── Domain Entity: PatientImmunization with batch/lot, expiry, dose sequence, site, AEFI
  ├── Statutory Fallback 999: YakapClinicalMapper 1:1 mapping generating valid <IMMUNIZATION+> XML
  ├── Interop Hub: clinical.immunization.administered transactional outbox & patient-api sync
  └── Expo UI: VaccineAdminModal with 2D barcode camera scanner and expired lot safety gate
  
  Phase 3: Milestone M3 (R3) ── Structured Problem List, Allergies & NCD Care
  ├── Domain Entities: PatientProblem (ICD-10 lib_icd), PatientAllergy, NcdRiskAssessment
  ├── CDS Integration: Refactored ClinicalDecisionSupportEvaluator checking structured allergies
  ├── Longitudinal Analytics: PhilPEN 24 questions, WHO/ISH cardiovascular risk scoring (A-E)
  └── Expo UI: ProblemListManager, AllergyManagerModal, NcdTrendChart (SVG curves)
  
  Phase 4: Milestone M4 (R4) ── Clinical SOAP Templates & WHO Pediatric Growth Charts
  ├── Domain Entities: ClinicalSoapTemplate, ClinicalMacro, PediatricGrowthMeasurement
  ├── Growth Engine: WHO LMS Box-Cox formulas & lib_zscore.json statutory lookup service
  ├── Bi-directional Mapping: YakapClinicalMapper 100% loss-free export to <SOAP> and <PROFILE>
  └── Expo UI: SoapTemplateSelector, 1-click PhysicalExamChecklist, WhoGrowthChartVisualizer
  
  Phase 5: Milestone M5 (R5) ── Master Integration, E2E Verification & Forensic Attestation
  ├── E2E Claims Transmittal: KonsultaXmlGenerator pre-flight validation against KonsultaData_v1.14.dtd
  ├── Regression Testing: Zero breaking changes to existing patient, triage, billing, Gamot flows
  └── Compliance Attestation: Independent verification by teamwork_preview_auditor
```

### 7.2 Dependency Graph
```
   [M1: Doctor Scheduling] ──────────────┐
                                         │
   [M2: Immunizations & 999] ────────────┼──► [M5: Master Integration & DTD Validation]
                                         │
   [M3: Problems, Allergies, NCD] ───────┤
                     │                   │
                     ▼                   │
   [M4: SOAP Templates & Growth Charts] ──┘
```
*Note: M4 depends on M3 because pediatric growth metrics and physical exam findings integrate into encounter consultation records established alongside structured problems.*

### 7.3 Database Migration Sequencing & SQL DDL Scripts

#### Migration 1: `20261010_01_AddDoctorSchedulingSuite.cs`
```sql
CREATE TABLE "DoctorScheduleTemplates" (
    "Id" uuid NOT NULL PRIMARY KEY,
    "TenantId" varchar(100) NOT NULL,
    "ClinicId" uuid NOT NULL,
    "BranchId" uuid NULL,
    "DoctorId" uuid NOT NULL,
    "DoctorName" varchar(150) NOT NULL,
    "DayOfWeek" varchar(50) NOT NULL, -- Stored as string name per ApplicationDbContext convention
    "StartTime" time NOT NULL,
    "EndTime" time NOT NULL,
    "IsOvernightShift" boolean NOT NULL DEFAULT false,
    "SlotIntervalMinutes" integer NOT NULL DEFAULT 30,
    "MaxPatientsPerSlot" integer NOT NULL DEFAULT 1,
    "IsActive" boolean NOT NULL DEFAULT true,
    "EffectiveStartDate" date NOT NULL,
    "EffectiveEndDate" date NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "CreatedBy" varchar(100) NOT NULL,
    "UpdatedAt" timestamp with time zone NULL,
    "UpdatedBy" varchar(100) NULL,
    "IsDeleted" boolean NOT NULL DEFAULT false,
    "DeletedAt" timestamp with time zone NULL,
    "DeletedBy" varchar(100) NULL
);

CREATE TABLE "DoctorBreakTimes" (
    "Id" uuid NOT NULL PRIMARY KEY,
    "DoctorScheduleTemplateId" uuid NOT NULL REFERENCES "DoctorScheduleTemplates"("Id") ON DELETE CASCADE,
    "Description" varchar(100) NOT NULL,
    "StartTime" time NOT NULL,
    "EndTime" time NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "CreatedBy" varchar(100) NOT NULL,
    "UpdatedAt" timestamp with time zone NULL,
    "UpdatedBy" varchar(100) NULL,
    "IsDeleted" boolean NOT NULL DEFAULT false,
    "DeletedAt" timestamp with time zone NULL,
    "DeletedBy" varchar(100) NULL
);

CREATE TABLE "DoctorLeaves" (
    "Id" uuid NOT NULL PRIMARY KEY,
    "TenantId" varchar(100) NOT NULL,
    "ClinicId" uuid NOT NULL,
    "DoctorId" uuid NULL,
    "DoctorName" varchar(150) NOT NULL,
    "LeaveType" varchar(50) NOT NULL, -- Stored as string name (e.g. 'Vacation', 'SickLeave')
    "StartDate" date NOT NULL,
    "EndDate" date NOT NULL,
    "PartialDayStartTime" time NULL,
    "PartialDayEndTime" time NULL,
    "Reason" text NULL,
    "IsApproved" boolean NOT NULL DEFAULT true,
    "ApprovedByStaffId" varchar(100) NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "CreatedBy" varchar(100) NOT NULL,
    "UpdatedAt" timestamp with time zone NULL,
    "UpdatedBy" varchar(100) NULL,
    "IsDeleted" boolean NOT NULL DEFAULT false,
    "DeletedAt" timestamp with time zone NULL,
    "DeletedBy" varchar(100) NULL
);

CREATE TABLE "DoctorScheduleOverrides" (
    "Id" uuid NOT NULL PRIMARY KEY,
    "TenantId" varchar(100) NOT NULL,
    "ClinicId" uuid NOT NULL,
    "DoctorId" uuid NOT NULL,
    "DoctorName" varchar(150) NOT NULL,
    "OverrideDate" date NOT NULL,
    "StartTime" time NOT NULL,
    "EndTime" time NOT NULL,
    "IsOvernightShift" boolean NOT NULL DEFAULT false,
    "SlotIntervalMinutes" integer NOT NULL DEFAULT 30,
    "IsCancelled" boolean NOT NULL DEFAULT false,
    "Reason" text NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "CreatedBy" varchar(100) NOT NULL,
    "UpdatedAt" timestamp with time zone NULL,
    "UpdatedBy" varchar(100) NULL,
    "IsDeleted" boolean NOT NULL DEFAULT false,
    "DeletedAt" timestamp with time zone NULL,
    "DeletedBy" varchar(100) NULL
);

-- Safe backfill of EndTimeUtc on existing Appointments to prevent schedule corruption:
ALTER TABLE "Appointments" ADD COLUMN "EndTimeUtc" timestamp with time zone NULL;
UPDATE "Appointments" 
SET "EndTimeUtc" = "ScheduledAt" + ("DurationMinutes" || ' minutes')::interval;
ALTER TABLE "Appointments" ALTER COLUMN "EndTimeUtc" SET NOT NULL;
ALTER TABLE "Appointments" ADD COLUMN "Version" xmin;

-- Indexes for lookups
CREATE INDEX "IX_DoctorScheduleTemplates_Lookup" ON "DoctorScheduleTemplates" ("ClinicId", "DoctorId", "DayOfWeek", "IsActive");
CREATE INDEX "IX_DoctorLeaves_Range" ON "DoctorLeaves" ("ClinicId", "DoctorId", "StartDate", "EndDate");
CREATE INDEX "IX_DoctorScheduleOverrides_Date" ON "DoctorScheduleOverrides" ("ClinicId", "DoctorId", "OverrideDate");

-- Physical PostgreSQL GiST Exclusion Constraint enforcing zero overlapping appointments:
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Appointments" ADD CONSTRAINT "UQ_Doctor_No_Overlapping_Appointments"
EXCLUDE USING gist (
    "ClinicId" WITH =,
    "DoctorId" WITH =,
    tstzrange("ScheduledAt", "EndTimeUtc", '[)') WITH &&
)
WHERE ("Status" != 'Cancelled');
```

#### Migration 2: `20261010_02_AddPatientImmunizationsSuite.cs`
```sql
CREATE TABLE "PatientImmunizations" (
    "Id" uuid NOT NULL PRIMARY KEY,
    "TenantId" varchar(100) NOT NULL,
    "ClinicId" uuid NOT NULL,
    "BranchId" uuid NULL,
    "PatientId" uuid NOT NULL,
    "PatientName" varchar(150) NOT NULL,
    "ConsultationEncounterId" uuid NULL,
    "PhilHealthLibrary" varchar(50) NOT NULL,
    "PhilHealthCode" varchar(20) NOT NULL,
    "VaccineName" varchar(150) NOT NULL,
    "BrandName" varchar(100) NULL,
    "Manufacturer" varchar(100) NULL,
    "LotBatchNumber" varchar(100) NOT NULL,
    "ExpirationDate" date NOT NULL,
    "DoseSequence" integer NOT NULL DEFAULT 1,
    "IsSeriesCompleted" boolean NOT NULL DEFAULT false,
    "Route" varchar(50) NOT NULL,
    "InjectionSite" varchar(100) NOT NULL,
    "AdministeredAtUtc" timestamp with time zone NOT NULL,
    "AdministeredByStaffId" uuid NOT NULL,
    "AdministeredByStaffName" varchar(150) NOT NULL,
    "AdministeredByPrcLicense" varchar(50) NULL,
    "HasAdverseReaction" boolean NOT NULL DEFAULT false,
    "AdverseReactionSeverity" varchar(50) NOT NULL DEFAULT 'None',
    "AdverseReactionRemarks" text NULL,
    "AdverseReactionRecordedAtUtc" timestamp with time zone NULL,
    "IsSynchronizedToPatientApp" boolean NOT NULL DEFAULT false,
    "SynchronizedAtUtc" timestamp with time zone NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "CreatedBy" varchar(100) NOT NULL,
    "UpdatedAt" timestamp with time zone NULL,
    "UpdatedBy" varchar(100) NULL,
    "IsDeleted" boolean NOT NULL DEFAULT false,
    "DeletedAt" timestamp with time zone NULL,
    "DeletedBy" varchar(100) NULL
);

CREATE INDEX "IX_PatientImmunizations_Patient" ON "PatientImmunizations" ("ClinicId", "PatientId");
CREATE INDEX "IX_PatientImmunizations_LotExpiry" ON "PatientImmunizations" ("LotBatchNumber", "ExpirationDate");
CREATE INDEX "IX_PatientImmunizations_Date" ON "PatientImmunizations" ("ClinicId", "AdministeredAtUtc");
```

#### Migration 3: `20261010_03_AddStructuredProblemsAndNcdSuite.cs`
```sql
CREATE TABLE "PatientProblems" (
    "Id" uuid NOT NULL PRIMARY KEY,
    "TenantId" varchar(100) NOT NULL,
    "ClinicId" uuid NOT NULL,
    "PatientId" uuid NOT NULL,
    "ConsultationEncounterId" uuid NULL,
    "Icd10Code" varchar(20) NOT NULL,
    "ProblemTitle" varchar(255) NOT NULL,
    "PhilHealthMdiseaseCode" varchar(20) NULL,
    "Status" varchar(50) NOT NULL DEFAULT 'Active', -- String enum conversion
    "Severity" varchar(50) NOT NULL DEFAULT 'Moderate', -- String enum conversion
    "IsChronicNcd" boolean NOT NULL DEFAULT false,
    "OnsetDate" date NULL,
    "ResolvedDate" date NULL,
    "ClinicalNotes" text NULL,
    "RecordedByDoctorId" uuid NOT NULL,
    "RecordedByDoctorName" varchar(150) NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "CreatedBy" varchar(100) NOT NULL,
    "UpdatedAt" timestamp with time zone NULL,
    "UpdatedBy" varchar(100) NULL,
    "IsDeleted" boolean NOT NULL DEFAULT false,
    "DeletedAt" timestamp with time zone NULL,
    "DeletedBy" varchar(100) NULL
);

CREATE TABLE "PatientAllergies" (
    "Id" uuid NOT NULL PRIMARY KEY,
    "TenantId" varchar(100) NOT NULL,
    "ClinicId" uuid NOT NULL,
    "PatientId" uuid NOT NULL,
    "Category" varchar(50) NOT NULL DEFAULT 'Medication', -- String enum conversion
    "Allergen" varchar(150) NOT NULL,
    "AllergenDrugCode" varchar(50) NULL,
    "Severity" varchar(50) NOT NULL DEFAULT 'Moderate', -- String enum conversion
    "ReactionManifestation" varchar(255) NULL,
    "IsAnaphylactic" boolean NOT NULL DEFAULT false,
    "Status" varchar(50) NOT NULL DEFAULT 'Active', -- String enum conversion ('Active', 'Inactive', 'Refuted')
    "OnsetDate" date NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "CreatedBy" varchar(100) NOT NULL,
    "UpdatedAt" timestamp with time zone NULL,
    "UpdatedBy" varchar(100) NULL,
    "IsDeleted" boolean NOT NULL DEFAULT false,
    "DeletedAt" timestamp with time zone NULL,
    "DeletedBy" varchar(100) NULL
);

CREATE TABLE "NcdRiskAssessments" (
    "Id" uuid NOT NULL PRIMARY KEY,
    "TenantId" varchar(100) NOT NULL,
    "ClinicId" uuid NOT NULL,
    "PatientId" uuid NOT NULL,
    "ConsultationEncounterId" uuid NULL,
    "AssessmentDateUtc" timestamp with time zone NOT NULL,
    "AssessedByStaffId" uuid NOT NULL,
    "AssessedByStaffName" varchar(150) NOT NULL,
    "EatsProcessedFoodWeekly" boolean NOT NULL DEFAULT false,
    "ThreeServingsVegetablesDaily" boolean NOT NULL DEFAULT false,
    "TwoToThreeServingsFruitDaily" boolean NOT NULL DEFAULT false,
    "PhysicalActivityAtLeast150MinsWeekly" boolean NOT NULL DEFAULT false,
    "DiagnosedDiabetes" varchar(1) NOT NULL DEFAULT 'N', -- PhilHealth DTD tri-state Q5: 'Y', 'N', 'X'
    "HasPolyphagia" boolean NOT NULL DEFAULT false,
    "HasPolydipsia" boolean NOT NULL DEFAULT false,
    "HasPolyuria" boolean NOT NULL DEFAULT false,
    "DiabetesMedicationStatus" varchar(10) NULL,
    "HasRaisedBloodGlucose" boolean NOT NULL DEFAULT false,
    "FastingBloodSugarMgDl" numeric(6,2) NULL,
    "FastingBloodSugarMmolL" numeric(6,2) NULL,
    "FastingBloodSugarDate" date NULL,
    "HasChestPain" boolean NOT NULL DEFAULT false,
    "PainInCenterOfChestOrLeftArm" boolean NOT NULL DEFAULT false,
    "PainWhenWalkingUphill" boolean NOT NULL DEFAULT false,
    "SlowsDownWhenPainOccurs" boolean NOT NULL DEFAULT false,
    "PainRelievedWithin10MinsOrNitrates" boolean NOT NULL DEFAULT false,
    "SevereChestPainOver30Mins" boolean NOT NULL DEFAULT false,
    "TransientNeurologicalDeficits" boolean NOT NULL DEFAULT false,
    "HasRaisedBloodLipids" boolean NOT NULL DEFAULT false,
    "TotalCholesterolMgDl" numeric(6,2) NULL,
    "TotalCholesterolDate" date NULL,
    "HasHistoryAnginaHeartAttack" boolean NOT NULL DEFAULT false,
    "HasHistoryStrokeOrTia" boolean NOT NULL DEFAULT false,
    "UrineKetonesPresent" boolean NOT NULL DEFAULT false,
    "UrineKetonesValue" varchar(50) NULL,
    "UrineKetonesDate" date NULL,
    "UrineProteinPresent" boolean NOT NULL DEFAULT false,
    "UrineProteinValue" varchar(50) NULL,
    "UrineProteinDate" date NULL,
    "RiskLevelLetter" varchar(2) NOT NULL DEFAULT 'A',
    "CalculatedRiskScorePercent" numeric(5,2) NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "CreatedBy" varchar(100) NOT NULL,
    "UpdatedAt" timestamp with time zone NULL,
    "UpdatedBy" varchar(100) NULL,
    "IsDeleted" boolean NOT NULL DEFAULT false,
    "DeletedAt" timestamp with time zone NULL,
    "DeletedBy" varchar(100) NULL
);

CREATE INDEX "IX_PatientProblems_Active" ON "PatientProblems" ("ClinicId", "PatientId", "Status");
CREATE INDEX "IX_PatientAllergies_Patient" ON "PatientAllergies" ("ClinicId", "PatientId");
CREATE INDEX "IX_NcdRiskAssessments_History" ON "NcdRiskAssessments" ("ClinicId", "PatientId", "AssessmentDateUtc");
```

#### Migration 4: `20261010_04_AddSoapTemplatesAndGrowthSuite.cs`
```sql
CREATE TABLE "ClinicalSoapTemplates" (
    "Id" uuid NOT NULL PRIMARY KEY,
    "TenantId" varchar(100) NOT NULL,
    "ClinicId" uuid NOT NULL,
    "DoctorId" uuid NULL,
    "Title" varchar(150) NOT NULL,
    "Specialty" varchar(100) NOT NULL DEFAULT 'GeneralPractice',
    "SubjectivePrompt" text NULL,
    "ObjectivePrompt" text NULL,
    "AssessmentPrompt" text NULL,
    "PlanPrompt" text NULL,
    "PhysicalExamChecklistJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "IsDefault" boolean NOT NULL DEFAULT false,
    "IsSystemStandard" boolean NOT NULL DEFAULT false,
    "CreatedAt" timestamp with time zone NOT NULL,
    "CreatedBy" varchar(100) NOT NULL,
    "UpdatedAt" timestamp with time zone NULL,
    "UpdatedBy" varchar(100) NULL,
    "IsDeleted" boolean NOT NULL DEFAULT false,
    "DeletedAt" timestamp with time zone NULL,
    "DeletedBy" varchar(100) NULL
);

CREATE TABLE "ClinicalMacros" (
    "Id" uuid NOT NULL PRIMARY KEY,
    "TenantId" varchar(100) NOT NULL,
    "ClinicId" uuid NOT NULL,
    "DoctorId" uuid NULL,
    "TriggerKey" varchar(50) NOT NULL,
    "ReplacementText" text NOT NULL,
    "Description" varchar(255) NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "CreatedBy" varchar(100) NOT NULL,
    "UpdatedAt" timestamp with time zone NULL,
    "UpdatedBy" varchar(100) NULL,
    "IsDeleted" boolean NOT NULL DEFAULT false,
    "DeletedAt" timestamp with time zone NULL,
    "DeletedBy" varchar(100) NULL
);

CREATE TABLE "PediatricGrowthMeasurements" (
    "Id" uuid NOT NULL PRIMARY KEY,
    "TenantId" varchar(100) NOT NULL,
    "ClinicId" uuid NOT NULL,
    "PatientId" uuid NOT NULL,
    "ConsultationEncounterId" uuid NULL,
    "MeasurementDate" date NOT NULL,
    "AgeInMonths" integer NOT NULL,
    "Sex" varchar(10) NOT NULL,
    "WeightKg" numeric(5,2) NOT NULL,
    "LengthHeightCm" numeric(5,2) NOT NULL,
    "IsMeasuredRecumbent" boolean NOT NULL DEFAULT false,
    "HeadCircumferenceCm" numeric(5,2) NULL,
    "MidUpperArmCircumferenceCm" numeric(5,2) NULL,
    "WeightForAgeZScore" numeric(5,2) NOT NULL,
    "HeightForAgeZScore" numeric(5,2) NOT NULL,
    "WeightForHeightZScore" numeric(5,2) NOT NULL,
    "BmiForAgeZScore" numeric(5,2) NOT NULL,
    "HeadCircumferenceZScore" numeric(5,2) NULL,
    "WeightForAgePercentile" integer NOT NULL,
    "HeightForAgePercentile" integer NOT NULL,
    "BmiForAgePercentile" integer NOT NULL,
    "PhilHealthZScoreCategory" varchar(50) NULL, -- Nullable for children >= 60 months outside Under-5 catalog
    "PhilHealthZScoreCode" varchar(50) NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "CreatedBy" varchar(100) NOT NULL,
    "UpdatedAt" timestamp with time zone NULL,
    "UpdatedBy" varchar(100) NULL,
    "IsDeleted" boolean NOT NULL DEFAULT false,
    "DeletedAt" timestamp with time zone NULL,
    "DeletedBy" varchar(100) NULL
);

CREATE INDEX "IX_PediatricGrowthMeasurements_Patient" ON "PediatricGrowthMeasurements" ("ClinicId", "PatientId", "MeasurementDate");
CREATE UNIQUE INDEX "IX_ClinicalMacros_Trigger" ON "ClinicalMacros" ("ClinicId", "DoctorId", "TriggerKey") WHERE "IsDeleted" = false;
```

### 7.4 Legacy Data Migration & CustomFields Extraction
A dedicated data migration hosted service (`LegacyCustomFieldsMigrationService.cs`) will run upon deploying Milestone 3:
1. Iterates existing `ClinicPatient` records containing non-null `CustomFields["philhealth_profile"]`.
2. Parses the JSON structure:
   - Migrates `medicalHistories` into `PatientProblems` with `Status = "Active"`.
   - Migrates `ncdAnswers` (Q1 - Q24) into initial `NcdRiskAssessment` records.
   - Splits legacy comma-separated `ClinicPatient.Allergies` into `PatientAllergies` with `Status = AllergyStatus.Active`.
3. Sets `CustomFields["_migrated_to_relational"] = "true"` to ensure idempotency.

---

## 9. Section 8: Quality Assurance, Verification & Compliance Matrix

### 8.1 Test Suites Strategy (Unit, Integration & E2E)

#### 8.1.1 Unit Test Coverage
1. `DoctorAvailabilityCalculatorTests.cs`:
   - Verifies slot generation for 15, 30, and 60-minute intervals.
   - Verifies overnight shifts crossing midnight (22:00 to 06:00), generating contiguous slot series into next calendar day.
   - Verifies timezone conversion: appointments booked at 07:30 AM PST (23:30Z previous day) are correctly recognized in local TargetDate slot availability query.
   - Verifies break times aligned to slot intervals subtract correctly without truncating partial slots.
   - Verifies exclusion of full-day vacation and sick leaves.
   - Verifies double-booking collision detection in `CreateAppointmentCommand` and `RescheduleAppointmentCommand` throws `AppointmentConflictException` / returns `409 Conflict`.
2. `WhoGrowthCalculatorTests.cs`:
   - Verifies Box-Cox LMS calculations match official WHO tables within 0.01 z-score tolerance.
   - Verifies defensive sanitization of `lib_zscore.json` item 1381 (`"7..9"` -> `7.9`).
   - Verifies schema bifurcation handling (`"length"` for 0-23m, `"height"` for 24-60m).
   - Verifies nearest 0.5 cm range-bracket interval search against discrete statutory lookup grids.
   - Verifies statutory classification boundaries: $-3.0$ SD maps to `Moderately Wasted` (not Severely Wasted), $+3.0$ SD maps to `Overweight` (not Obese).
   - Verifies WHO 0.7 cm posture adjustment at 24-month boundary (`IsMeasuredRecumbent = true` adds/subtracts 0.7 cm appropriately).
   - Verifies non-positive anthropometrics ($Weight \le 0$ or $Length \le 0$) throw `ArgumentException` and never propagate `NaN` into decimals.
3. `PhilPenRiskScorerTests.cs`:
   - Validates cardiovascular risk scoring across categories A, B, C, D, and E against official DOH guidelines.
   - Verifies non-laboratory fallback protocol: substitutes BMI for Total Blood Cholesterol when cholesterol is null.
   - Verifies Hypertensive Crisis clinical override: $SBP \ge 180\text{ mmHg}$ or $DBP \ge 110\text{ mmHg}$ automatically forces **Band E ($\ge 40\%$)** regardless of age.
   - Verifies Stage 2 severe hypertension override: $SBP \ge 160\text{ mmHg}$ forces minimum **Band C ($20\text{--}<30\%$)**.
4. `VaccineSafetyValidatorTests.cs`:
   - Asserts expired vaccine lots are rejected with validation failure for point-of-care administration.
   - Asserts `RecordHistoricalImmunizationCommand` accepts historical vaccination records with past expiration dates.
   - Asserts `RecordImmunizationAefiCommand` validates adverse reaction severity and records reaction notes.
   - Validates statutory library mapping (`C01` -> `lib_immchild`, `Y01` -> `lib_immyoungw`, `999` -> `OtherImm`).
5. `ClinicalDecisionSupportEvaluatorTests.cs`:
   - Asserts case-insensitive allergy matching (`Status = "Active"`, `"active"`, or enum `Active`).
   - Asserts critical hard stop alert when patient has anaphylactic allergy (`IsAnaphylactic = true` or `Severity = LifeThreatening`).
   - Asserts cross-reactivity alert for penicillin-allergic patients prescribed 1st/2nd generation cephalosporins.
   - Asserts Drug-Disease Interaction (DDI) contraindication for NSAIDs prescribed to patients with active Peptic Ulcer Disease (`K25`) or CKD (`N18`).
   - Asserts DDI contraindication for non-selective beta-blockers prescribed to patients with active Asthma (`J45`).

#### 8.1.2 Integration Test Coverage
- `PostgresExclusionConstraintTests.cs`: Simulates concurrent HTTP requests attempting to book overlapping doctor slots; asserts that one succeeds and the other receives PostgreSQL exclusion violation `23P01` mapped to HTTP `409 Conflict`.
- `MultiTenantQueryFilterIsolationTests.cs`: Asserts that queries across `DoctorScheduleTemplates`, `PatientImmunizations`, `PatientProblems`, and `NcdRiskAssessments` strictly filter by `ClinicId == CurrentClinicId` and never leak records across tenants.
- `InteropImmunizationSyncTests.cs`: Validates that `AdministerVaccineCommand` commits `PatientImmunization` and enqueues `clinical.immunization.administered` into `InteropOutboxMessages` with typed `Party.ForFacility(..., FacilityType.Clinic)`.
- `PatientApiImmunizationConsumerTests.cs`: Asserts `patient-api` consumes envelope, maintains idempotency, and updates digital passport.
- `YakapTransmittalOrchestrationTests.cs`: Verifies `CreateYakapTransmittalCommandHandler` batch-queries all 5 new clinical repositories and constructs XML transmittal without missing relational data.

### 8.2 PhilHealth DTD v1.14 Pre-flight Validation Test Harness
To guarantee 100% transmittal compliance, an automated test harness in `services/philhealth-proxy/ClinicEz.PhilHealthProxy.Tests/YakapDtdComplianceTests.cs` validates all generated claims XML against `KonsultaData_v1.14.dtd`:

```csharp
[Fact]
public void GenerateKonsultaXml_WithZeroImmunizations_EmitsStatutory999Fallback_PassesDtdValidation()
{
    // Arrange: Patient with no immunization records
    var transmittal = CreateSampleTransmittalWithZeroVaccines();

    // Act: Generate XML via KonsultaXmlGenerator
    var xmlContent = KonsultaXmlGenerator.Generate(transmittal);

    // Assert: Validate against official KonsultaData_v1.14.dtd using XmlReaderSettings
    var settings = new XmlReaderSettings
    {
        DtdProcessing = DtdProcessing.Parse,
        ValidationType = ValidationType.DTD
    };

    var errors = new List<string>();
    settings.ValidationEventHandler += (sender, e) => errors.Add(e.Message);

    using var reader = XmlReader.Create(new StringReader(xmlContent), settings);
    while (reader.Read()) { }

    Assert.Empty(errors);
    Assert.Contains("pOtherImm=\"999\"", xmlContent);
}
```

### 8.3 Verification Checklist & Forensic Integrity Attestation

| Category | Requirement | Validation Method | Target Status |
|---|---|---|---|
| **R1 Scheduling** | Shift templates, break times, blackout leaves, overnight shifts, 15-60m intervals | `DoctorAvailabilityCalculatorTests` | 100% Covered |
| **R1 Concurrency** | Double-booking prevention, PostgreSQL `btree_gist` GiST exclusion constraint (`23P01` -> 409 Conflict) | Integration test simulating simultaneous booking | 409 Conflict Enforced |
| **R2 Immunization**| Batch/lot, expiry, dose sequence, injection site, AEFI tracking, historical entry | Relational schema + `AdministerVaccineCommand` + `RecordHistoricalImmunizationCommand` | 100% Specified |
| **R2 PhilHealth** | `lib_immchild`, `lib_immyoungw`, `lib_immpregw`, `lib_immelderly`, `OtherImm` | Catalog resolution in `YakapClinicalMapper` | 1:1 Mapped |
| **R2 Fallback** | Mandatory `999` ("None / Not Given") fallback guaranteeing `<IMMUNIZATION+>` | DTD v1.14 pre-flight validation harness | Zero DTD Violations |
| **R2 Interop** | `clinical.immunization.administered` event envelope with `FacilityType.Clinic` | Outbox publisher & `patient-api` sync handler | Idempotent Sync |
| **R3 Problems** | Structured `PatientProblem` with active/resolved lifecycle & ICD-10 | `PatientProblemsController` & `lib_icd` resolver | 100% Specified |
| **R3 Allergies** | Structured `PatientAllergy` (drug/food/env), `AllergyStatus` enum, and anaphylaxis hard stop | Refactored `ClinicalDecisionSupportEvaluator` with DDI rules | Zero False Negatives |
| **R3 NCD Care** | Relational `NcdRiskAssessment`, PhilPEN Q1-Q24 (Q5 tri-state), WHO/ISH BMI fallback & crisis override | `IPhilPenRiskScorer` unit tests (Bands A - E) | 100% Specified |
| **R4 SOAP** | Specialty templates (Adult, Pedia, NCD, OB-GYN) & clinical macros | `SoapTemplatesController` & `ClinicalMacrosInput` | 100% Specified |
| **R4 Physical Exam**| 1-click "All Essentially Normal" mapping to 9 PhilHealth organ tags in `YakapPhysicalExamPertinentDto` | `PhysicalExamChecklist` mapping matrix | 100% Loss-Free |
| **R4 Growth Charts**| WHO LMS Box-Cox formulas, `lib_zscore.json` sanitization/bracket lookup, 0.7cm posture correction | `WhoGrowthCalculatorTests` vs WHO standard | < 0.01 SD Tolerance |
| **R4 Visualizer** | Interactive SVG growth curves (-3SD, -2SD, Median, +2SD, +3SD), workstation modal `maxWidth=960` | `apps/clinic-app/components/growth/` manifest | 100% Specified |
| **Yakap Pipeline**| Transmittal orchestration batch-querying 5 relational repositories | `CreateYakapTransmittalCommandHandler` integration test | 100% Orchestrated |
| **Integrity** | Zero source files in `apps/` or `services/` touched during planning | `git status --porcelain` verification | Clean Status |

---

## 10. Conclusion

This Master Architectural Specification provides the complete, authoritative, and production-ready engineering plan to construct Clinic EZ's missing high-impact clinic features. By resolving the gaps in doctor scheduling concurrency, overnight shifts, relational immunization tracking, historical vaccinations, retroactive AEFI logging, structured problem lists, allergy cross-reactivity and DDI decision support, NCD risk scoring with BMI fallback and crisis overrides, clinical SOAP templating, WHO pediatric anthropometrics with posture corrections, and end-to-end Yakap transmittal pipeline orchestration, Clinic EZ establishes an unassailable foundation for Philippine primary care and seamless, rejection-free PhilHealth Konsulta / Yakap claims transmittal.
