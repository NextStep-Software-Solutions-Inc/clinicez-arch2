using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Consultations.Commands;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.Common;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Application.Features.Settings.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Interceptors;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.HealthScreenings;

public sealed class HealthScreeningDomainAndSettingsTests
{
    [Fact]
    public void PhilHealthDependentRelationship_DisabledDependent_SerializesAndParsesAsD()
    {
        PhilHealthDependentRelationship.S.ToString().Should().Be("S");
        PhilHealthDependentRelationship.Spouse.ToString().Should().Be("S");
        PhilHealthDependentRelationship.C.ToString().Should().Be("C");
        PhilHealthDependentRelationship.P.ToString().Should().Be("P");
        PhilHealthDependentRelationship.D.ToString().Should().Be("D");
        PhilHealthDependentRelationship.Disabled.ToString().Should().Be("D");
        PhilHealthDependentRelationship.DisabledDependent.ToString().Should().Be("D");

        Enum.TryParse<PhilHealthDependentRelationship>("D", ignoreCase: true, out var parsedUpperD).Should().BeTrue();
        parsedUpperD.Should().Be(PhilHealthDependentRelationship.D);
        parsedUpperD.ToString().Should().Be("D");

        Enum.TryParse<PhilHealthDependentRelationship>("d", ignoreCase: true, out var parsedLowerD).Should().BeTrue();
        parsedLowerD.Should().Be(PhilHealthDependentRelationship.D);
        parsedLowerD.ToString().Should().Be("D");

        Enum.TryParse<PhilHealthDependentRelationship>("Disabled", ignoreCase: true, out var parsedDisabled).Should().BeTrue();
        parsedDisabled.Should().Be(PhilHealthDependentRelationship.D);
        parsedDisabled.ToString().Should().Be("D");

        Enum.TryParse<PhilHealthDependentRelationship>("DisabledDependent", ignoreCase: true, out var parsedDisabledDependent).Should().BeTrue();
        parsedDisabledDependent.Should().Be(PhilHealthDependentRelationship.D);
        parsedDisabledDependent.ToString().Should().Be("D");
    }

    [Fact]
    public void HealthScreeningEnums_ContainExpectedValues()
    {
        Enum.GetValues<HealthScreeningType>().Should().BeEquivalentTo(new[]
        {
            HealthScreeningType.RoutineWellness,
            HealthScreeningType.AnnualPhysicalExam,
            HealthScreeningType.PreEmployment,
            HealthScreeningType.SchoolPhysical,
            HealthScreeningType.YakapFpe,
            HealthScreeningType.CommunityScreening
        });

        Enum.GetValues<HealthScreeningStatus>().Should().BeEquivalentTo(new[]
        {
            HealthScreeningStatus.InProgress,
            HealthScreeningStatus.AwaitingDoctor,
            HealthScreeningStatus.Completed,
            HealthScreeningStatus.EscalatedToConsultation,
            HealthScreeningStatus.Cancelled
        });

        Enum.GetValues<HealthScreeningDisposition>().Should().BeEquivalentTo(new[]
        {
            HealthScreeningDisposition.Cleared,
            HealthScreeningDisposition.ClearedWithAdvice,
            HealthScreeningDisposition.ForWorkup,
            HealthScreeningDisposition.EscalatedToConsultation
        });
    }

    [Fact]
    public void HealthScreeningModel_EnforcesRestrictOnRequiredFks_AndSetNullOnOptionalFks()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(Guid.NewGuid());
        clinicContext.TenantId.Returns("tenant-model");

        var (context, _, _) = TestDbHelper.CreateTestContext(clinicContext);
        var entityType = context.Model.FindEntityType(typeof(HealthScreening));
        entityType.Should().NotBeNull();
        entityType!.GetTableName().Should().Be("HealthScreenings");

