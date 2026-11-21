using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Billing.DTOs;
using ClinicEz.Clinic.Application.Features.Consultations.DTOs;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Application.Features.Procedures.DTOs;
using ClinicEz.Clinic.Application.Features.Triage.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Repositories;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Sieve.Services;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Adversarial Verification Suite for Milestone 2 (M2: Native Patient Ingestion & Relational Chart Profiling).
/// Directly challenges and stress-tests:
/// 1. Multi-Tenant Query & Mutation Isolation across Clinic A and Clinic B for:
///    - PatientSurgicalHistory
///    - PatientSocialHistory
///    - PatientReproductiveHistory
///    - NcdRiskAssessment
/// 2. Backward Compatibility & Lazy Ingestion of legacy CustomFields["philhealth_profile"] upon access.
/// 3. Male Reproductive Guard (backend command enforcement, legacy ingestion, female preservation).
/// </summary>
public class ChallengerM2EmpiricalTests
{
    private readonly ISieveProcessor _sieveProcessor = Substitute.For<ISieveProcessor>();

    private ApplicationDbContext CreateScopedDbContext(string dbName, Guid clinicId, string tenantId)
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "public") })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;

        return new ApplicationDbContext(options, config, clinicContext);
    }

    private (IUnitOfWork uow, IClinicContext ctx) CreateUnitOfWorkAndContext(ApplicationDbContext db, Guid clinicId, string tenantId)
    {
        var ctx = Substitute.For<IClinicContext>();
        ctx.ClinicId.Returns(clinicId);
        ctx.TenantId.Returns(tenantId);
        ctx.StaffId.Returns(Guid.NewGuid());

        var uow = Substitute.For<IUnitOfWork>();
        uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(ci => db.SaveChangesAsync(ci.Arg<CancellationToken>()));

        return (uow, ctx);
    }

    private Patient CreatePatient(Guid id, Guid clinicId, string tenantId, string firstName, string lastName, string gender, Dictionary<string, object?>? customFields = null)
    {
        return new Patient
        {
            Id = id,
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientCode = $"PAT-{Guid.NewGuid():N}"[..12],
            FirstName = firstName,
            LastName = lastName,
            ContactNumber = "09171234567",
            DateOfBirth = new DateOnly(1990, 1, 1),
            Sex = Enum.TryParse<BiologicalSex>(gender, true, out var g) ? g : BiologicalSex.Unknown,
            CustomFields = customFields ?? new Dictionary<string, object?>()
        };
    }

    // =========================================================================
    // 1. Multi-Tenant Query Filter & Isolation Challenges
    // =========================================================================

    [Fact]
    public async Task MultiTenant_ClinicACannotQuery_ClinicB_SurgicalHistories()
    {
        var dbName = $"MT_Surg_Query_{Guid.NewGuid()}";
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        // 1. Seed Clinic B patient & surgical history
        using (var dbB = CreateScopedDbContext(dbName, clinicB, "tenant-b"))
        {
            dbB.Patients.Add(CreatePatient(patientId, clinicB, "tenant-b", "Maria", "Santos", "Female"));
            dbB.PatientSurgicalHistories.Add(new PatientSurgicalHistory
            {
                Id = Guid.NewGuid(),
                ClinicId = clinicB,
                TenantId = "tenant-b",
                PatientId = patientId,
                ProcedureName = "Laparoscopic Cholecystectomy",
                SurgeryDate = new DateOnly(2023, 4, 15)
            });
            await dbB.SaveChangesAsync();
        }

        // 2. Clinic A queries surgical histories for patientId
        using (var dbA = CreateScopedDbContext(dbName, clinicA, "tenant-a"))
        {
            var repoA = new Repository<PatientSurgicalHistory>(dbA, _sieveProcessor);
            var handlerA = new GetPatientSurgicalHistoriesQueryHandler(repoA);

            var result = await handlerA.Handle(new GetPatientSurgicalHistoriesQuery(patientId), CancellationToken.None);

            result.Should().BeEmpty("Clinic A must never access surgical histories belonging to Clinic B");
        }
    }

    [Fact]
    public async Task MultiTenant_ClinicACannotQuery_ClinicB_SocialHistory()
    {
        var dbName = $"MT_Social_Query_{Guid.NewGuid()}";
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        // 1. Seed Clinic B patient & social history
        using (var dbB = CreateScopedDbContext(dbName, clinicB, "tenant-b"))
        {
            dbB.Patients.Add(CreatePatient(patientId, clinicB, "tenant-b", "Juan", "Dela Cruz", "Male"));
            dbB.PatientSocialHistories.Add(new PatientSocialHistory
            {
                Id = Guid.NewGuid(),
                ClinicId = clinicB,
                TenantId = "tenant-b",
                PatientId = patientId,
                IsSmoker = true,
                PacksPerDay = 1.5m,
                YearsSmoking = 20,
                SmokingPackYears = 30m,
                IsAlcoholDrinker = true
            });
            await dbB.SaveChangesAsync();
        }

        // 2. Clinic A queries social history for patientId
        using (var dbA = CreateScopedDbContext(dbName, clinicA, "tenant-a"))
        {
            var repoA = new Repository<PatientSocialHistory>(dbA, _sieveProcessor);
            var handlerA = new GetPatientSocialHistoryQueryHandler(repoA);

            var result = await handlerA.Handle(new GetPatientSocialHistoryQuery(patientId), CancellationToken.None);

            result.Should().BeNull("Clinic A must never access social history belonging to Clinic B");
        }
    }

    [Fact]
    public async Task MultiTenant_ClinicACannotQuery_ClinicB_ReproductiveHistory()
    {
        var dbName = $"MT_Repro_Query_{Guid.NewGuid()}";
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        // 1. Seed Clinic B patient & reproductive history
        using (var dbB = CreateScopedDbContext(dbName, clinicB, "tenant-b"))
        {
            dbB.Patients.Add(CreatePatient(patientId, clinicB, "tenant-b", "Elena", "Reyes", "Female"));
            dbB.PatientReproductiveHistories.Add(new PatientReproductiveHistory
            {
                Id = Guid.NewGuid(),
                ClinicId = clinicB,
                TenantId = "tenant-b",
                PatientId = patientId,
                IsApplicable = true,
                MenarcheAge = 12,
                Gravidity = 2,
                Parity = 2
            });
            await dbB.SaveChangesAsync();
        }

        // 2. Clinic A queries reproductive history for patientId
        using (var dbA = CreateScopedDbContext(dbName, clinicA, "tenant-a"))
        {
            var repoA = new Repository<PatientReproductiveHistory>(dbA, _sieveProcessor);
            var handlerA = new GetPatientReproductiveHistoryQueryHandler(repoA);

            var result = await handlerA.Handle(new GetPatientReproductiveHistoryQuery(patientId), CancellationToken.None);

            result.Should().BeNull("Clinic A must never access reproductive history belonging to Clinic B");
        }
    }

    [Fact]
    public async Task MultiTenant_ClinicACannotQuery_ClinicB_NcdRiskAssessment()
    {
        var dbName = $"MT_Ncd_Query_{Guid.NewGuid()}";
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        // 1. Seed Clinic B patient & NCD assessment
        using (var dbB = CreateScopedDbContext(dbName, clinicB, "tenant-b"))
        {
            dbB.Patients.Add(CreatePatient(patientId, clinicB, "tenant-b", "Roberto", "Garcia", "Male"));
            dbB.NcdRiskAssessments.Add(new NcdRiskAssessment
            {
                Id = Guid.NewGuid(),
                ClinicId = clinicB,
                TenantId = "tenant-b",
                PatientId = patientId,
                AssessmentDate = DateTime.UtcNow,
                RiskBand = "BandC",
                FastingBloodSugarMgDl = 145m,
                TotalCholesterolMgDl = 230m
            });
            await dbB.SaveChangesAsync();
        }

        // 2. Clinic A queries NCD assessments for patientId
        using (var dbA = CreateScopedDbContext(dbName, clinicA, "tenant-a"))
        {
            var repoA = new Repository<NcdRiskAssessment>(dbA, _sieveProcessor);
            var handlerA = new GetPatientNcdRiskAssessmentsQueryHandler(repoA);

            var result = await handlerA.Handle(new GetPatientNcdRiskAssessmentsQuery(patientId), CancellationToken.None);

            result.Should().BeEmpty("Clinic A must never access NCD assessments belonging to Clinic B");
        }
    }

    [Fact]
    public async Task MultiTenant_ClinicACannotQuery_ClinicB_PatientChart_RelationalFieldsIsolated()
    {
        var dbName = $"MT_Chart_Query_{Guid.NewGuid()}";
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        // 1. Seed Clinic B patient with all profiling entities
        using (var dbB = CreateScopedDbContext(dbName, clinicB, "tenant-b"))
        {
            dbB.Patients.Add(CreatePatient(patientId, clinicB, "tenant-b", "Maria", "Clara", "Female"));
            dbB.PatientSurgicalHistories.Add(new PatientSurgicalHistory
            {
                Id = Guid.NewGuid(),
                ClinicId = clinicB,
                TenantId = "tenant-b",
                PatientId = patientId,
                ProcedureName = "Appendectomy",
                SurgeryDate = new DateOnly(2020, 1, 1)
            });
            dbB.PatientSocialHistories.Add(new PatientSocialHistory
            {
                Id = Guid.NewGuid(),
                ClinicId = clinicB,
                TenantId = "tenant-b",
                PatientId = patientId,
                IsSmoker = false
            });
            dbB.PatientReproductiveHistories.Add(new PatientReproductiveHistory
            {
                Id = Guid.NewGuid(),
                ClinicId = clinicB,
                TenantId = "tenant-b",
                PatientId = patientId,
                IsApplicable = true,
                MenarcheAge = 13
            });
            dbB.NcdRiskAssessments.Add(new NcdRiskAssessment
            {
                Id = Guid.NewGuid(),
                ClinicId = clinicB,
                TenantId = "tenant-b",
                PatientId = patientId,
                AssessmentDate = DateTime.UtcNow,
                RiskBand = "BandA"
            });
            await dbB.SaveChangesAsync();
        }

        // 2. Clinic A queries patient chart
        using (var dbA = CreateScopedDbContext(dbName, clinicA, "tenant-a"))
        {
            var (_, ctxA) = CreateUnitOfWorkAndContext(dbA, clinicA, "tenant-a");

            var handlerA = new GetPatientChartQueryHandler(
                new Repository<ConsultationEncounter>(dbA, _sieveProcessor),
                new Repository<PatientVitals>(dbA, _sieveProcessor),
                new Repository<Procedure>(dbA, _sieveProcessor),
                new Repository<LabOrder>(dbA, _sieveProcessor),
                new Repository<Invoice>(dbA, _sieveProcessor),
                ctxA,
                new Repository<PatientSurgicalHistory>(dbA, _sieveProcessor),
                new Repository<PatientSocialHistory>(dbA, _sieveProcessor),
                new Repository<PatientReproductiveHistory>(dbA, _sieveProcessor),
                new Repository<NcdRiskAssessment>(dbA, _sieveProcessor));

            var chart = await handlerA.Handle(new GetPatientChartQuery(patientId), CancellationToken.None);

            chart.SurgicalHistories.Should().BeEmpty("Clinic A must see 0 surgical histories for Clinic B's patient");
            chart.SocialHistory.Should().BeNull("Clinic A must see null social history for Clinic B's patient");
            chart.ReproductiveHistory.Should().BeNull("Clinic A must see null reproductive history for Clinic B's patient");
            chart.LatestNcdAssessment.Should().BeNull("Clinic A must see null NCD assessment for Clinic B's patient");
        }
    }

    // =========================================================================
    // 2. Multi-Tenant Mutation Guarding (Clinic A cannot mutate Clinic B)
    // =========================================================================

    [Fact]
    public async Task MultiTenant_ClinicACannotAdd_SurgicalHistory_ToClinicBPatient_ThrowsNotFound()
    {
        var dbName = $"MT_Surg_Add_{Guid.NewGuid()}";
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        // 1. Patient exists in Clinic B
        using (var dbB = CreateScopedDbContext(dbName, clinicB, "tenant-b"))
        {
            dbB.Patients.Add(CreatePatient(patientId, clinicB, "tenant-b", "Clinic B", "Patient", "Male"));
            await dbB.SaveChangesAsync();
        }

        // 2. Clinic A attempts to add surgical history to Clinic B's patient
        using (var dbA = CreateScopedDbContext(dbName, clinicA, "tenant-a"))
        {
            var (uowA, ctxA) = CreateUnitOfWorkAndContext(dbA, clinicA, "tenant-a");
            var handlerA = new AddPatientSurgicalHistoryCommandHandler(
                new Repository<Patient>(dbA, _sieveProcessor),
                new Repository<PatientSurgicalHistory>(dbA, _sieveProcessor),
                uowA,
                ctxA);

            var act = () => handlerA.Handle(new AddPatientSurgicalHistoryCommand(
                patientId,
                "Unauthorized Procedure",
                new DateOnly(2026, 1, 1)), CancellationToken.None);

            await act.Should().ThrowAsync<NotFoundException>("Cross-tenant surgical history creation must be rejected with NotFound");
        }
    }

    [Fact]
    public async Task MultiTenant_ClinicACannotUpdate_SurgicalHistory_OfClinicB_ThrowsNotFound()
    {
        var dbName = $"MT_Surg_Upd_{Guid.NewGuid()}";
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var surgId = Guid.NewGuid();

        // 1. Surgery belongs to Clinic B
        using (var dbB = CreateScopedDbContext(dbName, clinicB, "tenant-b"))
        {
            dbB.Patients.Add(CreatePatient(patientId, clinicB, "tenant-b", "B", "Patient", "Male"));
            dbB.PatientSurgicalHistories.Add(new PatientSurgicalHistory
            {
                Id = surgId,
                ClinicId = clinicB,
                TenantId = "tenant-b",
                PatientId = patientId,
                ProcedureName = "Original Procedure",
                SurgeryDate = new DateOnly(2025, 1, 1)
            });
            await dbB.SaveChangesAsync();
        }

        // 2. Clinic A attempts to update Clinic B's surgery
        using (var dbA = CreateScopedDbContext(dbName, clinicA, "tenant-a"))
        {
            var (uowA, ctxA) = CreateUnitOfWorkAndContext(dbA, clinicA, "tenant-a");
            var handlerA = new UpdatePatientSurgicalHistoryCommandHandler(
                new Repository<PatientSurgicalHistory>(dbA, _sieveProcessor),
                uowA,
                ctxA);

            var act = () => handlerA.Handle(new UpdatePatientSurgicalHistoryCommand(
                surgId,
                patientId,
                "Tampered Procedure",
                new DateOnly(2025, 1, 1)), CancellationToken.None);

            await act.Should().ThrowAsync<NotFoundException>("Cross-tenant surgical history mutation must be rejected with NotFound");
        }
    }

    [Fact]
    public async Task MultiTenant_ClinicACannotDelete_SurgicalHistory_OfClinicB_ThrowsNotFound()
    {
        var dbName = $"MT_Surg_Del_{Guid.NewGuid()}";
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var surgId = Guid.NewGuid();

        // 1. Surgery belongs to Clinic B
        using (var dbB = CreateScopedDbContext(dbName, clinicB, "tenant-b"))
        {
            dbB.PatientSurgicalHistories.Add(new PatientSurgicalHistory
            {
                Id = surgId,
                ClinicId = clinicB,
                TenantId = "tenant-b",
                PatientId = patientId,
                ProcedureName = "Important Procedure",
                SurgeryDate = new DateOnly(2025, 1, 1)
            });
            await dbB.SaveChangesAsync();
        }

        // 2. Clinic A attempts to delete Clinic B's surgery
        using (var dbA = CreateScopedDbContext(dbName, clinicA, "tenant-a"))
        {
            var (uowA, ctxA) = CreateUnitOfWorkAndContext(dbA, clinicA, "tenant-a");
            var handlerA = new DeletePatientSurgicalHistoryCommandHandler(
                new Repository<PatientSurgicalHistory>(dbA, _sieveProcessor),
                uowA,
                ctxA);

            var act = () => handlerA.Handle(new DeletePatientSurgicalHistoryCommand(surgId, patientId), CancellationToken.None);

            await act.Should().ThrowAsync<NotFoundException>("Cross-tenant surgical deletion must be rejected with NotFound");
        }
    }

    [Fact]
    public async Task MultiTenant_ClinicACannotUpdate_SocialHistory_OfClinicBPatient_ThrowsNotFound()
    {
        var dbName = $"MT_Social_Upd_{Guid.NewGuid()}";
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        // 1. Patient in Clinic B
        using (var dbB = CreateScopedDbContext(dbName, clinicB, "tenant-b"))
        {
            dbB.Patients.Add(CreatePatient(patientId, clinicB, "tenant-b", "B", "Patient", "Male"));
            await dbB.SaveChangesAsync();
        }

        // 2. Clinic A attempts to update social history
        using (var dbA = CreateScopedDbContext(dbName, clinicA, "tenant-a"))
        {
            var (uowA, ctxA) = CreateUnitOfWorkAndContext(dbA, clinicA, "tenant-a");
            var handlerA = new UpdatePatientSocialHistoryCommandHandler(
                new Repository<Patient>(dbA, _sieveProcessor),
                new Repository<PatientSocialHistory>(dbA, _sieveProcessor),
                uowA,
                ctxA);

            var act = () => handlerA.Handle(new UpdatePatientSocialHistoryCommand(
                patientId,
                IsSmoker: true,
                PacksPerDay: 2), CancellationToken.None);

            await act.Should().ThrowAsync<NotFoundException>("Cross-tenant social history update must be rejected with NotFound");
        }
    }

    [Fact]
    public async Task MultiTenant_ClinicACannotUpdate_ReproductiveHistory_OfClinicBPatient_ThrowsNotFound()
    {
        var dbName = $"MT_Repro_Upd_{Guid.NewGuid()}";
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        // 1. Patient in Clinic B
        using (var dbB = CreateScopedDbContext(dbName, clinicB, "tenant-b"))
        {
            dbB.Patients.Add(CreatePatient(patientId, clinicB, "tenant-b", "B", "Patient", "Female"));
            await dbB.SaveChangesAsync();
        }

        // 2. Clinic A attempts to update reproductive history
        using (var dbA = CreateScopedDbContext(dbName, clinicA, "tenant-a"))
        {
            var (uowA, ctxA) = CreateUnitOfWorkAndContext(dbA, clinicA, "tenant-a");
            var handlerA = new UpdatePatientReproductiveHistoryCommandHandler(
                new Repository<Patient>(dbA, _sieveProcessor),
                new Repository<PatientReproductiveHistory>(dbA, _sieveProcessor),
                uowA,
                ctxA);

            var act = () => handlerA.Handle(new UpdatePatientReproductiveHistoryCommand(
                patientId,
                IsApplicable: true,
                MenarcheAge: 13), CancellationToken.None);

            await act.Should().ThrowAsync<NotFoundException>("Cross-tenant reproductive update must be rejected with NotFound");
        }
    }

    [Fact]
    public async Task MultiTenant_ClinicACannotSave_NcdRiskAssessment_OfClinicBPatient_ThrowsNotFound()
    {
        var dbName = $"MT_Ncd_Save_{Guid.NewGuid()}";
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        // 1. Patient in Clinic B
        using (var dbB = CreateScopedDbContext(dbName, clinicB, "tenant-b"))
        {
            dbB.Patients.Add(CreatePatient(patientId, clinicB, "tenant-b", "B", "Patient", "Male"));
            await dbB.SaveChangesAsync();
        }

        // 2. Clinic A attempts to save NCD risk assessment
        using (var dbA = CreateScopedDbContext(dbName, clinicA, "tenant-a"))
        {
            var (uowA, ctxA) = CreateUnitOfWorkAndContext(dbA, clinicA, "tenant-a");
            var handlerA = new SaveNcdRiskAssessmentCommandHandler(
                new Repository<Patient>(dbA, _sieveProcessor),
                new Repository<NcdRiskAssessment>(dbA, _sieveProcessor),
                uowA,
                ctxA);

            var act = () => handlerA.Handle(new SaveNcdRiskAssessmentCommand(
                patientId,
                RiskBand: "BandD"), CancellationToken.None);

            await act.Should().ThrowAsync<NotFoundException>("Cross-tenant NCD assessment creation must be rejected with NotFound");
        }
    }

    // =========================================================================
    // 3. Backward Compatibility & Lazy Ingestion Challenges
    // =========================================================================

    [Fact]
    public async Task Relational_SurgicalHistories_QueriedDirectly_FromTable()
    {
        var dbName = $"Relational_Surg_{Guid.NewGuid()}";
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-test";
        var patientId = Guid.NewGuid();

        using (var db = CreateScopedDbContext(dbName, clinicId, tenantId))
        {
            db.Patients.Add(CreatePatient(patientId, clinicId, tenantId, "Rosa", "Alvarez", "Female"));
            db.PatientSurgicalHistories.AddRange(
                new PatientSurgicalHistory
                {
                    Id = Guid.NewGuid(),
                    ClinicId = clinicId,
                    TenantId = tenantId,
                    PatientId = patientId,
                    ProcedureName = "Appendectomy",
                    SurgeryDate = new DateOnly(2018, 5, 12)
                },
                new PatientSurgicalHistory
                {
                    Id = Guid.NewGuid(),
                    ClinicId = clinicId,
                    TenantId = tenantId,
                    PatientId = patientId,
                    ProcedureName = "Cholecystectomy",
                    SurgeryDate = new DateOnly(2021, 9, 20)
                });
            await db.SaveChangesAsync();
        }

        using (var db = CreateScopedDbContext(dbName, clinicId, tenantId))
        {
            var repo = new Repository<PatientSurgicalHistory>(db, _sieveProcessor);
            var handler = new GetPatientSurgicalHistoriesQueryHandler(repo);

            var results = await handler.Handle(new GetPatientSurgicalHistoriesQuery(patientId), CancellationToken.None);

            results.Should().HaveCount(2);
            results.Select(s => s.ProcedureName).Should().Contain("Appendectomy", "Cholecystectomy");

            var dbEntries = await db.PatientSurgicalHistories.Where(s => s.PatientId == patientId).ToListAsync();
            dbEntries.Should().HaveCount(2);
            dbEntries.All(e => e.ClinicId == clinicId && e.TenantId == tenantId).Should().BeTrue();
        }
    }

    [Fact]
    public async Task Relational_SocialHistory_QueriedDirectly_FromTable()
    {
        var dbName = $"Relational_Social_{Guid.NewGuid()}";
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-test";
        var patientId = Guid.NewGuid();

        using (var db = CreateScopedDbContext(dbName, clinicId, tenantId))
        {
            db.Patients.Add(CreatePatient(patientId, clinicId, tenantId, "Mateo", "Cruz", "Male"));
            db.PatientSocialHistories.Add(new PatientSocialHistory
            {
                Id = Guid.NewGuid(),
                ClinicId = clinicId,
                TenantId = tenantId,
                PatientId = patientId,
                IsSmoker = true,
                CigarettesPerDay = 20,
                PacksPerDay = 1.0m,
                IsAlcoholDrinker = true,
                AlcoholBottlesPerDay = 3,
                UsesIllicitDrugs = false,
                IsSexuallyActive = true
            });
            await db.SaveChangesAsync();
        }

        using (var db = CreateScopedDbContext(dbName, clinicId, tenantId))
        {
            var repo = new Repository<PatientSocialHistory>(db, _sieveProcessor);
            var handler = new GetPatientSocialHistoryQueryHandler(repo);

            var result = await handler.Handle(new GetPatientSocialHistoryQuery(patientId), CancellationToken.None);

            result.Should().NotBeNull();
            result!.IsSmoker.Should().BeTrue();
            result.CigarettesPerDay.Should().Be(20);
            result.PacksPerDay.Should().Be(1.0m);
            result.IsAlcoholDrinker.Should().BeTrue();
            result.AlcoholBottlesPerDay.Should().Be(3);
            result.UsesIllicitDrugs.Should().BeFalse();
            result.IsSexuallyActive.Should().BeTrue();

            var entity = await db.PatientSocialHistories.FirstOrDefaultAsync(s => s.PatientId == patientId);
            entity.Should().NotBeNull();
            entity!.ClinicId.Should().Be(clinicId);
        }
    }

    [Fact]
    public async Task Relational_ReproductiveHistory_QueriedDirectly_FromTable()
    {
        var dbName = $"Relational_Repro_{Guid.NewGuid()}";
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-test";
        var patientId = Guid.NewGuid();

        using (var db = CreateScopedDbContext(dbName, clinicId, tenantId))
        {
            db.Patients.Add(CreatePatient(patientId, clinicId, tenantId, "Maria", "Makiling", "Female"));
            db.PatientReproductiveHistories.Add(new PatientReproductiveHistory
            {
                Id = Guid.NewGuid(),
                ClinicId = clinicId,
                TenantId = tenantId,
                PatientId = patientId,
                IsApplicable = true,
                MenarcheAge = 13,
                LastMenstrualPeriod = new DateOnly(2026, 9, 1),
                PeriodDurationDays = 5,
                Gravidity = 2,
                Parity = 2,
                DeliveryType = "Vaginal"
            });
            await db.SaveChangesAsync();
        }

        using (var db = CreateScopedDbContext(dbName, clinicId, tenantId))
        {
            var repo = new Repository<PatientReproductiveHistory>(db, _sieveProcessor);
            var handler = new GetPatientReproductiveHistoryQueryHandler(repo);

            var result = await handler.Handle(new GetPatientReproductiveHistoryQuery(patientId), CancellationToken.None);

            result.Should().NotBeNull();
            result!.IsApplicable.Should().BeTrue();
            result.MenarcheAge.Should().Be(13);
            result.LastMenstrualPeriod.Should().Be(new DateOnly(2026, 9, 1));
            result.PeriodDurationDays.Should().Be(5);
            result.Gravidity.Should().Be(2);
            result.Parity.Should().Be(2);
            result.DeliveryType.Should().Be("Vaginal");

            var entity = await db.PatientReproductiveHistories.FirstOrDefaultAsync(r => r.PatientId == patientId);
            entity.Should().NotBeNull();
            entity!.ClinicId.Should().Be(clinicId);
        }
    }

    [Fact]
    public async Task Relational_NcdRiskAssessment_QueriedDirectly_FromTable()
    {
        var dbName = $"Relational_Ncd_{Guid.NewGuid()}";
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-test";
        var patientId = Guid.NewGuid();

        using (var db = CreateScopedDbContext(dbName, clinicId, tenantId))
        {
            db.Patients.Add(CreatePatient(patientId, clinicId, tenantId, "Danilo", "Ramos", "Male"));
            db.NcdRiskAssessments.Add(new NcdRiskAssessment
            {
                Id = Guid.NewGuid(),
                ClinicId = clinicId,
                TenantId = tenantId,
                PatientId = patientId,
                AssessmentDate = DateTime.UtcNow,
                EatsProcessedFoodWeekly = true,
                ThreeServingsVegetablesDaily = false,
                PhysicalActivityAtLeast150MinsWeekly = true,
                DiagnosedDiabetes = "Y",
                RiskBand = "BandC",
                FastingBloodSugarMgDl = 135.5m,
                TotalCholesterolMgDl = 220.0m
            });
            await db.SaveChangesAsync();
        }

        using (var db = CreateScopedDbContext(dbName, clinicId, tenantId))
        {
            var repo = new Repository<NcdRiskAssessment>(db, _sieveProcessor);
            var handler = new GetPatientNcdRiskAssessmentsQueryHandler(repo);

            var results = await handler.Handle(new GetPatientNcdRiskAssessmentsQuery(patientId), CancellationToken.None);

            results.Should().HaveCount(1);
            var ncd = results[0];
            ncd.EatsProcessedFoodWeekly.Should().BeTrue();
            ncd.ThreeServingsVegetablesDaily.Should().BeFalse();
            ncd.PhysicalActivityAtLeast150MinsWeekly.Should().BeTrue();
            ncd.DiagnosedDiabetes.Should().Be("Y");
            ncd.RiskBand.Should().Be("BandC");
            ncd.FastingBloodSugarMgDl.Should().Be(135.5m);
            ncd.TotalCholesterolMgDl.Should().Be(220.0m);

            var entity = await db.NcdRiskAssessments.FirstOrDefaultAsync(n => n.PatientId == patientId);
            entity.Should().NotBeNull();
            entity!.ClinicId.Should().Be(clinicId);
        }
    }

    [Fact]
    public async Task Relational_Idempotent_MultipleQueryCallsDoNotDuplicateRows()
    {
        var dbName = $"Relational_Idempotent_{Guid.NewGuid()}";
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-test";
        var patientId = Guid.NewGuid();

        using (var db = CreateScopedDbContext(dbName, clinicId, tenantId))
        {
            db.Patients.Add(CreatePatient(patientId, clinicId, tenantId, "Jose", "Rizal", "Male"));
            db.PatientSurgicalHistories.Add(new PatientSurgicalHistory
            {
                Id = Guid.NewGuid(),
                ClinicId = clinicId,
                TenantId = tenantId,
                PatientId = patientId,
                ProcedureName = "Hernia Repair",
                SurgeryDate = new DateOnly(2020, 3, 10)
            });
            db.PatientSocialHistories.Add(new PatientSocialHistory
            {
                Id = Guid.NewGuid(),
                ClinicId = clinicId,
                TenantId = tenantId,
                PatientId = patientId,
                IsSmoker = false,
                IsAlcoholDrinker = false
            });
            db.NcdRiskAssessments.Add(new NcdRiskAssessment
            {
                Id = Guid.NewGuid(),
                ClinicId = clinicId,
                TenantId = tenantId,
                PatientId = patientId,
                AssessmentDate = DateTime.UtcNow,
                RiskBand = "BandA"
            });
            await db.SaveChangesAsync();
        }

        using (var db = CreateScopedDbContext(dbName, clinicId, tenantId))
        {
            var surgRepo = new Repository<PatientSurgicalHistory>(db, _sieveProcessor);
            var socialRepo = new Repository<PatientSocialHistory>(db, _sieveProcessor);
            var ncdRepo = new Repository<NcdRiskAssessment>(db, _sieveProcessor);

            var surgHandler = new GetPatientSurgicalHistoriesQueryHandler(surgRepo);
            var socialHandler = new GetPatientSocialHistoryQueryHandler(socialRepo);
            var ncdHandler = new GetPatientNcdRiskAssessmentsQueryHandler(ncdRepo);

            // Execute 3 times consecutively
            for (int i = 0; i < 3; i++)
            {
                await surgHandler.Handle(new GetPatientSurgicalHistoriesQuery(patientId), CancellationToken.None);
                await socialHandler.Handle(new GetPatientSocialHistoryQuery(patientId), CancellationToken.None);
                await ncdHandler.Handle(new GetPatientNcdRiskAssessmentsQuery(patientId), CancellationToken.None);
            }

            // Total counts in relational tables must remain strictly 1
            (await db.PatientSurgicalHistories.CountAsync(s => s.PatientId == patientId)).Should().Be(1);
            (await db.PatientSocialHistories.CountAsync(s => s.PatientId == patientId)).Should().Be(1);
            (await db.NcdRiskAssessments.CountAsync(n => n.PatientId == patientId)).Should().Be(1);
        }
    }

    [Fact]
    public async Task Relational_HandlesEmptyRelationalTables_WithoutException()
    {
        var dbName = $"Relational_Defensive_{Guid.NewGuid()}";
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-test";
        var patient1 = Guid.NewGuid();

        using (var db = CreateScopedDbContext(dbName, clinicId, tenantId))
        {
            db.Patients.Add(CreatePatient(patient1, clinicId, tenantId, "No", "Records", "Female"));
            await db.SaveChangesAsync();
        }

        using (var db = CreateScopedDbContext(dbName, clinicId, tenantId))
        {
            var repo = new Repository<PatientSurgicalHistory>(db, _sieveProcessor);
            var handler = new GetPatientSurgicalHistoriesQueryHandler(repo);

            var res1 = await handler.Handle(new GetPatientSurgicalHistoriesQuery(patient1), CancellationToken.None);
            res1.Should().BeEmpty();
        }
    }

    // =========================================================================
    // 4. Male Reproductive Guard Challenges
    // =========================================================================

    [Fact]
    public async Task MaleReproductiveGuard_UpdateCommand_ForcesApplicableFalse_AndStripsData()
    {
        var dbName = $"Male_Guard_{Guid.NewGuid()}";
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-male";
        var patientId = Guid.NewGuid();

        // 1. Male Patient
        using (var db = CreateScopedDbContext(dbName, clinicId, tenantId))
        {
            db.Patients.Add(CreatePatient(patientId, clinicId, tenantId, "Juan", "Crisostomo", "Male"));
            await db.SaveChangesAsync();
        }

        // 2. Clinician submits UpdatePatientReproductiveHistoryCommand with full female data
        using (var db = CreateScopedDbContext(dbName, clinicId, tenantId))
        {
            var (uow, ctx) = CreateUnitOfWorkAndContext(db, clinicId, tenantId);
            var handler = new UpdatePatientReproductiveHistoryCommandHandler(
                new Repository<Patient>(db, _sieveProcessor),
                new Repository<PatientReproductiveHistory>(db, _sieveProcessor),
                uow,
                ctx);

            var command = new UpdatePatientReproductiveHistoryCommand(
                PatientId: patientId,
                IsApplicable: true,
                MenarcheAge: 12,
                LastMenstrualPeriod: new DateOnly(2026, 9, 15),
                PeriodDurationDays: 5,
                CycleIntervalDays: 28,
                PadsPerDay: 4,
                IsMenopausal: true,
                MenopauseAge: 50,
                ContraceptiveMethod: "IUD",
                Gravidity: 3,
                Parity: 2,
                TermBirths: 2,
                DeliveryType: "Cesarean",
                HadPreEclampsiaHypertension: true,
                ReceivedFamilyPlanningCounseling: true);

            var result = await handler.Handle(command, CancellationToken.None);

            // DTO must strictly guard and strip all female reproductive attributes
            result.IsApplicable.Should().BeFalse("Male patients must have IsApplicable forced to false");
            result.MenarcheAge.Should().BeNull();
            result.LastMenstrualPeriod.Should().BeNull();
            result.PeriodDurationDays.Should().BeNull();
            result.CycleIntervalDays.Should().BeNull();
            result.PadsPerDay.Should().BeNull();
            result.IsMenopausal.Should().BeFalse();
            result.MenopauseAge.Should().BeNull();
            result.ContraceptiveMethod.Should().BeNull();
            result.Gravidity.Should().Be(0);
            result.Parity.Should().Be(0);
            result.TermBirths.Should().Be(0);
            result.DeliveryType.Should().Be("NotApplicable");
            result.HadPreEclampsiaHypertension.Should().BeFalse();
            result.ReceivedFamilyPlanningCounseling.Should().BeFalse();

            // Underlying database entity must also be stripped
            var entity = await db.PatientReproductiveHistories.FirstOrDefaultAsync(r => r.PatientId == patientId);
            entity.Should().NotBeNull();
            entity!.IsApplicable.Should().BeFalse();
            entity.MenarcheAge.Should().BeNull();
            entity.Gravidity.Should().Be(0);
        }
    }

    [Fact]
    public async Task MaleReproductiveGuard_DirectPersistence_ForcesApplicableFalse_ForMalePatient()
    {
        var dbName = $"Male_Direct_Guard_{Guid.NewGuid()}";
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-male";
        var patientId = Guid.NewGuid();

        using (var db = CreateScopedDbContext(dbName, clinicId, tenantId))
        {
            db.Patients.Add(CreatePatient(patientId, clinicId, tenantId, "Emilio", "Aguinaldo", "Male"));
            await db.SaveChangesAsync();
        }

        using (var db = CreateScopedDbContext(dbName, clinicId, tenantId))
        {
            var (uow, ctx) = CreateUnitOfWorkAndContext(db, clinicId, tenantId);
            var handler = new UpdatePatientReproductiveHistoryCommandHandler(
                new Repository<Patient>(db, _sieveProcessor),
                new Repository<PatientReproductiveHistory>(db, _sieveProcessor),
                uow,
                ctx);

            var command = new UpdatePatientReproductiveHistoryCommand(
                PatientId: patientId,
                IsApplicable: true,
                MenarcheAge: 14,
                Gravidity: 1,
                Parity: 1);

            await handler.Handle(command, CancellationToken.None);

            var entity = await db.PatientReproductiveHistories.FirstOrDefaultAsync(r => r.PatientId == patientId);
            entity.Should().NotBeNull();
            entity!.IsApplicable.Should().BeFalse("Male patients must have IsApplicable forced to false");
        }
    }

    [Fact]
    public async Task FemalePatient_PreservesReproductiveData_WhenUpdated()
    {
        var dbName = $"Female_Preserve_{Guid.NewGuid()}";
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-female";
        var patientId = Guid.NewGuid();

        // Female patient
        using (var db = CreateScopedDbContext(dbName, clinicId, tenantId))
        {
            db.Patients.Add(CreatePatient(patientId, clinicId, tenantId, "Gabriela", "Silang", "Female"));
            await db.SaveChangesAsync();
        }

        // Updating female patient preserves all parameters
        using (var db = CreateScopedDbContext(dbName, clinicId, tenantId))
        {
            var (uow, ctx) = CreateUnitOfWorkAndContext(db, clinicId, tenantId);
            var handler = new UpdatePatientReproductiveHistoryCommandHandler(
                new Repository<Patient>(db, _sieveProcessor),
                new Repository<PatientReproductiveHistory>(db, _sieveProcessor),
                uow,
                ctx);

            var command = new UpdatePatientReproductiveHistoryCommand(
                PatientId: patientId,
                IsApplicable: true,
                MenarcheAge: 12,
                LastMenstrualPeriod: new DateOnly(2026, 9, 20),
                PeriodDurationDays: 5,
                CycleIntervalDays: 30,
                PadsPerDay: 3,
                ContraceptiveMethod: "Injectable Depo",
                Gravidity: 1,
                Parity: 1,
                TermBirths: 1,
                LivingChildren: 1,
                DeliveryType: "Normal Spontaneous Vaginal");

            var result = await handler.Handle(command, CancellationToken.None);

            result.IsApplicable.Should().BeTrue();
            result.MenarcheAge.Should().Be(12);
            result.LastMenstrualPeriod.Should().Be(new DateOnly(2026, 9, 20));
            result.PeriodDurationDays.Should().Be(5);
            result.CycleIntervalDays.Should().Be(30);
            result.PadsPerDay.Should().Be(3);
            result.ContraceptiveMethod.Should().Be("Injectable Depo");
            result.Gravidity.Should().Be(1);
            result.Parity.Should().Be(1);
            result.DeliveryType.Should().Be("Normal Spontaneous Vaginal");
        }
    }
}
