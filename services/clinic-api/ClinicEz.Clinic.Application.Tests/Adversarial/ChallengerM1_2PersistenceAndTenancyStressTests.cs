using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Migrations;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Interceptors;
using ClinicEz.Shared.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Challenger 2 Stress Tests for Milestone M1 Iteration 2:
/// EF Core Persistence, Concurrency, and Multi-Tenancy.
/// 
/// Targeted Focus Areas:
/// 1. Multi-tenant isolation on IdempotencyRecord across different ClinicId values:
///    - Strict isolation via Global Query Filter (ClinicId == CurrentClinicId &amp;&amp; !IsDeleted).
///    - Same Idempotency Key across different clinics permitted without scope collision.
///    - Soft-delete conversion and query suppression on IdempotencyRecord.
/// 2. Soft deletion interceptor on DoctorScheduleTemplate:
///    - Interceptor converts physical deletion to soft-delete (IsDeleted = true, DeletedAt, DeletedBy).
///    - Reactivation / Re-insertion of schedule with identical (ClinicId, DoctorId, DayOfWeek) succeeds
///      without unique constraint collision due to partial filtered index ("IsDeleted" = false).
///    - Multiple successive deactivation/reactivation cycles verification.
/// 3. PostgreSQL jsonb operations and GIN index compatibility on Patient.CustomFields:
///    - EF Core model column type configured as "jsonb".
///    - GIN index method configured on Patient.CustomFields in model and squashed InitialCreate migration.
///    - Full JSON round-trip fidelity across complex nested types, Unicode, escaping, and mutations.
/// </summary>
public class ChallengerM1_2PersistenceAndTenancyStressTests
{
    private const string TenantAlpha = "tenant-alpha-001";
    private const string TenantBeta = "tenant-beta-002";
    private static readonly Guid ClinicAlpha = Guid.NewGuid();
    private static readonly Guid ClinicBeta = Guid.NewGuid();