        void AssertFkDeleteBehavior<TPrincipal>(string fkPropertyName, DeleteBehavior expectedBehavior)
        {
            var principalType = context.Model.FindEntityType(typeof(TPrincipal));
            principalType.Should().NotBeNull();

            var fk = entityType.GetForeignKeys().FirstOrDefault(f =>
                f.PrincipalEntityType == principalType &&
                f.Properties.Any(p => p.Name == fkPropertyName));

            fk.Should().NotBeNull($"FK {fkPropertyName} -> {typeof(TPrincipal).Name} must exist");
            fk!.DeleteBehavior.Should().Be(expectedBehavior);
        }

        AssertFkDeleteBehavior<Patient>("PatientId", DeleteBehavior.Restrict);
        AssertFkDeleteBehavior<QueueItem>("QueueItemId", DeleteBehavior.Restrict);
        AssertFkDeleteBehavior<ConsultationEncounter>("ConsultationEncounterId", DeleteBehavior.SetNull);
        AssertFkDeleteBehavior<PatientYakapEnlistment>("YakapEnlistmentId", DeleteBehavior.SetNull);
        AssertFkDeleteBehavior<PatientVitals>("PatientVitalsId", DeleteBehavior.SetNull);
        AssertFkDeleteBehavior<PatientPhysicalExam>("PatientPhysicalExamId", DeleteBehavior.SetNull);
        AssertFkDeleteBehavior<NcdRiskAssessment>("NcdRiskAssessmentId", DeleteBehavior.SetNull);
        AssertFkDeleteBehavior<ServiceItem>("ServiceItemId", DeleteBehavior.SetNull);

