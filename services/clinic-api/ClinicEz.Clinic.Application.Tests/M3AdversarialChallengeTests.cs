using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Consultations.Commands;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Services;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public sealed class M3AdversarialChallengeTests
{
    [Fact]
    public async Task SequenceRollover_NewEffectiveYear_ResetsCounterToOne()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_rollover_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);
        var generator = new PhilHealthSequenceGenerator(dbContext, NullLogger<PhilHealthSequenceGenerator>.Instance);

        // Act - Sequence generation across distinct effective years / dates
        var case2025_1 = await generator.GenerateCaseNumberAsync(tenantId, clinicId, "H00000921", "2025");
        var case2025_2 = await generator.GenerateCaseNumberAsync(tenantId, clinicId, "H00000921", "2025");

        // Sequence rollover to year 2026
        var case2026_1 = await generator.GenerateCaseNumberAsync(tenantId, clinicId, "H00000921", "2026");
        var case2026_2 = await generator.GenerateCaseNumberAsync(tenantId, clinicId, "H00000921", "2026");

        // Back to 2025 - should resume 2025 sequence
        var case2025_3 = await generator.GenerateCaseNumberAsync(tenantId, clinicId, "H00000921", "2025");

        // Assert - 23B PCAPI format: C + Accre(9) + yyyyMMdd(8) + seq(5)
        case2025_1.Should().HaveLength(23).And.StartWith("CH000009212025").And.EndWith("00001");
        case2025_2.Should().HaveLength(23).And.StartWith("CH000009212025").And.EndWith("00002");

        case2026_1.Should().HaveLength(23).And.StartWith("CH000009212026").And.EndWith("00001");
        case2026_2.Should().HaveLength(23).And.StartWith("CH000009212026").And.EndWith("00002");

        case2025_3.Should().HaveLength(23).And.StartWith("CH000009212025").And.EndWith("00003");
    }

    [Fact]
    public async Task SequenceRollover_DifferentClinicsAndTenants_MaintainIndependentSequences()
    {
        // Arrange
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        var tenant1 = "tenant_alpha";

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicA);
        clinicContext.TenantId.Returns(tenant1);

        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);
        var generator = new PhilHealthSequenceGenerator(dbContext, NullLogger<PhilHealthSequenceGenerator>.Instance);

        // Act
        var t1_cA_1 = await generator.GenerateTransactionNumberAsync(tenant1, clinicA, PhilHealthSequenceType.Consultation, "H00000921", "2026");
        var t1_cA_2 = await generator.GenerateTransactionNumberAsync(tenant1, clinicA, PhilHealthSequenceType.Consultation, "H00000921", "2026");

        // Clinic B in Tenant 1 should start at 1
        var t1_cB_1 = await generator.GenerateTransactionNumberAsync(tenant1, clinicB, PhilHealthSequenceType.Consultation, "H00000921", "2026");

        // Assert
        t1_cA_1.Should().HaveLength(23).And.StartWith("SH000009212026").And.EndWith("00001");
        t1_cA_2.Should().HaveLength(23).And.StartWith("SH000009212026").And.EndWith("00002");
        t1_cB_1.Should().HaveLength(23).And.StartWith("SH000009212026").And.EndWith("00001");
    }

    [Theory]
    [InlineData("H00000921", "CH00000921")]
    [InlineData("NCR-123456", "CNCR123456")]
    [InlineData("921", "C000000921")]
    [InlineData(null, "CH00000001")]
    [InlineData("", "CH00000001")]
    public async Task SequenceFormatting_SanitizesAccreditationVariousFormats(string? rawAccreditation, string expectedPrefix)
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_sanitization_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);
        var generator = new PhilHealthSequenceGenerator(dbContext, NullLogger<PhilHealthSequenceGenerator>.Instance);

        // Act
        var caseNo = await generator.GenerateCaseNumberAsync(tenantId, clinicId, rawAccreditation!, "2026");

        // Assert
        caseNo.Should().HaveLength(23);
        caseNo.Should().StartWith(expectedPrefix);
        caseNo.Should().EndWith("00001");
    }

    [Fact]
    public async Task SequenceFormatting_HighSequenceNumbers_RollsOverPast99999Cleanly()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_high_seq";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);
        var generator = new PhilHealthSequenceGenerator(dbContext, NullLogger<PhilHealthSequenceGenerator>.Instance);

        var manilaToday = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(8));
        var year = manilaToday.Year.ToString();
        var tracker = new PhilHealthDailySequence
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            AccreditationNo = "000000921",
            Prefix = "C",
            ManilaDate = manilaToday,
            LastValue = 99998
        };
        dbContext.PhilHealthDailySequences.Add(tracker);
        await dbContext.SaveChangesAsync();

        // Act
        var seq99999 = await generator.GenerateCaseNumberAsync(tenantId, clinicId, "000921", year);
        var seq100000 = await generator.GenerateCaseNumberAsync(tenantId, clinicId, "000921", year);

        // Assert
        seq99999.Should().Be($"C000000921{manilaToday:yyyyMMdd}99999");
        seq100000.Should().Be($"C000000921{manilaToday:yyyyMMdd}100000");
    }

    [Fact]
    public async Task PhysicalExamFindings_PersistAcrossMultipleUpdates()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_pe_persist";
        var encounterId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var consultationRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var diagnosisRepo = TestDbHelper.CreateRepository<EncounterDiagnosis>(context, sieve);
        var prescriptionRepo = TestDbHelper.CreateRepository<PrescriptionItem>(context, sieve);

        var initialFindings = new NineSystemPhysicalExamFindings
        {
            Skin = new SystemExamFinding(true, null),
            Heent = new SystemExamFinding(true, null),
            Chest = new SystemExamFinding(true, null),
            Heart = new SystemExamFinding(true, null),
            Abdomen = new SystemExamFinding(true, null),
            Neuro = new SystemExamFinding(true, null),
            Rectal = new SystemExamFinding(true, null),
            Gu = new SystemExamFinding(true, null),
            Musculoskeletal = new SystemExamFinding(true, null)
        };

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Test Patient",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Test",
            IsYakapEligible = true
        };
        encounter.SetPhysicalExamFindings(initialFindings);
        await context.Consultations.AddAsync(encounter);
        await context.SaveChangesAsync();

        var handler = new UpdateConsultationCommandHandler(
            consultationRepo,
            diagnosisRepo,
            prescriptionRepo,
            uow,
            clinicContext);

        // Update 1: Clinician marks Musculoskeletal as Abnormal with remarks
        var updatedFindings1 = new NineSystemPhysicalExamFindings
        {
            Skin = new SystemExamFinding(true, null),
            Heent = new SystemExamFinding(true, null),
            Chest = new SystemExamFinding(true, null),
            Heart = new SystemExamFinding(true, null),
            Abdomen = new SystemExamFinding(true, null),
            Neuro = new SystemExamFinding(true, null),
            Rectal = new SystemExamFinding(true, null),
            Gu = new SystemExamFinding(true, null),
            Musculoskeletal = new SystemExamFinding(false, "Tenderness right shoulder on abduction")
        };

        var command1 = new UpdateConsultationCommand(
            Id: encounterId,
            Subjective: null,
            Objective: null,
            Assessment: null,
            Plan: null,
            Diagnoses: null,
            Prescriptions: null,
            PhysicalExamFindingsJson: System.Text.Json.JsonSerializer.Serialize(updatedFindings1));

        await handler.Handle(command1, CancellationToken.None);

        // Verify state after update 1
        var saved1 = await context.Consultations.FirstAsync(c => c.Id == encounterId);
        var parsed1 = saved1.GetPhysicalExamFindings();
        parsed1.Should().NotBeNull();
        parsed1!.AllEssentiallyNormal.Should().BeFalse();
        parsed1.Musculoskeletal.IsNormal.Should().BeFalse();
        parsed1.Musculoskeletal.Remarks.Should().Be("Tenderness right shoulder on abduction");
        parsed1.Skin.IsNormal.Should().BeTrue();

        // Update 2: Clinician clears Musculoskeletal back to Normal and flags Skin as Abnormal
        var updatedFindings2 = new NineSystemPhysicalExamFindings
        {
            Skin = new SystemExamFinding(false, "Maculopapular rash on bilateral arms"),
            Heent = new SystemExamFinding(true, null),
            Chest = new SystemExamFinding(true, null),
            Heart = new SystemExamFinding(true, null),
            Abdomen = new SystemExamFinding(true, null),
            Neuro = new SystemExamFinding(true, null),
            Rectal = new SystemExamFinding(true, null),
            Gu = new SystemExamFinding(true, null),
            Musculoskeletal = new SystemExamFinding(true, null) // cleared
        };

        var command2 = new UpdateConsultationCommand(
            Id: encounterId,
            Subjective: null,
            Objective: null,
            Assessment: null,
            Plan: null,
            Diagnoses: null,
            Prescriptions: null,
            PhysicalExamFindingsJson: System.Text.Json.JsonSerializer.Serialize(updatedFindings2));

        await handler.Handle(command2, CancellationToken.None);

        // Verify state after update 2
        var saved2 = await context.Consultations.FirstAsync(c => c.Id == encounterId);
        var parsed2 = saved2.GetPhysicalExamFindings();
        parsed2.Should().NotBeNull();
        parsed2!.AllEssentiallyNormal.Should().BeFalse();
        parsed2.Skin.IsNormal.Should().BeFalse();
        parsed2.Skin.Remarks.Should().Be("Maculopapular rash on bilateral arms");
        parsed2.Musculoskeletal.IsNormal.Should().BeTrue();
        parsed2.Musculoskeletal.Remarks.Should().BeNull();
    }

    [Fact]
    public void PhysicalExamFindings_AllEssentiallyNormal_ComputedPropertyEvaluatesAllNineSystems()
    {
        // 1. All normal
        var findings = new NineSystemPhysicalExamFindings();
        findings.AllEssentiallyNormal.Should().BeTrue();

        // 2. Each of the 9 systems tested individually when abnormal
        findings.Skin.IsNormal = false;
        findings.AllEssentiallyNormal.Should().BeFalse();
        findings.Skin.IsNormal = true;

        findings.Heent.IsNormal = false;
        findings.AllEssentiallyNormal.Should().BeFalse();
        findings.Heent.IsNormal = true;

        findings.Chest.IsNormal = false;
        findings.AllEssentiallyNormal.Should().BeFalse();
        findings.Chest.IsNormal = true;

        findings.Heart.IsNormal = false;
        findings.AllEssentiallyNormal.Should().BeFalse();
        findings.Heart.IsNormal = true;

        findings.Abdomen.IsNormal = false;
        findings.AllEssentiallyNormal.Should().BeFalse();
        findings.Abdomen.IsNormal = true;

        findings.Neuro.IsNormal = false;
        findings.AllEssentiallyNormal.Should().BeFalse();
        findings.Neuro.IsNormal = true;

        findings.Rectal.IsNormal = false;
        findings.AllEssentiallyNormal.Should().BeFalse();
        findings.Rectal.IsNormal = true;

        findings.Gu.IsNormal = false;
        findings.AllEssentiallyNormal.Should().BeFalse();
        findings.Gu.IsNormal = true;

        findings.Musculoskeletal.IsNormal = false;
        findings.AllEssentiallyNormal.Should().BeFalse();
        findings.Musculoskeletal.IsNormal = true;

        findings.AllEssentiallyNormal.Should().BeTrue();
    }

    [Fact]
    public async Task AssignPatientJourneyNumbersAsync_LinksHciCaseNoHciTransNoAndSoapTransNoAcrossEncounter()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_journey_link";
        var patientId = Guid.NewGuid();
        var encounterId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);
        var generator = new PhilHealthSequenceGenerator(dbContext, NullLogger<PhilHealthSequenceGenerator>.Instance);

        var patient = new Patient
        {
            Id = patientId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-2026-00042",
            FirstName = "Andres",
            LastName = "Bonifacio",
            ContactNumber = "09181234567",
            PhilHealthNumber = "030263078508",
            DateOfBirth = new DateOnly(1980, 11, 30)
        };
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 10),
            ValidUntil = new DateOnly(2026, 12, 31),
            Status = YakapEnlistmentStatus.Active,
            Source = YakapEnlistmentSource.AssistedIntake
        });
        dbContext.Patients.Add(patient);

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Andres Bonifacio",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Emilio Jacinto",
            IsYakapEligible = true,
            EncounterDate = new DateTime(2026, 10, 15, 0, 0, 0, DateTimeKind.Utc)
        };
        dbContext.Consultations.Add(encounter);
        await dbContext.SaveChangesAsync();

        // Act
        var journey = await generator.AssignPatientJourneyNumbersAsync(
            tenantId,
            clinicId,
            patientId,
            encounterId,
            "H00000921",
            "2026");

        // Assert
        journey.CaseNumber.Should().Be("CH000009212026101500001");
        journey.ProfilingTransactionNumber.Should().Be("PH000009212026101500001");
        journey.SoapTransactionNumber.Should().Be("SH000009212026101500001");

        // Verify encounter entity fields were updated and linked
        encounter.PhilHealthCaseNo.Should().Be("CH000009212026101500001");
        encounter.PhilHealthSoapTransNo.Should().Be("SH000009212026101500001");
    }
}
