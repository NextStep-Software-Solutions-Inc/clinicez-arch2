using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Patients.Queries;

public class GetPatientChartQueryHandlerTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_chart_test";

    public GetPatientChartQueryHandlerTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
    }

    [Fact]
    public async Task Handle_WithVerifiedPatient_ReturnsFullDemographicsAndCollections()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var triageRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var problemRepo = TestDbHelper.CreateRepository<PatientProblem>(context, sieve);
        var allergyRepo = TestDbHelper.CreateRepository<PatientAllergy>(context, sieve);
        var immRepo = TestDbHelper.CreateRepository<PatientImmunization>(context, sieve);
        var attachRepo = TestDbHelper.CreateRepository<ClinicRecordAttachment>(context, sieve);

        var patientId = Guid.NewGuid();
        var patient = new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-00099",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            MiddleName = "Mercado",
            Suffix = "Jr.",
            DateOfBirth = new DateOnly(1985, 8, 20),
            Gender = "Male",
            CivilStatus = "Married",
            ContactNumber = "09171234567",
            Email = "juan@example.com",
            PhilHealthNumber = "12-345678901-8",
            SeniorCitizenId = null,
            PwdId = "PWD-12345",
            BloodType = "O+",
            PhilHealthCaseNo = "CASE-99999"
        };
        await patientRepo.AddAsync(patient, CancellationToken.None);

        // Problem
        var problem = new PatientProblem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            Icd10Code = "I10",
            ProblemTitle = "Essential (primary) hypertension",
            Status = ProblemStatus.Active,
            Severity = ProblemSeverity.Moderate,
            IsChronicNcd = true,
            OnsetDate = new DateOnly(2020, 1, 15),
            RecordedByDoctorId = Guid.NewGuid(),
            RecordedByDoctorName = "Dr. Jose Santos"
        };
        await problemRepo.AddAsync(problem, CancellationToken.None);

        // Allergies (one mild, one anaphylactic)
        var mildAllergy = new PatientAllergy
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            Category = AllergyCategory.Food,
            Allergen = "Shrimp",
            Severity = AllergySeverity.Mild,
            IsAnaphylactic = false,
            Status = AllergyStatus.Active
        };
        var severeAllergy = new PatientAllergy
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            Category = AllergyCategory.Medication,
            Allergen = "Penicillin",
            Severity = AllergySeverity.LifeThreatening,
            IsAnaphylactic = true,
            Status = AllergyStatus.Active
        };
        await allergyRepo.AddAsync(mildAllergy, CancellationToken.None);
        await allergyRepo.AddAsync(severeAllergy, CancellationToken.None);

        // Immunization
        var imm = new PatientImmunization
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Juan Dela Cruz",
            PhilHealthLibrary = "lib_immchild",
            PhilHealthCode = "C01",
            VaccineName = "BCG Vaccine",
            LotBatchNumber = "LOT-123",
            ExpirationDate = new DateOnly(2028, 1, 1),
            DoseSequence = 1,
            AdministeredAtUtc = DateTime.UtcNow,
            AdministeredByStaffId = Guid.NewGuid(),
            AdministeredByStaffName = "Nurse Joy"
        };
        await immRepo.AddAsync(imm, CancellationToken.None);

        // Attachment
        var attach = new ClinicRecordAttachment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            RecordType = "LabReport",
            Title = "Complete Blood Count",
            FileName = "cbc.pdf",
            ContentType = "application/pdf",
            FileSizeBytes = 10240,
            StorageUri = "https://storage.clinicez.ph/records/cbc.pdf",
            DocumentDate = new DateOnly(2026, 10, 1),
            VerificationStatus = "Verified"
        };
        await attachRepo.AddAsync(attach, CancellationToken.None);

        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetPatientChartQueryHandler(
            consultRepo, triageRepo, procRepo, labRepo, invoiceRepo, _clinicContext,
            patientRepo: patientRepo,
            problemRepo: problemRepo,
            allergyRepo: allergyRepo,
            immunizationRepo: immRepo,
            attachmentRepo: attachRepo);

        // Act
        var chart = await handler.Handle(new GetPatientChartQuery(patientId), CancellationToken.None);

        // Assert
        chart.Should().NotBeNull();
        chart.PatientId.Should().Be(patientId);
        chart.PatientName.Should().Be("Dela Cruz, Juan M. Jr.");

        // Demographics
        chart.Demographics.Should().NotBeNull();
        chart.Demographics!.Dob.Should().Be(new DateOnly(1985, 8, 20));
        chart.Demographics.Gender.Should().Be("Male");
        chart.Demographics.ContactNumber.Should().Be("09171234567");
        chart.Demographics.PhilHealthNumber.Should().Be("12-345678901-8");
        chart.Demographics.BloodType.Should().Be("O+");
        chart.Demographics.MemberStatus.Should().Be("Member");
        chart.Demographics.ActiveCaseNo.Should().Be("CASE-99999");
        chart.Demographics.IsPwd.Should().BeTrue();

        // Collections
        chart.Problems.Should().NotBeNull();
        chart.Problems!.Should().HaveCount(1);
        chart.Problems![0].Icd10Code.Should().Be("I10");

        chart.Allergies.Should().NotBeNull();
        chart.Allergies!.Should().HaveCount(2);
        // Anaphylactic allergy must be sorted first
        chart.Allergies![0].Allergen.Should().Be("Penicillin");
        chart.Allergies![0].IsAnaphylactic.Should().BeTrue();
        chart.Allergies![1].Allergen.Should().Be("Shrimp");

        chart.Immunizations.Should().NotBeNull();
        chart.Immunizations!.Should().HaveCount(1);
        chart.Immunizations![0].VaccineName.Should().Be("BCG Vaccine");

        chart.Attachments.Should().NotBeNull();
        chart.Attachments!.Should().HaveCount(1);
        chart.Attachments![0].Title.Should().Be("Complete Blood Count");
    }

    [Fact]
    public async Task Handle_WithNonExistentPatient_FallsBackGracefully()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var triageRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var handler = new GetPatientChartQueryHandler(
            consultRepo, triageRepo, procRepo, labRepo, invoiceRepo, _clinicContext,
            patientRepo: patientRepo);

        var nonExistentId = Guid.NewGuid();

        // Act
        var chart = await handler.Handle(new GetPatientChartQuery(nonExistentId), CancellationToken.None);

        // Assert
        chart.Should().NotBeNull();
        chart.PatientId.Should().Be(nonExistentId);
        chart.PatientName.Should().Be("Registered Patient");
        chart.Demographics.Should().BeNull();
    }

    [Fact]
    public async Task Handle_EmptyGuidPatientId_ThrowsBadRequestException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var triageRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        var handler = new GetPatientChartQueryHandler(consultRepo, triageRepo, procRepo, labRepo, invoiceRepo, _clinicContext);

        // Act & Assert
        var act = () => handler.Handle(new GetPatientChartQuery(Guid.Empty), CancellationToken.None);
        await act.Should().ThrowAsync<BadRequestException>();
    }
}