        entityType.FindProperty(nameof(HealthScreening.AdultsRoutineScreeningCode))!.GetMaxLength().Should().Be(100);
        entityType.FindProperty(nameof(HealthScreening.ScreeningType))!.GetProviderClrType().Should().Be(typeof(string));
        entityType.FindProperty(nameof(HealthScreening.Status))!.GetProviderClrType().Should().Be(typeof(string));
        entityType.FindProperty(nameof(HealthScreening.Disposition))!.GetProviderClrType().Should().Be(typeof(string));
    }

    [Fact]
    public async Task HealthScreening_EnforcesClinicTenantQueryFilter_AndSoftDelete()
    {
        var dbName = $"HealthScreening_Tenancy_{Guid.NewGuid()}";
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();

        var ctxA = Substitute.For<IClinicContext>();
        ctxA.ClinicId.Returns(clinicA);
        ctxA.TenantId.Returns("tenant-a");

        var ctxB = Substitute.For<IClinicContext>();
        ctxB.ClinicId.Returns(clinicB);
        ctxB.TenantId.Returns("tenant-b");

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "public") })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(dbName)
            .AddInterceptors(new SoftDeleteSaveChangesInterceptor())
            .Options;

        await using var dbA = new ApplicationDbContext(options, config, ctxA);
        await using var dbB = new ApplicationDbContext(options, config, ctxB);

        var patientA = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = clinicA,
            PatientCode = "PAT-A-100",
            FirstName = "Ana",
            LastName = "Reyes",
            DateOfBirth = new DateOnly(1990, 5, 10),
            Sex = BiologicalSex.Female,
            ContactNumber = "09170000001"
        };
        var queueA = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = clinicA,
            PatientId = patientA.Id,
            PatientName = "Ana Reyes",
            QueueNumber = "V-001",
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.PreventiveHealthAssessment
        };
        var screeningA = new HealthScreening
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = clinicA,
            PatientId = patientA.Id,
            QueueItemId = queueA.Id,
            ScreeningType = HealthScreeningType.AnnualPhysicalExam,
            Status = HealthScreeningStatus.InProgress
        };
        dbA.Patients.Add(patientA);
        dbA.QueueItems.Add(queueA);
        dbA.HealthScreenings.Add(screeningA);
        await dbA.SaveChangesAsync();

        var patientB = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-b",
            ClinicId = clinicB,
            PatientCode = "PAT-B-200",
            FirstName = "Ben",
            LastName = "Cruz",
            DateOfBirth = new DateOnly(1988, 8, 20),
            Sex = BiologicalSex.Male,
            ContactNumber = "09170000002"
        };
        var queueB = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-b",
            ClinicId = clinicB,
            PatientId = patientB.Id,
            PatientName = "Ben Cruz",
            QueueNumber = "V-002",
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.PreventiveHealthAssessment
        };
        var screeningB = new HealthScreening
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-b",
            ClinicId = clinicB,
            PatientId = patientB.Id,
            QueueItemId = queueB.Id,
            ScreeningType = HealthScreeningType.YakapFpe,
            WorkflowMode = VisitWorkflowMode.YakapAvailment,
            Status = HealthScreeningStatus.AwaitingDoctor
        };
        dbB.Patients.Add(patientB);
        dbB.QueueItems.Add(queueB);
        dbB.HealthScreenings.Add(screeningB);
        await dbB.SaveChangesAsync();

        var visibleToA = await dbA.HealthScreenings.ToListAsync();
        visibleToA.Should().ContainSingle(s => s.Id == screeningA.Id);

        var visibleToB = await dbB.HealthScreenings.ToListAsync();
        visibleToB.Should().ContainSingle(s => s.Id == screeningB.Id);

        // Soft-delete screeningA via Remove + SoftDeleteSaveChangesInterceptor
        dbA.HealthScreenings.Remove(screeningA);
        await dbA.SaveChangesAsync();

        (await dbA.HealthScreenings.ToListAsync()).Should().BeEmpty();
        var rawA = await dbA.HealthScreenings.IgnoreQueryFilters().FirstOrDefaultAsync(s => s.Id == screeningA.Id);
        rawA.Should().NotBeNull();
        rawA!.IsDeleted.Should().BeTrue();
    }

    [Fact]
    public async Task ClinicSettings_HealthScreeningFields_RoundTripPartialUpdateAndClearFlag()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(Guid.NewGuid());
        clinicContext.TenantId.Returns("tenant-settings");

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var getHandler = new GetClinicSettingsQueryHandler(settingsRepo, clinicContext, uow);
        var updateHandler = new UpdateClinicSettingsCommandHandler(settingsRepo, clinicContext, uow);

        // 1. Default auto-provisioned settings
        var initial = await getHandler.Handle(new GetClinicSettingsQuery(), CancellationToken.None);
        initial.AllowNurseMidwifeYakapFpeFacilitator.Should().BeFalse();
        initial.DefaultHealthScreeningServiceItemId.Should().BeNull();
        initial.DefaultHealthScreeningServiceCode.Should().Be("HEALTH-SCREEN");

        // 2. Update all 3 fields
        var customServiceItemId = Guid.NewGuid();
        var updated = await updateHandler.Handle(new UpdateClinicSettingsCommand(
            AllowNurseMidwifeYakapFpeFacilitator: true,
            DefaultHealthScreeningServiceItemId: customServiceItemId,
            DefaultHealthScreeningServiceCode: "  APE-EXEC  "), CancellationToken.None);

        updated.AllowNurseMidwifeYakapFpeFacilitator.Should().BeTrue();
        updated.DefaultHealthScreeningServiceItemId.Should().Be(customServiceItemId);
        updated.DefaultHealthScreeningServiceCode.Should().Be("APE-EXEC");

        // 3. Partial update unrelated field preserves health screening settings
        var partial = await updateHandler.Handle(new UpdateClinicSettingsCommand(
            ClinicName: "Sunrise Medical Clinic"), CancellationToken.None);

        partial.ClinicName.Should().Be("Sunrise Medical Clinic");
        partial.AllowNurseMidwifeYakapFpeFacilitator.Should().BeTrue();
        partial.DefaultHealthScreeningServiceItemId.Should().Be(customServiceItemId);
        partial.DefaultHealthScreeningServiceCode.Should().Be("APE-EXEC");

        // 4. Clear flag resets DefaultHealthScreeningServiceItemId to null
        var cleared = await updateHandler.Handle(new UpdateClinicSettingsCommand(
            ClearDefaultHealthScreeningServiceItemId: true,
            DefaultHealthScreeningServiceCode: "   "), CancellationToken.None);

        cleared.DefaultHealthScreeningServiceItemId.Should().BeNull();
        cleared.DefaultHealthScreeningServiceCode.Should().BeNull();
    }

    [Fact]
    public void UpdateClinicSettingsCommandValidator_ValidatesDefaultHealthScreeningServiceCodeLength()
    {
        var validator = new UpdateClinicSettingsCommandValidator();

        var valid = validator.Validate(new UpdateClinicSettingsCommand(
            DefaultHealthScreeningServiceCode: new string('A', 50)));
        valid.IsValid.Should().BeTrue();

        var invalid = validator.Validate(new UpdateClinicSettingsCommand(
            DefaultHealthScreeningServiceCode: new string('A', 51)));
        invalid.IsValid.Should().BeFalse();
        invalid.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicSettingsCommand.DefaultHealthScreeningServiceCode));
    }

    [Fact]
    public void GeneralMedicalCatalogDefaults_IncludesHealthScreenItem()
    {
        var defaults = GeneralMedicalCatalogDefaults.CreateDefaults("tenant-1", Guid.NewGuid());

        defaults.Should().HaveCount(10);
        var item = defaults.FirstOrDefault(x => x.Code == "HEALTH-SCREEN");
        item.Should().NotBeNull();
        item!.Name.Should().Be("Health Screening & Assessment");
        item.Category.Should().Be("Consultation");
        item.StandardPrice.Should().Be(500m);
        item.IsNurseOrderable.Should().BeTrue();
        item.IsActive.Should().BeTrue();
    }

    [Fact]
    public async Task ConsultationRevertHelper_UnlinksHealthScreeningConsultationEncounterId_WithoutDeletingScreening()
    {
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant-revert");

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-revert",
            ClinicId = clinicId,
            PatientCode = "PAT-REV-1",
            FirstName = "Clara",
            LastName = "Santos",
            DateOfBirth = new DateOnly(1992, 4, 1),
            Sex = BiologicalSex.Female,
            ContactNumber = "09170000009"
        };
        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-revert",
            ClinicId = clinicId,
            PatientId = patient.Id,
            PatientName = "Clara Santos",
            QueueNumber = "V-010",
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.RoutineCheckup
        };
        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-revert",
            ClinicId = clinicId,
            PatientId = patient.Id,
            PatientName = "Clara Santos",
            QueueItemId = queueItem.Id,
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Reyes",
            IsSigned = false
        };
        var screening = new HealthScreening
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-revert",
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = queueItem.Id,
            ConsultationEncounterId = encounter.Id,
            Status = HealthScreeningStatus.EscalatedToConsultation
        };

        context.Patients.Add(patient);
        context.QueueItems.Add(queueItem);
        context.Consultations.Add(encounter);
        context.HealthScreenings.Add(screening);
        await uow.SaveChangesAsync();

        await ConsultationRevertHelper.PurgeUnsignedConsultationArtifactsAsync(
            clinicId,
            consultationId: encounter.Id,
            queueItemId: queueItem.Id,
            unitOfWork: uow,
            ct: CancellationToken.None);
        await uow.SaveChangesAsync();

        var survivingScreening = await context.HealthScreenings.FirstOrDefaultAsync(s => s.Id == screening.Id);
        survivingScreening.Should().NotBeNull();
        survivingScreening!.ConsultationEncounterId.Should().BeNull();
        (await context.Consultations.IgnoreQueryFilters().CountAsync(c => c.Id == encounter.Id)).Should().Be(0);
    }
}
