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
        var triageRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<LabOrder>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var problemRepo = TestDbHelper.CreateRepository<PatientMedicalHistory>(context, sieve);
        var allergyRepo = TestDbHelper.CreateRepository<PatientAllergy>(context, sieve);
        var immRepo = TestDbHelper.CreateRepository<PatientImmunization>(context, sieve);
        var attachRepo = TestDbHelper.CreateRepository<RecordAttachment>(context, sieve);

        var patientId = Guid.NewGuid();
        var patient = new Patient
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
            Sex = BiologicalSex.Male,
            CivilStatus = CivilStatus.Married,
            ContactNumber = "09171234567",
            Email = "juan@example.com",
            PhilHealthNumber = "12-345678901-8",
            SeniorCitizenId = null,
            PwdId = "PWD-12345",
            BloodType = BloodType.OPositive,
            CustomFields = new Dictionary<string, object?>
            {
                ["yakap_enlistments"] = new List<Dictionary<string, object?>>
                {
                    new()
                    {
                        ["status"] = "Active",
                        ["case_no"] = "CASE-99999",
                        ["enlistment_no"] = "ENLIST-99999"
                    }
                }
            }
        };
        await patientRepo.AddAsync(patient, CancellationToken.None);

        // Problem
        var problem = new PatientMedicalHistory
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            Icd10Code = "I10",
            ConditionTitle = "Essential (primary) hypertension",
            Status = ProblemStatus.Active,
            Severity = ProblemSeverity.Moderate,
            IsChronicNcd = true,
            OnsetDate = new DateOnly(2020, 1, 15),
            RecordedByStaffId = Guid.NewGuid(),
            RecordedByStaffName = "Dr. Jose Santos"
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
        var attach = new RecordAttachment
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
        chart.Demographics.Sex.Should().Be("Male");
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
        var triageRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<LabOrder>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

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
        var triageRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<LabOrder>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        var handler = new GetPatientChartQueryHandler(consultRepo, triageRepo, procRepo, labRepo, invoiceRepo, _clinicContext);

        // Act & Assert
        var act = () => handler.Handle(new GetPatientChartQuery(Guid.Empty), CancellationToken.None);
        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task Handle_WithDentalTeethAndFindings_PopulatesDentalTeethAndConsultationDentalFindings()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var triageRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<LabOrder>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);

        var patientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-DENT-001",
            FirstName = "Dent",
            LastName = "Patient",
            ContactNumber = "09171234567"
        };
        await patientRepo.AddAsync(patient, CancellationToken.None);

        var consult1Id = Guid.NewGuid();
        var consult1Date = new DateTime(2026, 10, 20, 9, 30, 0, DateTimeKind.Utc);
        var consult1 = new ConsultationEncounter
        {
            Id = consult1Id,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Patient, Dent",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Santos",
            EncounterDate = consult1Date,
            Subjective = "Dental toothache",
            Objective = "Cavity on tooth 16",
            Assessment = "Dental caries",
            Plan = "Restoration and cleaning",
            IsSigned = true
        };
        await consultRepo.AddAsync(consult1, CancellationToken.None);

        var consult2Id = Guid.NewGuid();
        var consult2Date = new DateTime(2026, 10, 10, 14, 0, 0, DateTimeKind.Utc);
        var consult2 = new ConsultationEncounter
        {
            Id = consult2Id,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Patient, Dent",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Reyes",
            EncounterDate = consult2Date,
            Subjective = "Routine oral exam",
            Objective = "Examined",
            Assessment = "Healthy",
            Plan = "Observation",
            IsSigned = true
        };
        await consultRepo.AddAsync(consult2, CancellationToken.None);

        // Multi-condition tooth 16 linked to consult1Id
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ConsultationId = consult1Id,
            ToothNumber = 16,
            Status = ToothStatus.Filled,
            Surface = "O",
            Notes = "Composite on occlusal",
            CreatedBy = "Dr. Prior",
            UpdatedBy = "Dr. Santos"
        }, CancellationToken.None);

        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ConsultationId = consult1Id,
            ToothNumber = 16,
            Status = ToothStatus.Decayed,
            Surface = "MD",
            Notes = "Recurrent caries on mesial-distal",
            CreatedBy = "Dr. Santos"
        }, CancellationToken.None);

        // Tooth 21 linked to consult2Id
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ConsultationId = consult2Id,
            ToothNumber = 21,
            Status = ToothStatus.Healthy,
            CreatedBy = "Dr. Reyes"
        }, CancellationToken.None);

        // Tooth 36 without consultationId, but CreatedAt matches consult2Date (date fallback test)
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ConsultationId = null,
            ToothNumber = 36,
            Status = ToothStatus.Missing,
            CreatedAt = consult2Date,
            CreatedBy = "Dr. Reyes"
        }, CancellationToken.None);

        // Dental procedure with tooth tagging
        await procRepo.AddAsync(new Procedure
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Patient, Dent",
            ProcedureCode = "DENT-COMP",
            ProcedureName = "Composite Restoration",
            Category = "Dental",
            ToothNumber = 16,
            ToothSurface = "O",
            ScheduledAt = consult1Date,
            Status = ProcedureStatus.Completed
        }, CancellationToken.None);

        // Non-dental procedure
        await procRepo.AddAsync(new Procedure
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Patient, Dent",
            ProcedureCode = "GEN-VIT",
            ProcedureName = "Routine Nursing Vitals",
            Category = "General",
            ToothNumber = null,
            ScheduledAt = consult1Date,
            Status = ProcedureStatus.Completed
        }, CancellationToken.None);

        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetPatientChartQueryHandler(
            consultRepo, triageRepo, procRepo, labRepo, invoiceRepo, _clinicContext,
            patientRepo: patientRepo,
            dentalToothRepo: toothRepo);

        // Act
        var chart = await handler.Handle(new GetPatientChartQuery(patientId), CancellationToken.None);

        // Assert
        chart.Should().NotBeNull();
        chart.PatientId.Should().Be(patientId);

        // 1. DentalTeeth populated with RecordedBy mapping
        chart.DentalTeeth.Should().NotBeNull();
        chart.DentalTeeth!.Should().HaveCount(4);

        var tooth16Filled = chart.DentalTeeth.First(t => t.ToothNumber == 16 && t.Status == ToothStatus.Filled);
        tooth16Filled.Surface.Should().Be("O");
        tooth16Filled.RecordedBy.Should().Be("Dr. Santos"); // UpdatedBy ?? CreatedBy

        var tooth16Decay = chart.DentalTeeth.First(t => t.ToothNumber == 16 && t.Status == ToothStatus.Decayed);
        tooth16Decay.Surface.Should().Be("MD");
        tooth16Decay.RecordedBy.Should().Be("Dr. Santos"); // CreatedBy fallback

        // 2. ProcedureDto retains ToothNumber and ToothSurface
        chart.ProceduresHistory.Should().HaveCount(2);
        var dentalProc = chart.ProceduresHistory.First(p => p.ToothNumber == 16);
        dentalProc.ToothNumber.Should().Be(16);
        dentalProc.ToothSurface.Should().Be("O");

        // 3. DentalProcedures collection populated on PatientChartDto
        chart.DentalProcedures.Should().NotBeNull();
        chart.DentalProcedures!.Should().HaveCount(1);
        chart.DentalProcedures![0].ProcedureCode.Should().Be("DENT-COMP");

        // 4. ConsultationEncounterDto.DentalFindings grouping:
        // Consult 1 matches both conditions on tooth 16
        var encounter1 = chart.Consultations.First(c => c.Id == consult1Id);
        encounter1.DentalFindings.Should().NotBeNull();
        encounter1.DentalFindings!.Should().HaveCount(2);
        encounter1.DentalFindings.Should().Contain(d => d.ToothNumber == 16 && d.Status == ToothStatus.Filled);
        encounter1.DentalFindings.Should().Contain(d => d.ToothNumber == 16 && d.Status == ToothStatus.Decayed);

        // Consult 2 matches tooth 21 by ConsultationId, and tooth 36 by date fallback
        var encounter2 = chart.Consultations.First(c => c.Id == consult2Id);
        encounter2.DentalFindings.Should().NotBeNull();
        encounter2.DentalFindings!.Should().HaveCount(2);
        encounter2.DentalFindings.Should().Contain(d => d.ToothNumber == 21 && d.Status == ToothStatus.Healthy);
        encounter2.DentalFindings.Should().Contain(d => d.ToothNumber == 36 && d.Status == ToothStatus.Missing);
    }
}
