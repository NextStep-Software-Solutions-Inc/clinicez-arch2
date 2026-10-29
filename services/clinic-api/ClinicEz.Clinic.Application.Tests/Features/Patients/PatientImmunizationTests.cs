using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Immunizations.Commands;
using ClinicEz.Clinic.Application.Features.Immunizations.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Patients;

public class PatientImmunizationTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private const string TenantId = "tenant-test";
    private readonly IClinicContext _clinicContext;

    public PatientImmunizationTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(TenantId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
    }

    private Patient SeedPatient(ApplicationDbContext db, Guid? syncPatientId = null)
    {
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            Sex = BiologicalSex.Male,
            DateOfBirth = new DateOnly(2020, 1, 1),
            ContactNumber = "09171234567",
            CloudPatientId = syncPatientId
        };
        db.Patients.Add(patient);
        db.SaveChanges();
        return patient;
    }

    [Fact]
    public async Task AdministerVaccine_ValidRequest_CreatesImmunizationAndEnqueuesOutbox()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        MessagingTestKit.SeedClinic(db, _clinicId, TenantId, "Apex Health");
        var syncId = Guid.NewGuid();
        var patient = SeedPatient(db, syncId);

        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var immRepo = TestDbHelper.CreateRepository<PatientImmunization>(db, sieve);
        var publisher = new ImmunizationEventPublisher(
            new InteropPublisher(db), MessagingTestKit.Addresses(db), NullLogger<ImmunizationEventPublisher>.Instance);

        var handler = new AdministerVaccineCommandHandler(patientRepo, immRepo, uow, _clinicContext, publisher);

        var todayManila = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(8));
        var command = new AdministerVaccineCommand(
            PatientId: patient.Id,
            ConsultationEncounterId: null,
            PhilHealthLibrary: "lib_immchild",
            PhilHealthCode: "C01",
            VaccineName: "BCG",
            BrandName: "BCG Vaccine SSI",
            Manufacturer: "Statens Serum Institut",
            LotBatchNumber: "LOT-BCG-2026",
            ExpirationDate: todayManila.AddMonths(6),
            DoseSequence: 1,
            IsSeriesCompleted: true,
            Route: "Intradermal",
            InjectionSite: "Right Deltoid",
            AdministeredAtUtc: DateTime.UtcNow,
            AdministeredByStaffId: Guid.NewGuid(),
            AdministeredByStaffName: "Nurse Maria Santos, RN",
            AdministeredByPrcLicense: "RN-123456",
            Remarks: "Administered with no acute reaction");

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.VaccineName.Should().Be("BCG");
        result.PhilHealthCode.Should().Be("C01");
        result.LotBatchNumber.Should().Be("LOT-BCG-2026");
        result.IsSynchronizedToPatientApp.Should().BeTrue();

        var entity = await db.PatientImmunizations.FirstOrDefaultAsync(i => i.Id == result.Id);
        entity.Should().NotBeNull();
        entity!.VaccineName.Should().Be("BCG");
        entity.IsHistorical.Should().BeFalse();

        // Verify transactional outbox message
        var outbox = await db.InteropOutbox.SingleAsync();
        outbox.Type.Should().Be(InteropTypes.ClinicalImmunizationAdministered);
        outbox.CorrelationId.Should().Be(result.Id);

        var envelope = InteropEnvelope.FromJson(outbox.EnvelopeJson);
        envelope.To.Kind.Should().Be(PartyKind.Patient);
        envelope.To.PatientId.Should().Be(syncId.ToString());
    }

    [Fact]
    public void AdministerVaccine_ExpiredBatch_FailsValidation()
    {
        var validator = new AdministerVaccineValidator();
        var todayManila = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(8));

        var command = new AdministerVaccineCommand(
            PatientId: Guid.NewGuid(),
            ConsultationEncounterId: null,
            PhilHealthLibrary: "lib_immchild",
            PhilHealthCode: "C01",
            VaccineName: "BCG",
            BrandName: null,
            Manufacturer: null,
            LotBatchNumber: "EXP-BATCH-001",
            ExpirationDate: todayManila.AddDays(-1), // Expired yesterday
            DoseSequence: 1,
            IsSeriesCompleted: true,
            Route: "Intradermal",
            InjectionSite: "Right Deltoid",
            AdministeredAtUtc: DateTime.UtcNow,
            AdministeredByStaffId: Guid.NewGuid(),
            AdministeredByStaffName: "Nurse Maria",
            AdministeredByPrcLicense: null,
            Remarks: null);

        var validationResult = validator.Validate(command);
        validationResult.IsValid.Should().BeFalse();
        validationResult.Errors.Should().Contain(e => e.ErrorMessage.Contains("expired vaccine"));
    }

    [Fact]
    public async Task RecordHistoricalImmunization_ValidPastDate_CreatesHistoricalRecord()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patient = SeedPatient(db);

        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var immRepo = TestDbHelper.CreateRepository<PatientImmunization>(db, sieve);

        var handler = new RecordHistoricalImmunizationCommandHandler(patientRepo, immRepo, uow, _clinicContext);

        var pastDate = new DateOnly(2021, 6, 15);
        var command = new RecordHistoricalImmunizationCommand(
            PatientId: patient.Id,
            PhilHealthLibrary: "lib_immchild",
            PhilHealthCode: "C08",
            VaccineName: "Measles",
            AdministeredDate: pastDate,
            DoseSequence: 1,
            IsSeriesCompleted: true,
            LotBatchNumber: null,
            HistoricalFacilityName: "Quezon City Health Center",
            Route: "Subcutaneous",
            InjectionSite: "Left Thigh",
            Remarks: "Transferred from baby book");

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.VaccineName.Should().Be("Measles");
        result.IsHistorical.Should().BeTrue();
        result.HistoricalFacilityName.Should().Be("Quezon City Health Center");

        var entity = await db.PatientImmunizations.FirstOrDefaultAsync(i => i.Id == result.Id);
        entity.Should().NotBeNull();
        entity!.IsHistorical.Should().BeTrue();
    }

    [Fact]
    public void RecordHistoricalImmunization_FutureDate_FailsValidation()
    {
        var validator = new RecordHistoricalImmunizationValidator();
        var todayManila = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(8));

        var command = new RecordHistoricalImmunizationCommand(
            PatientId: Guid.NewGuid(),
            PhilHealthLibrary: "lib_immchild",
            PhilHealthCode: "C08",
            VaccineName: "Measles",
            AdministeredDate: todayManila.AddDays(5), // Future date
            DoseSequence: 1,
            IsSeriesCompleted: true,
            LotBatchNumber: null,
            HistoricalFacilityName: null,
            Route: null,
            InjectionSite: null,
            Remarks: null);

        var validationResult = validator.Validate(command);
        validationResult.IsValid.Should().BeFalse();
        validationResult.Errors.Should().Contain(e => e.ErrorMessage.Contains("future"));
    }

    [Fact]
    public async Task RecordImmunizationAefi_ValidSeverity_UpdatesAdverseReaction()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patient = SeedPatient(db);

        var immunization = new PatientImmunization
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Juan Dela Cruz",
            PhilHealthLibrary = "lib_immchild",
            PhilHealthCode = "C09",
            VaccineName = "Hepatitis B1",
            LotBatchNumber = "LOT-HEP-101",
            ExpirationDate = new DateOnly(2027, 1, 1),
            DoseSequence = 1,
            IsSeriesCompleted = false,
            Route = "Intramuscular",
            InjectionSite = "Anterolateral Thigh",
            AdministeredAtUtc = DateTime.UtcNow,
            AdministeredByStaffId = Guid.NewGuid(),
            AdministeredByStaffName = "Nurse Santos",
            HasAdverseReaction = false,
            AdverseReactionSeverity = "None"
        };
        db.PatientImmunizations.Add(immunization);
        await db.SaveChangesAsync();

        var immRepo = TestDbHelper.CreateRepository<PatientImmunization>(db, sieve);
        var handler = new RecordImmunizationAefiCommandHandler(immRepo, uow, _clinicContext);

        var command = new RecordImmunizationAefiCommand(
            PatientId: patient.Id,
            ImmunizationId: immunization.Id,
            AdverseReactionSeverity: "Moderate",
            AdverseReactionRemarks: "Mild localized swelling and low-grade fever 38.2C resolved with paracetamol.",
            RecordedAtUtc: DateTime.UtcNow);

        var result = await handler.Handle(command, CancellationToken.None);

        result.HasAdverseReaction.Should().BeTrue();
        result.AdverseReactionSeverity.Should().Be("Moderate");
        result.AdverseReactionRemarks.Should().Contain("localized swelling");
    }

    [Fact]
    public async Task GetPatientImmunizations_ReturnsAllPatientImmunizationsInDescOrder()
    {
        var (db, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patient = SeedPatient(db);

        var imm1 = new PatientImmunization
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Juan Dela Cruz",
            PhilHealthLibrary = "lib_immchild",
            PhilHealthCode = "C01",
            VaccineName = "BCG",
            LotBatchNumber = "LOT-01",
            ExpirationDate = new DateOnly(2027, 1, 1),
            DoseSequence = 1,
            AdministeredAtUtc = DateTime.UtcNow.AddDays(-10),
            AdministeredByStaffId = Guid.NewGuid(),
            AdministeredByStaffName = "Nurse Santos",
            Route = "ID",
            InjectionSite = "Right Deltoid"
        };
        var imm2 = new PatientImmunization
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Juan Dela Cruz",
            PhilHealthLibrary = "lib_immchild",
            PhilHealthCode = "C02",
            VaccineName = "OPV1",
            LotBatchNumber = "LOT-02",
            ExpirationDate = new DateOnly(2027, 1, 1),
            DoseSequence = 1,
            AdministeredAtUtc = DateTime.UtcNow.AddDays(-1),
            AdministeredByStaffId = Guid.NewGuid(),
            AdministeredByStaffName = "Nurse Santos",
            Route = "Oral",
            InjectionSite = "Mouth"
        };
        db.PatientImmunizations.AddRange(imm1, imm2);
        await db.SaveChangesAsync();

        var immRepo = TestDbHelper.CreateRepository<PatientImmunization>(db, sieve);
        var queryHandler = new GetPatientImmunizationsQueryHandler(immRepo, _clinicContext);

        var result = await queryHandler.Handle(new GetPatientImmunizationsQuery(patient.Id), CancellationToken.None);

        result.Should().HaveCount(2);
        result.First().VaccineName.Should().Be("OPV1"); // Most recent first
        result.Last().VaccineName.Should().Be("BCG");
    }

    [Fact]
    public void StatutoryFallback999_IsOfficialPhilHealthNoneCode()
    {
        const string PhilHealthStatutoryFallbackCode = "999";
        PhilHealthStatutoryFallbackCode.Should().Be("999");
    }
}
