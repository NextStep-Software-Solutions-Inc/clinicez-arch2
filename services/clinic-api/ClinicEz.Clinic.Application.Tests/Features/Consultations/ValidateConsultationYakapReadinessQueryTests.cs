using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Consultations.Queries;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Consultations;

public class ValidateConsultationYakapReadinessQueryTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_yakap_test";

    public ValidateConsultationYakapReadinessQueryTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
    }

    private (ConsultationEncounter Encounter, StaffMember Doctor, ClinicPatient Patient, TriageVitals Vitals) CreateValidBaseline(Guid encounterId, Guid doctorId, Guid patientId)
    {
        var doctor = new StaffMember
        {
            Id = doctorId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            FirstName = "Ramon",
            LastName = "Bautista",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-998877",
            PhilHealthPan = "PAN-11223344",
            S2LicenseNumber = "S2-9988"
        };

        var patient = new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-00010",
            FirstName = "Maria",
            LastName = "Santos",
            ContactNumber = "09171234567",
            PhilHealthNumber = "12-345678901-8"
        };

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            DoctorId = doctorId,
            PatientName = "Maria Santos",
            DoctorName = "Dr. Ramon Bautista",
            DoctorPhilHealthPan = "PAN-11223344",
            DoctorPrcLicense = "PRC-998877",
            DoctorS2License = "S2-9988",
            PhilHealthAtc = "A",
            PhilHealthSignSympCode = "01", // Fever
            GeneralSurveyId = "1", // Essentially Normal
            Diagnoses = new List<EncounterDiagnosis>
            {
                new() { Id = Guid.NewGuid(), Icd10Code = "J06.9", Description = "Acute upper respiratory infection", IsPrimary = true }
            },
            Prescriptions = new List<PrescriptionItem>
            {
                new() { Id = Guid.NewGuid(), GenericName = "Paracetamol", Dosage = "500mg", Form = "Tablet", Sig = "1 tab TID PO", PhilHealthDrugCode = "DRUG00000000000000000000000001" }
            }
        };

        var findings = new NineSystemPhysicalExamFindings();
        encounter.SetPhysicalExamFindings(findings);

        var vitals = new TriageVitals
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            SystolicBp = 120,
            DiastolicBp = 80,
            HeartRateBpm = 75,
            RespiratoryRateBreathsPerMin = 18,
            TemperatureCelsius = 36.8m,
            HeightCm = 165,
            WeightKg = 60,
            RecordedAt = DateTime.UtcNow
        };

        return (encounter, doctor, patient, vitals);
    }

    [Fact]
    public async Task Handle_FullyValidEncounter_ReturnsIsReadyTrue()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);

        var encounterId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        var (encounter, doctor, patient, vitals) = CreateValidBaseline(encounterId, doctorId, patientId);

        await consultRepo.AddAsync(encounter, CancellationToken.None);
        await staffRepo.AddAsync(doctor, CancellationToken.None);
        await patientRepo.AddAsync(patient, CancellationToken.None);
        await vitalsRepo.AddAsync(vitals, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ValidateConsultationYakapReadinessQueryHandler(
            consultRepo, patientRepo, staffRepo, vitalsRepo, _clinicContext);

        // Act
        var result = await handler.Handle(new ValidateConsultationYakapReadinessQuery(encounterId), CancellationToken.None);

        // Assert
        result.IsReady.Should().BeTrue();
        result.DoctorPanValid.Should().BeTrue();
        result.DoctorPrcValid.Should().BeTrue();
        result.PatientPinValid.Should().BeTrue();
        result.AtcValid.Should().BeTrue();
        result.SymptomsValid.Should().BeTrue();
        result.PhysicalExamComplete.Should().BeTrue();
        result.PrimaryDiagnosisPresent.Should().BeTrue();
        result.VitalsComplete.Should().BeTrue();
        result.MedicinesValid.Should().BeTrue();
        result.S2LicenseValid.Should().BeTrue();
        result.MissingFields.Should().BeEmpty();
    }

    [Fact]
    public async Task Handle_MissingDoctorPan_ReturnsIsReadyFalseWithMissingField()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);

        var encounterId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        var (encounter, doctor, patient, vitals) = CreateValidBaseline(encounterId, doctorId, patientId);
        encounter.DoctorPhilHealthPan = null;
        doctor.PhilHealthPan = null;

        await consultRepo.AddAsync(encounter, CancellationToken.None);
        await staffRepo.AddAsync(doctor, CancellationToken.None);
        await patientRepo.AddAsync(patient, CancellationToken.None);
        await vitalsRepo.AddAsync(vitals, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ValidateConsultationYakapReadinessQueryHandler(
            consultRepo, patientRepo, staffRepo, vitalsRepo, _clinicContext);

        // Act
        var result = await handler.Handle(new ValidateConsultationYakapReadinessQuery(encounterId), CancellationToken.None);

        // Assert
        result.IsReady.Should().BeFalse();
        result.DoctorPanValid.Should().BeFalse();
        result.MissingFields.Should().Contain(m => m.Contains("PAN"));
    }

    [Fact]
    public async Task Handle_PainSymptomCodeWithoutPainSite_ReturnsSymptomsValidFalse()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);

        var encounterId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        var (encounter, doctor, patient, vitals) = CreateValidBaseline(encounterId, doctorId, patientId);
        encounter.PhilHealthSignSympCode = "38"; // PAIN
        encounter.PhilHealthPainSite = null; // Missing mandatory pain site

        await consultRepo.AddAsync(encounter, CancellationToken.None);
        await staffRepo.AddAsync(doctor, CancellationToken.None);
        await patientRepo.AddAsync(patient, CancellationToken.None);
        await vitalsRepo.AddAsync(vitals, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ValidateConsultationYakapReadinessQueryHandler(
            consultRepo, patientRepo, staffRepo, vitalsRepo, _clinicContext);

        // Act
        var result = await handler.Handle(new ValidateConsultationYakapReadinessQuery(encounterId), CancellationToken.None);

        // Assert
        result.IsReady.Should().BeFalse();
        result.SymptomsValid.Should().BeFalse();
        result.MissingFields.Should().Contain(m => m.Contains("pain site"));
    }

    [Fact]
    public async Task Handle_AbnormalPhysicalExamWithoutRemarks_ReturnsPhysicalExamCompleteFalse()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);

        var encounterId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        var (encounter, doctor, patient, vitals) = CreateValidBaseline(encounterId, doctorId, patientId);
        var pe = new NineSystemPhysicalExamFindings();
        pe.Chest.IsNormal = false;
        pe.Chest.Remarks = null; // Abnormal without mandatory remarks
        encounter.SetPhysicalExamFindings(pe);

        await consultRepo.AddAsync(encounter, CancellationToken.None);
        await staffRepo.AddAsync(doctor, CancellationToken.None);
        await patientRepo.AddAsync(patient, CancellationToken.None);
        await vitalsRepo.AddAsync(vitals, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ValidateConsultationYakapReadinessQueryHandler(
            consultRepo, patientRepo, staffRepo, vitalsRepo, _clinicContext);

        // Act
        var result = await handler.Handle(new ValidateConsultationYakapReadinessQuery(encounterId), CancellationToken.None);

        // Assert
        result.IsReady.Should().BeFalse();
        result.PhysicalExamComplete.Should().BeFalse();
        result.MissingFields.Should().Contain(m => m.Contains("Chest finding"));
    }

    [Fact]
    public async Task Handle_DangerousDrugPrescriptionWithoutDoctorS2_ReturnsS2ValidFalse()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);

        var encounterId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        var (encounter, doctor, patient, vitals) = CreateValidBaseline(encounterId, doctorId, patientId);
        encounter.DoctorS2License = null;
        doctor.S2LicenseNumber = null;
        encounter.Prescriptions.Add(new PrescriptionItem
        {
            Id = Guid.NewGuid(),
            GenericName = "Morphine Sulfate",
            Dosage = "10mg",
            Form = "Tablet",
            Sig = "1 tab PRN severe pain",
            IsDangerousDrug = true,
            PhilHealthDrugCode = "DRUG00000000000000000000000002"
        });

        await consultRepo.AddAsync(encounter, CancellationToken.None);
        await staffRepo.AddAsync(doctor, CancellationToken.None);
        await patientRepo.AddAsync(patient, CancellationToken.None);
        await vitalsRepo.AddAsync(vitals, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ValidateConsultationYakapReadinessQueryHandler(
            consultRepo, patientRepo, staffRepo, vitalsRepo, _clinicContext);

        // Act
        var result = await handler.Handle(new ValidateConsultationYakapReadinessQuery(encounterId), CancellationToken.None);

        // Assert
        result.IsReady.Should().BeFalse();
        result.S2LicenseValid.Should().BeFalse();
        result.MissingFields.Should().Contain(m => m.Contains("Doctor S2 License"));
    }

    [Fact]
    public async Task Handle_NonExistentEncounter_ThrowsNotFoundException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);

        var handler = new ValidateConsultationYakapReadinessQueryHandler(
            consultRepo, patientRepo, staffRepo, vitalsRepo, _clinicContext);

        // Act & Assert
        var act = () => handler.Handle(new ValidateConsultationYakapReadinessQuery(Guid.NewGuid()), CancellationToken.None);
        await act.Should().ThrowAsync<NotFoundException>();
    }
}