    private static (ApplicationDbContext ContextAlpha, ApplicationDbContext ContextBeta, ApplicationDbContext AdminContext)
        CreateMultiTenantHarness(string dbName, ICurrentUserService? currentUserService = null)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "public") })
            .Build();

        var clinicContextAlpha = Substitute.For<IClinicContext>();
        clinicContextAlpha.ClinicId.Returns(ClinicAlpha);
        clinicContextAlpha.TenantId.Returns(TenantAlpha);

        var clinicContextBeta = Substitute.For<IClinicContext>();
        clinicContextBeta.ClinicId.Returns(ClinicBeta);
        clinicContextBeta.TenantId.Returns(TenantBeta);

        var adminClinicContext = Substitute.For<IClinicContext>();
        adminClinicContext.ClinicId.Returns(Guid.Empty);
        adminClinicContext.TenantId.Returns("admin-tenant");

        var interceptor = new SoftDeleteSaveChangesInterceptor(currentUserService);

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .AddInterceptors(interceptor)
            .Options;

        var contextAlpha = new ApplicationDbContext(options, config, clinicContextAlpha);
        var contextBeta = new ApplicationDbContext(options, config, clinicContextBeta);
        var adminContext = new ApplicationDbContext(options, config, adminClinicContext);

        return (contextAlpha, contextBeta, adminContext);
    }

    #region 1. IdempotencyRecord Multi-Tenant Isolation Tests

    [Fact]
    public void IdempotencyRecord_InheritsClinicScopedEntity_AndHasTenantAndClinicProperties()
    {
        typeof(IdempotencyRecord).Should().BeDerivedFrom<ClinicScopedEntity>();
        typeof(IdempotencyRecord).GetProperty(nameof(ClinicScopedEntity.TenantId)).Should().NotBeNull();
        typeof(IdempotencyRecord).GetProperty(nameof(ClinicScopedEntity.ClinicId)).Should().NotBeNull();
        typeof(IdempotencyRecord).GetProperty(nameof(ClinicScopedEntity.IsDeleted)).Should().NotBeNull();
    }

    [Fact]
    public void IdempotencyRecord_ModelMetadata_HasGlobalQueryFilterConfigured()
    {
        var (contextAlpha, _, _) = CreateMultiTenantHarness($"TestDb_IdempMeta_{Guid.NewGuid()}");
        var entityType = contextAlpha.Model.FindEntityType(typeof(IdempotencyRecord));
        entityType.Should().NotBeNull();

#pragma warning disable CS0618
        var queryFilter = entityType!.GetQueryFilter();
#pragma warning restore CS0618
        queryFilter.Should().NotBeNull("IdempotencyRecord must have a global query filter defined");
        var filterStr = queryFilter!.ToString();
        filterStr.Should().Contain("ClinicId");
        filterStr.Should().Contain("CurrentClinicId");
        filterStr.Should().Contain("IsDeleted");
    }

    [Fact]
    public async Task IdempotencyRecord_MultiTenantIsolation_NeverVisibleAcrossDifferentClinics()
    {
        var dbName = $"TestDb_IdempIsolation_{Guid.NewGuid()}";
        var (contextAlpha, contextBeta, adminContext) = CreateMultiTenantHarness(dbName);

        var recordAlpha = new IdempotencyRecord
        {
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            Scope = $"{ClinicAlpha}:dr_smith",
            Key = "IDEMP-PATIENT-CREATE-001",
            Method = "POST",
            Path = "/api/v1/patients",
            RequestHash = "hash-alpha-12345",
            StatusCode = 201,
            ContentType = "application/json",
            ResponseBody = "{\"id\":\"pat-alpha-1\",\"patientCode\":\"PAT-A-01\"}"
        };

        var recordBeta = new IdempotencyRecord
        {
            TenantId = TenantBeta,
            ClinicId = ClinicBeta,
            Scope = $"{ClinicBeta}:dr_jones",
            Key = "IDEMP-PATIENT-CREATE-002",
            Method = "POST",
            Path = "/api/v1/patients",
            RequestHash = "hash-beta-67890",
            StatusCode = 201,
            ContentType = "application/json",
            ResponseBody = "{\"id\":\"pat-beta-2\",\"patientCode\":\"PAT-B-02\"}"
        };

        adminContext.IdempotencyRecords.AddRange(recordAlpha, recordBeta);
        await adminContext.SaveChangesAsync();

        // Context Alpha must see ONLY recordAlpha
        var alphaRecords = await contextAlpha.IdempotencyRecords.ToListAsync();
        alphaRecords.Should().ContainSingle();
        alphaRecords[0].Key.Should().Be("IDEMP-PATIENT-CREATE-001");
        alphaRecords[0].ClinicId.Should().Be(ClinicAlpha);

        // Context Alpha cannot access recordBeta even when explicitly querying for recordBeta.Key
        var alphaQueryBetaKey = await contextAlpha.IdempotencyRecords
            .FirstOrDefaultAsync(r => r.Key == "IDEMP-PATIENT-CREATE-002");
        alphaQueryBetaKey.Should().BeNull("Clinic Alpha should never see Clinic Beta's idempotency record");

        // Context Alpha querying with ClinicId filter for ClinicBeta returns empty list
        var crossClinicQuery = await contextAlpha.IdempotencyRecords
            .Where(r => r.ClinicId == ClinicBeta)
            .ToListAsync();
        crossClinicQuery.Should().BeEmpty();

        // Context Beta must see ONLY recordBeta
        var betaRecords = await contextBeta.IdempotencyRecords.ToListAsync();
        betaRecords.Should().ContainSingle();
        betaRecords[0].Key.Should().Be("IDEMP-PATIENT-CREATE-002");
        betaRecords[0].ClinicId.Should().Be(ClinicBeta);

        var betaQueryAlphaKey = await contextBeta.IdempotencyRecords
            .FirstOrDefaultAsync(r => r.Key == "IDEMP-PATIENT-CREATE-001");
        betaQueryAlphaKey.Should().BeNull("Clinic Beta should never see Clinic Alpha's idempotency record");

        // AdminContext with IgnoreQueryFilters sees both records
        var allRecords = await adminContext.IdempotencyRecords.IgnoreQueryFilters().ToListAsync();
        allRecords.Should().HaveCount(2);
        allRecords.Should().Contain(r => r.Key == "IDEMP-PATIENT-CREATE-001" && r.ClinicId == ClinicAlpha);
        allRecords.Should().Contain(r => r.Key == "IDEMP-PATIENT-CREATE-002" && r.ClinicId == ClinicBeta);
    }

    [Fact]
    public async Task IdempotencyRecord_IdenticalKeyInDifferentClinics_BothPersistAndRemainIsolated()
    {
        var dbName = $"TestDb_IdempSameKey_{Guid.NewGuid()}";
        var (contextAlpha, contextBeta, adminContext) = CreateMultiTenantHarness(dbName);

        const string sharedKey = "CLIENT-UUID-COLLISION-KEY-999";

        var recordAlpha = new IdempotencyRecord
        {
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            Scope = $"{ClinicAlpha}:nurse_joy",
            Key = sharedKey,
            Method = "POST",
            Path = "/api/v1/encounters",
            RequestHash = "hash-alpha-encounter",
            StatusCode = 200,
            ContentType = "application/json",
            ResponseBody = "{\"encounterId\":\"enc-a-1\"}"
        };

        var recordBeta = new IdempotencyRecord
        {
            TenantId = TenantBeta,
            ClinicId = ClinicBeta,
            Scope = $"{ClinicBeta}:nurse_clara",
            Key = sharedKey,
            Method = "POST",
            Path = "/api/v1/encounters",
            RequestHash = "hash-beta-encounter",
            StatusCode = 200,
            ContentType = "application/json",
            ResponseBody = "{\"encounterId\":\"enc-b-2\"}"
        };

        contextAlpha.IdempotencyRecords.Add(recordAlpha);
        await contextAlpha.SaveChangesAsync();

        contextBeta.IdempotencyRecords.Add(recordBeta);
        var betaSave = () => contextBeta.SaveChangesAsync();
        await betaSave.Should().NotThrowAsync("Different clinics with distinct scopes must not collide on the same Idempotency Key");

        // Query verification
        var alphaRecord = await contextAlpha.IdempotencyRecords.FirstOrDefaultAsync(r => r.Key == sharedKey);
        alphaRecord.Should().NotBeNull();
        alphaRecord!.ResponseBody.Should().Contain("enc-a-1");

        var betaRecord = await contextBeta.IdempotencyRecords.FirstOrDefaultAsync(r => r.Key == sharedKey);
        betaRecord.Should().NotBeNull();
        betaRecord!.ResponseBody.Should().Contain("enc-b-2");
    }

    [Fact]
    public async Task IdempotencyRecord_SoftDeletion_InterceptionAndQuerySuppression()
    {
        var dbName = $"TestDb_IdempSoftDel_{Guid.NewGuid()}";
        var currentUserService = Substitute.For<ICurrentUserService>();
        currentUserService.UserId.Returns("cleanup-worker-svc");

        var (contextAlpha, _, adminContext) = CreateMultiTenantHarness(dbName, currentUserService);

        var record = new IdempotencyRecord
        {
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            Scope = $"{ClinicAlpha}:staff1",
            Key = "IDEMP-TO-BE-DELETED",
            Method = "DELETE",
            Path = "/api/v1/appointments/123",
            RequestHash = "hash-del-123",
            StatusCode = 204
        };

        contextAlpha.IdempotencyRecords.Add(record);
        await contextAlpha.SaveChangesAsync();

        // Execute physical Remove
        contextAlpha.IdempotencyRecords.Remove(record);
        await contextAlpha.SaveChangesAsync();

        // Interceptor converted to soft delete
        record.IsDeleted.Should().BeTrue();
        record.DeletedAt.Should().NotBeNull();
        record.DeletedBy.Should().Be("cleanup-worker-svc");

        // Normal query returns null
        var queryActive = await contextAlpha.IdempotencyRecords.FirstOrDefaultAsync(r => r.Key == "IDEMP-TO-BE-DELETED");
        queryActive.Should().BeNull();

        // Query with IgnoreQueryFilters reveals soft-deleted record
        var queryAll = await adminContext.IdempotencyRecords.IgnoreQueryFilters()
            .FirstOrDefaultAsync(r => r.Id == record.Id);
        queryAll.Should().NotBeNull();
        queryAll!.IsDeleted.Should().BeTrue();
    }

    #endregion

    #region 2. DoctorScheduleTemplate Soft Deletion & Filtered Unique Index Tests

    [Fact]
    public void DoctorScheduleTemplate_ModelMetadata_HasFilteredUniqueIndexOnClinicDoctorDay()
    {
        var (contextAlpha, _, _) = CreateMultiTenantHarness($"TestDb_SchedMeta_{Guid.NewGuid()}");
        var entityType = contextAlpha.Model.FindEntityType(typeof(DoctorScheduleTemplate));
        entityType.Should().NotBeNull("DoctorScheduleTemplate must be registered in EF Core model");

        var index = entityType!.GetIndexes().FirstOrDefault(idx =>
            idx.Properties.Select(p => p.Name).SequenceEqual(new[] { "ClinicId", "DoctorId", "DayOfWeek" }));

        index.Should().NotBeNull("Unique index on (ClinicId, DoctorId, DayOfWeek) must exist");
        index!.IsUnique.Should().BeTrue("Index on (ClinicId, DoctorId, DayOfWeek) must be unique");

        var filter = index.GetFilter();
        filter.Should().NotBeNullOrWhiteSpace("Index on (ClinicId, DoctorId, DayOfWeek) must have a partial filter");
        filter.Should().Contain("\"IsDeleted\" = false", "Filter must specify \"IsDeleted\" = false to permit reactivation");
    }

    [Fact]
    public void DoctorScheduleTemplate_InitialCreateMigration_ContainsFilteredUniqueIndex()
    {
        var migration = new InitialCreate();
        var migrationBuilder = new MigrationBuilder("Npgsql");

        var upMethod = typeof(InitialCreate)
            .GetMethod("Up", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
        upMethod.Should().NotBeNull();
        upMethod!.Invoke(migration, new object[] { migrationBuilder });

        var createIndexes = migrationBuilder.Operations.OfType<CreateIndexOperation>().ToList();
        var schedIndex = createIndexes.FirstOrDefault(i =>
            i.Table == "DoctorScheduleTemplates" &&
            i.Columns.SequenceEqual(new[] { "ClinicId", "DoctorId", "DayOfWeek" }));

        schedIndex.Should().NotBeNull("InitialCreate migration must create index on DoctorScheduleTemplates (ClinicId, DoctorId, DayOfWeek)");
        schedIndex!.IsUnique.Should().BeTrue();
        schedIndex.Filter.Should().NotBeNull();
        schedIndex.Filter.Should().Contain("\"IsDeleted\" = false");
    }

    [Fact]
    public async Task DoctorScheduleTemplate_SoftDeleteAndReactivation_PermitsReactivationWithoutConstraintViolations()
    {
        var dbName = $"TestDb_SchedReactivation_{Guid.NewGuid()}";
        var currentUserService = Substitute.For<ICurrentUserService>();
        currentUserService.UserId.Returns("clinic-director");

        var (contextAlpha, _, adminContext) = CreateMultiTenantHarness(dbName, currentUserService);

        var doctorId = Guid.NewGuid();
        const DayOfWeek day = DayOfWeek.Wednesday;

        // Step 1: Create initial active schedule
        var scheduleV1 = new DoctorScheduleTemplate
        {
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            DoctorId = doctorId,
            DoctorName = "Dr. Maria Makiling",
            DayOfWeek = day,
            StartTime = new TimeOnly(8, 0),
            EndTime = new TimeOnly(12, 0),
            SlotDurationMinutes = 30,
            MaxPatientsPerSlot = 2,
            IsActive = true,
            EffectiveStartDate = new DateOnly(2026, 1, 1)
        };

        contextAlpha.DoctorScheduleTemplates.Add(scheduleV1);
        await contextAlpha.SaveChangesAsync();

        scheduleV1.IsDeleted.Should().BeFalse();
        scheduleV1.CreatedBy.Should().Be("clinic-director");

        // Step 2: Soft-delete scheduleV1 via Remove
        contextAlpha.DoctorScheduleTemplates.Remove(scheduleV1);
        await contextAlpha.SaveChangesAsync();

        // Verification of soft-deletion
        scheduleV1.IsDeleted.Should().BeTrue();
        scheduleV1.DeletedAt.Should().NotBeNull();
        scheduleV1.DeletedBy.Should().Be("clinic-director");

        // Standard tenant query returns nothing for this doctor and day
        var queryAfterDelete = await contextAlpha.DoctorScheduleTemplates
            .FirstOrDefaultAsync(s => s.DoctorId == doctorId && s.DayOfWeek == day);
        queryAfterDelete.Should().BeNull("Soft-deleted schedule must be excluded by global query filter");

        // Step 3: Create a NEW active schedule for the SAME (ClinicId, DoctorId, DayOfWeek)
        // With the filtered unique index ("IsDeleted" = false), reactivation must succeed cleanly
        var scheduleV2 = new DoctorScheduleTemplate
        {
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            DoctorId = doctorId,
            DoctorName = "Dr. Maria Makiling",
            DayOfWeek = day,
            StartTime = new TimeOnly(13, 0),
            EndTime = new TimeOnly(17, 0),
            SlotDurationMinutes = 20,
            MaxPatientsPerSlot = 1,
            IsActive = true,
            EffectiveStartDate = new DateOnly(2026, 6, 1)
        };

        contextAlpha.DoctorScheduleTemplates.Add(scheduleV2);
        var saveV2Action = () => contextAlpha.SaveChangesAsync();
        await saveV2Action.Should().NotThrowAsync("Reactivating schedule with identical (ClinicId, DoctorId, DayOfWeek) must succeed");

        // Step 4: Verification of active vs soft-deleted records
        var activeSchedules = await contextAlpha.DoctorScheduleTemplates
            .Where(s => s.DoctorId == doctorId && s.DayOfWeek == day)
            .ToListAsync();
        activeSchedules.Should().ContainSingle();
        activeSchedules[0].Id.Should().Be(scheduleV2.Id);
        activeSchedules[0].StartTime.Should().Be(new TimeOnly(13, 0));
        activeSchedules[0].SlotDurationMinutes.Should().Be(20);

        // Underlying database store contains BOTH records
        var allSchedulesInStore = await adminContext.DoctorScheduleTemplates
            .IgnoreQueryFilters()
            .Where(s => s.ClinicId == ClinicAlpha && s.DoctorId == doctorId && s.DayOfWeek == day)
            .ToListAsync();

        allSchedulesInStore.Should().HaveCount(2);
        allSchedulesInStore.Should().Contain(s => s.Id == scheduleV1.Id && s.IsDeleted);
        allSchedulesInStore.Should().Contain(s => s.Id == scheduleV2.Id && !s.IsDeleted);
    }

    [Fact]
    public async Task DoctorScheduleTemplate_MultipleDeactivationsAndReactivations_SucceedsDeterministically()
    {
        var dbName = $"TestDb_SchedMultiCycle_{Guid.NewGuid()}";
        var currentUserService = Substitute.For<ICurrentUserService>();
        currentUserService.UserId.Returns("hr-scheduler");

        var (contextAlpha, _, adminContext) = CreateMultiTenantHarness(dbName, currentUserService);

        var doctorId = Guid.NewGuid();
        const DayOfWeek day = DayOfWeek.Friday;

        // Cycle 1: Schedule A
        var sched1 = new DoctorScheduleTemplate
        {
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            DoctorId = doctorId,
            DoctorName = "Dr. Jose Rizal",
            DayOfWeek = day,
            StartTime = new TimeOnly(8, 0),
            EndTime = new TimeOnly(12, 0)
        };
        contextAlpha.DoctorScheduleTemplates.Add(sched1);
        await contextAlpha.SaveChangesAsync();
        contextAlpha.DoctorScheduleTemplates.Remove(sched1);
        await contextAlpha.SaveChangesAsync();

        // Cycle 2: Schedule B
        var sched2 = new DoctorScheduleTemplate
        {
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            DoctorId = doctorId,
            DoctorName = "Dr. Jose Rizal",
            DayOfWeek = day,
            StartTime = new TimeOnly(10, 0),
            EndTime = new TimeOnly(14, 0)
        };
        contextAlpha.DoctorScheduleTemplates.Add(sched2);
        await contextAlpha.SaveChangesAsync();
        contextAlpha.DoctorScheduleTemplates.Remove(sched2);
        await contextAlpha.SaveChangesAsync();

        // Cycle 3: Schedule C (Final active)
        var sched3 = new DoctorScheduleTemplate
        {
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            DoctorId = doctorId,
            DoctorName = "Dr. Jose Rizal",
            DayOfWeek = day,
            StartTime = new TimeOnly(14, 0),
            EndTime = new TimeOnly(18, 0)
        };
        contextAlpha.DoctorScheduleTemplates.Add(sched3);
        await contextAlpha.SaveChangesAsync();

        // Active query returns ONLY sched3
        var active = await contextAlpha.DoctorScheduleTemplates
            .Where(s => s.DoctorId == doctorId && s.DayOfWeek == day)
            .ToListAsync();
        active.Should().ContainSingle();
        active[0].Id.Should().Be(sched3.Id);
        active[0].StartTime.Should().Be(new TimeOnly(14, 0));

        // Store contains all 3 versions (2 soft-deleted, 1 active)
        var allInStore = await adminContext.DoctorScheduleTemplates
            .IgnoreQueryFilters()
            .Where(s => s.ClinicId == ClinicAlpha && s.DoctorId == doctorId && s.DayOfWeek == day)
            .ToListAsync();
        allInStore.Should().HaveCount(3);
        allInStore.Count(s => s.IsDeleted).Should().Be(2);
        allInStore.Count(s => !s.IsDeleted).Should().Be(1);
    }

    [Fact]
    public async Task DoctorScheduleTemplate_WithBreakTimes_ChildEntitiesPreserveReferentialIntegrity()
    {
        var dbName = $"TestDb_SchedBreakTimes_{Guid.NewGuid()}";
        var (contextAlpha, _, adminContext) = CreateMultiTenantHarness(dbName);

        var doctorId = Guid.NewGuid();
        var template = new DoctorScheduleTemplate
        {
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            DoctorId = doctorId,
            DoctorName = "Dr. Antonio Luna",
            DayOfWeek = DayOfWeek.Monday,
            StartTime = new TimeOnly(8, 0),
            EndTime = new TimeOnly(17, 0)
        };

        var breakTime = new DoctorBreakTime
        {
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            Description = "Lunch Break",
            StartTime = new TimeOnly(12, 0),
            EndTime = new TimeOnly(13, 0)
        };
        template.BreakTimes.Add(breakTime);

        contextAlpha.DoctorScheduleTemplates.Add(template);
        await contextAlpha.SaveChangesAsync();

        // Query with Include
        var loaded = await contextAlpha.DoctorScheduleTemplates
            .Include(t => t.BreakTimes)
            .FirstOrDefaultAsync(t => t.Id == template.Id);

        loaded.Should().NotBeNull();
        loaded!.BreakTimes.Should().ContainSingle();
        loaded.BreakTimes.First().Description.Should().Be("Lunch Break");
    }

    #endregion

    #region 3. PostgreSQL jsonb & GIN Index on Patient.CustomFields Tests

    [Fact]
    public void PatientCustomFields_ModelMetadata_HasJsonbColumnTypeConfigured()
    {
        var (contextAlpha, _, _) = CreateMultiTenantHarness($"TestDb_PatientMeta_{Guid.NewGuid()}");
        var patientEntity = contextAlpha.Model.FindEntityType(typeof(Patient));
        patientEntity.Should().NotBeNull("Patient entity must be registered in EF Core model");

        var customFieldsProp = patientEntity!.FindProperty(nameof(Patient.CustomFields));
        customFieldsProp.Should().NotBeNull("Patient.CustomFields property must exist");
        
        var columnTypeAnnotation = customFieldsProp!.FindAnnotation("Relational:ColumnType");
        columnTypeAnnotation.Should().NotBeNull("CustomFields must have Relational:ColumnType annotation configured");
        columnTypeAnnotation!.Value.Should().Be("jsonb", "CustomFields must be mapped as PostgreSQL jsonb");
        customFieldsProp.IsNullable.Should().BeFalse("CustomFields is required and defaults to empty jsonb");
    }

    [Fact]
    public void PatientCustomFields_ModelMetadata_HasGinIndexConfigured()
    {
        var (contextAlpha, _, _) = CreateMultiTenantHarness($"TestDb_PatientGinMeta_{Guid.NewGuid()}");
        var patientEntity = contextAlpha.Model.FindEntityType(typeof(Patient));
        patientEntity.Should().NotBeNull();

        var ginIndex = patientEntity!.GetIndexes().FirstOrDefault(idx =>
            idx.Properties.Select(p => p.Name).SequenceEqual(new[] { nameof(Patient.CustomFields) }));

        ginIndex.Should().NotBeNull("An index on Patient.CustomFields must be configured for JSONB querying");
        
        var methodAnnotation = ginIndex!.FindAnnotation("Npgsql:IndexMethod");
        methodAnnotation.Should().NotBeNull("GIN index annotation must be present on Patient.CustomFields");
        methodAnnotation!.Value.Should().Be("gin", "Index method must be GIN for PostgreSQL JSONB acceleration");
    }

    [Fact]
    public void PatientCustomFields_InitialCreateMigration_CreatesJsonbAndGinIndex()
    {
        var migration = new InitialCreate();
        var migrationBuilder = new MigrationBuilder("Npgsql");

        var upMethod = typeof(InitialCreate)
            .GetMethod("Up", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
        upMethod.Should().NotBeNull();
        upMethod!.Invoke(migration, new object[] { migrationBuilder });

        // Verify column in CreateTableOperation
        var createPatientsTable = migrationBuilder.Operations.OfType<CreateTableOperation>()
            .FirstOrDefault(t => t.Name == "Patients");
        createPatientsTable.Should().NotBeNull();

        var customFieldsCol = createPatientsTable!.Columns.FirstOrDefault(c => c.Name == "CustomFields");
        customFieldsCol.Should().NotBeNull();
        customFieldsCol!.ColumnType.Should().Be("jsonb");
        customFieldsCol.IsNullable.Should().BeFalse();

        // Verify GIN index in CreateIndexOperation
        var ginIndexOp = migrationBuilder.Operations.OfType<CreateIndexOperation>()
            .FirstOrDefault(i => i.Table == "Patients" && i.Name == "IX_Patients_CustomFields");
        ginIndexOp.Should().NotBeNull();
        ginIndexOp!.Columns.Should().Equal(new[] { "CustomFields" });
        
        var methodAnnotation = ginIndexOp.FindAnnotation("Npgsql:IndexMethod");
        methodAnnotation.Should().NotBeNull();
        methodAnnotation!.Value.Should().Be("gin");
    }

    [Fact]
    public async Task PatientCustomFields_JsonbOperations_ComplexDataTypesRoundTripFidelity()
    {
        var dbName = $"TestDb_JsonbRoundTrip_{Guid.NewGuid()}";
        var (contextAlpha, _, _) = CreateMultiTenantHarness(dbName);

        var complexData = new Dictionary<string, object?>
        {
            // Address keys
            ["address_line1"] = "Unit 402, Sampaguita Heights Condominium",
            ["barangay"] = "Barangay San Antonio",
            ["city"] = "Pasig City",
            ["province"] = "Metro Manila",
            ["zip_code"] = "1605",

            // Emergency contact keys
            ["emergency_contact_name"] = "Maria Clara Dela Cruz",
            ["emergency_contact_phone"] = "+63 917 555 4321",
            ["emergency_contact_relationship"] = "Spouse",

            // Dynamic university template metadata (numbers, strings, booleans, nested)
            ["affiliation"] = "Student",
            ["student_id"] = "USTP-2026-98765",
            ["year_level"] = 3,
            ["gpa"] = 3.85,
            ["is_scholar"] = true,
            ["is_dormer"] = false,

            // Unicode, Baybayin, Filipino characters, quotes, special characters
            ["notes_baybayin"] = "ᜋᜊᜓᜑᜌ᜔ ᜉᜒᜎᜒᜉᜒᜈᜐ᜔",
            ["escaped_text"] = "Line 1\nLine 2\t\"Quoted\" \\ Backslash",
            ["diacritics"] = "Peñafrancia, Niño, Parañaque",

            // Nullable value
            ["middle_initial"] = null
        };

        var patient = new Patient
        {
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            PatientCode = "PAT-JSONB-001",
            FirstName = "Crisostomo",
            LastName = "Ibarra",
            DateOfBirth = new DateOnly(1995, 6, 19),
            Gender = Gender.Male,
            ContactNumber = "0917-000-8888",
            CustomFields = complexData
        };

        contextAlpha.Patients.Add(patient);
        await contextAlpha.SaveChangesAsync();

        // Retrieve through a fresh query
        var retrieved = await contextAlpha.Patients.FirstOrDefaultAsync(p => p.Id == patient.Id);
        retrieved.Should().NotBeNull();
        retrieved!.CustomFields.Should().NotBeNull();

        // Verify values
        retrieved.CustomFields["address_line1"]?.ToString().Should().Be("Unit 402, Sampaguita Heights Condominium");
        retrieved.CustomFields["barangay"]?.ToString().Should().Be("Barangay San Antonio");
        retrieved.CustomFields["emergency_contact_name"]?.ToString().Should().Be("Maria Clara Dela Cruz");
        retrieved.CustomFields["affiliation"]?.ToString().Should().Be("Student");
        retrieved.CustomFields["student_id"]?.ToString().Should().Be("USTP-2026-98765");
        retrieved.CustomFields["notes_baybayin"]?.ToString().Should().Be("ᜋᜊᜓᜑᜌ᜔ ᜉᜒᜎᜒᜉᜒᜈᜐ᜔");
        retrieved.CustomFields["diacritics"]?.ToString().Should().Be("Peñafrancia, Niño, Parañaque");
        retrieved.CustomFields.ContainsKey("middle_initial").Should().BeTrue();
    }

    [Fact]
    public async Task PatientCustomFields_MutationAndChangeTracking_UpdatesPersistCorrectly()
    {
        var dbName = $"TestDb_JsonbMutation_{Guid.NewGuid()}";
        var (contextAlpha, _, _) = CreateMultiTenantHarness(dbName);

        var initialFields = new Dictionary<string, object?>
        {
            ["program"] = "BS Computer Science",
            ["semester"] = 1
        };

        var patient = new Patient
        {
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            PatientCode = "PAT-MUTATE-001",
            FirstName = "Simoun",
            LastName = "Radical",
            DateOfBirth = new DateOnly(1988, 12, 30),
            Gender = Gender.Male,
            ContactNumber = "0918-111-2222",
            CustomFields = initialFields
        };

        contextAlpha.Patients.Add(patient);
        await contextAlpha.SaveChangesAsync();

        // Mutate CustomFields: add key, modify key, remove key
        var updatedFields = new Dictionary<string, object?>(patient.CustomFields)
        {
            ["program"] = "BS Data Science", // modified
            ["honors"] = "Dean's List"        // added
        };
        updatedFields.Remove("semester");     // removed

        patient.CustomFields = updatedFields;
        await contextAlpha.SaveChangesAsync();

        // Verify persisted mutation
        var reloaded = await contextAlpha.Patients.AsNoTracking().FirstOrDefaultAsync(p => p.Id == patient.Id);
        reloaded.Should().NotBeNull();
        reloaded!.CustomFields.Should().ContainKey("program");
        reloaded.CustomFields["program"]?.ToString().Should().Be("BS Data Science");
        reloaded.CustomFields.Should().ContainKey("honors");
        reloaded.CustomFields["honors"]?.ToString().Should().Be("Dean's List");
        reloaded.CustomFields.Should().NotContainKey("semester");
    }

    [Fact]
    public async Task PatientCustomFields_EmptyDictionary_PersistsAsEmptyJsonbWithoutErrors()
    {
        var dbName = $"TestDb_JsonbEmpty_{Guid.NewGuid()}";
        var (contextAlpha, _, _) = CreateMultiTenantHarness(dbName);

        var patient = new Patient
        {
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            PatientCode = "PAT-EMPTY-CF-01",
            FirstName = "Elias",
            LastName = "Piloto",
            DateOfBirth = new DateOnly(1992, 5, 5),
            Gender = Gender.Male,
            ContactNumber = "0919-333-4444",
            CustomFields = new Dictionary<string, object?>()
        };

        contextAlpha.Patients.Add(patient);
        var saveAction = () => contextAlpha.SaveChangesAsync();
        await saveAction.Should().NotThrowAsync();

        var reloaded = await contextAlpha.Patients.FirstOrDefaultAsync(p => p.Id == patient.Id);
        reloaded.Should().NotBeNull();
        reloaded!.CustomFields.Should().NotBeNull();
        reloaded.CustomFields.Should().BeEmpty();
    }

    [Fact]
    public void PatientCustomFields_Pure1NfCompliance_ZeroLegacyClinicalJsonKeysExpected()
    {
        // Purity check: Verify Patient domain entity has NO flat clinical text properties
        var patientType = typeof(Patient);
        var allergiesProp = patientType.GetProperty("Allergies");
        allergiesProp.Should().NotBeNull();
        allergiesProp!.PropertyType.Should().Be(typeof(ICollection<PatientAllergy>), "Allergies must be 1:N relational entity, not scalar text");
        patientType.GetProperty("ChronicConditions").Should().BeNull("ChronicConditions scalar column must be removed in pure 1NF");
        var alertsProp = patientType.GetProperty("Alerts");
        alertsProp.Should().NotBeNull();
        alertsProp!.PropertyType.Should().Be(typeof(ICollection<PatientAlert>), "Alerts must be 1:N relational entity, not scalar text");
        patientType.GetProperty("SyncPatientId").Should().BeNull("SyncPatientId must be renamed to CloudPatientId");
    }

    #endregion
}
