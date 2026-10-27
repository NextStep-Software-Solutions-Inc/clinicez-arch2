using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Prescriptions.Commands;
using ClinicEz.Clinic.Application.Features.Prescriptions.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using MediatR;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class PrescriptionInteroperabilityTests
{
    private readonly Guid _testClinicId = Guid.NewGuid();
    private readonly string _testTenantId = "tenant-test-01";
    private readonly IClinicContext _clinicContext;

    public PrescriptionInteroperabilityTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_testClinicId);
        _clinicContext.TenantId.Returns(_testTenantId);
    }

    [Fact]
    public async Task GetPrescriptionSlipQuery_GeneratesSlipWithTokenAndQrPayload()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(db, sieve);

        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-2026-0001",
            FirstName = "Maria",
            LastName = "Santos",
            DateOfBirth = new DateOnly(1984, 5, 20),
            Gender = "Female",
            ContactNumber = "09171234567"
        };
        await db.Patients.AddAsync(patient);

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patient.Id,
            PatientName = "Maria Santos",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Cruz, MD",
            DoctorPrcLicense = "0149281",
            DoctorPtr = "PTR-2026-9912",
            Assessment = "Essential Hypertension Stage 1",
            IsSigned = true,
            SignedAt = DateTime.UtcNow,
            Prescriptions = new List<PrescriptionItem>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    GenericName = "Amlodipine Besylate",
                    BrandName = "Norvasc",
                    Dosage = "5mg",
                    Form = "Tablet",
                    Sig = "Take 1 tablet daily in the morning",
                    Quantity = 30
                }
            }
        };
        await db.Consultations.AddAsync(encounter);
        await db.SaveChangesAsync();

        var handler = new GetPrescriptionSlipQueryHandler(encounterRepo, patientRepo, staffRepo, settingsRepo, uow);
        var query = new GetPrescriptionSlipQuery(ConsultationId: encounter.Id);

        var slip = await handler.Handle(query, CancellationToken.None);

        slip.Should().NotBeNull();
        slip.PrescriptionNumber.Should().StartWith("RX-");
        slip.PublicVerificationToken.Should().NotBeNullOrWhiteSpace();
        slip.QrPayload.Should().Contain($"/verify/rx/{slip.PublicVerificationToken}");
        slip.QrPayload.Should().Contain(slip.PublicVerificationToken);
        slip.DoctorPrcLicense.Should().Be("0149281");
        slip.Items.Should().HaveCount(1);
        slip.Items[0].GenericName.Should().Be("Amlodipine Besylate");
        slip.DispenseStatus.Should().Be(PrescriptionDispenseStatus.Issued.ToString());
    }

    [Fact]
    public async Task GetPublicRxVerificationInfo_ReturnsValidPrescriptionInfo()
    {
        var (db, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(db, sieve);

        var token = "token-secret-hex-1234567890";
        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Juan Dela Cruz",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Cruz, MD",
            DoctorPrcLicense = "0149281",
            PrescriptionNumber = "RX-20261001-0001",
            RxPublicVerificationToken = token,
            RxDispenseStatus = PrescriptionDispenseStatus.Issued,
            IsSigned = true,
            SignedAt = DateTime.UtcNow,
            Prescriptions = new List<PrescriptionItem>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    GenericName = "Losartan Potassium",
                    Dosage = "50mg",
                    Form = "Tablet",
                    Sig = "Take 1 tablet daily",
                    Quantity = 30
                }
            }
        };
        await db.Consultations.AddAsync(encounter);
        await db.SaveChangesAsync();

        var handler = new GetPublicRxVerificationInfoQueryHandler(encounterRepo, patientRepo, staffRepo, settingsRepo);
        var result = await handler.Handle(new GetPublicRxVerificationInfoQuery(token), CancellationToken.None);

        result.Should().NotBeNull();
        result.PrescriptionNumber.Should().Be("RX-20261001-0001");
        result.PatientName.Should().Be("Juan Dela Cruz");
        result.IsValid.Should().BeTrue();
        result.IsAlreadyDispensed.Should().BeFalse();
        result.Items.Should().HaveCount(1);
    }

    [Fact]
    public async Task RecordExternalDispenseCommand_UpdatesDispenseStatusAndReceipt()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var sender = Substitute.For<ISender>();

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Elena Ramos",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Cruz, MD",
            PrescriptionNumber = "RX-20261001-0002",
            RxDispenseStatus = PrescriptionDispenseStatus.Issued,
            Prescriptions = new List<PrescriptionItem>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    GenericName = "Co-Amoxiclav",
                    Dosage = "625mg",
                    Form = "Tablet",
                    Sig = "Take 1 tablet every 12 hours for 7 days",
                    Quantity = 14
                }
            }
        };
        await db.Consultations.AddAsync(encounter);
        await db.SaveChangesAsync();

        var handler = new RecordExternalDispenseCommandHandler(encounterRepo, uow, sender);
        var command = new RecordExternalDispenseCommand(
            encounter.Id,
            "Mercury Drug",
            "Ayala Alabang Branch",
            "Pharmacist Ana Lim, RPh",
            "PRC-0091234",
            "OR-9912034",
            "https://storage.clinicez.ph/receipts/or-9912034.pdf",
            "Patient presented original slip and completed full 7-day course"
        );

        await handler.Handle(command, CancellationToken.None);

        var updated = await db.Consultations.FindAsync(encounter.Id);
        updated.Should().NotBeNull();
        updated!.RxDispenseStatus.Should().Be(PrescriptionDispenseStatus.DispensedExternally);
        updated.RxDispensedPharmacyName.Should().Be("Mercury Drug");
        updated.RxDispensedReceiptNumber.Should().Be("OR-9912034");
        updated.RxDispensedPharmacistName.Should().Be("Pharmacist Ana Lim, RPh");
    }

    [Fact]
    public async Task SubmitPublicRxDispenseCommand_MarksPrescriptionAsDispensedAndPreventsDoubleDispense()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var sender = Substitute.For<ISender>();

        var token = "token-watsons-verification-999";
        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Roberto Garcia",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Cruz, MD",
            PrescriptionNumber = "RX-20261001-0003",
            RxPublicVerificationToken = token,
            RxDispenseStatus = PrescriptionDispenseStatus.Issued,
            Prescriptions = new List<PrescriptionItem>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    GenericName = "Metformin HCl",
                    Dosage = "500mg",
                    Form = "Tablet",
                    Sig = "Take 1 tablet twice daily with meals",
                    Quantity = 60
                }
            }
        };
        await db.Consultations.AddAsync(encounter);
        await db.SaveChangesAsync();

        var handler = new SubmitPublicRxDispenseCommandHandler(encounterRepo, uow, sender);
        var command = new SubmitPublicRxDispenseCommand(
            token,
            "Watsons Pharmacy",
            "SM North EDSA Branch",
            "Pharmacist Joy Tan, RPh",
            "PRC-0056789",
            "WAT-OR-88129",
            null,
            "Dispensed 60 tablets of Glucophage brand"
        );

        await handler.Handle(command, CancellationToken.None);

        var updated = await db.Consultations.FindAsync(encounter.Id);
        updated.Should().NotBeNull();
        updated!.RxDispenseStatus.Should().Be(PrescriptionDispenseStatus.DispensedExternally);
        updated.RxDispensedPharmacyName.Should().Be("Watsons Pharmacy");

        // Attempting to dispense the same token again should be blocked with BadRequestException
        var duplicateAct = async () => await handler.Handle(command, CancellationToken.None);
        await duplicateAct.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*already been dispensed*");
    }

    [Theory]
    [InlineData("mc-2026-0001")]
    [InlineData("ref-2026-0001")]
    [InlineData("lab-2026-0001")]
    [InlineData("sec-sha256-abcdef123456")]
    public async Task GetPublicRxVerificationInfo_WithMismatchedDocumentPrefix_ThrowsBadRequestException(string mismatchedToken)
    {
        var (db, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(db, sieve);

        var handler = new GetPublicRxVerificationInfoQueryHandler(encounterRepo, patientRepo, staffRepo, settingsRepo);
        var act = async () => await handler.Handle(new GetPublicRxVerificationInfoQuery(mismatchedToken), CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*non-prescription clinical document*");
    }

    [Fact]
    public async Task GetPublicRxVerificationInfo_WithLabUploadToken_ThrowsBadRequestException()
    {
        var (db, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(db, sieve);

        var labToken = "01938561726374829102938475610293.uL7jZ_3xR_yT9aBcDeFgHi";
        var handler = new GetPublicRxVerificationInfoQueryHandler(encounterRepo, patientRepo, staffRepo, settingsRepo);
        var act = async () => await handler.Handle(new GetPublicRxVerificationInfoQuery(labToken), CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*laboratory upload token*");
    }

    [Theory]
    [InlineData("mc-2026-0001")]
    [InlineData("ref-2026-0001")]
    [InlineData("lab-2026-0001")]
    public async Task SubmitPublicRxDispense_WithMismatchedDocumentPrefix_ThrowsBadRequestException(string mismatchedToken)
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var sender = Substitute.For<ISender>();

        var handler = new SubmitPublicRxDispenseCommandHandler(encounterRepo, uow, sender);
        var command = new SubmitPublicRxDispenseCommand(
            mismatchedToken, "Mercury Drug", null, null, null, null, null, null);

        var act = async () => await handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*non-prescription clinical document*");
    }

    [Fact]
    public async Task SubmitPublicRxDispense_WithLabUploadToken_ThrowsBadRequestException()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var sender = Substitute.For<ISender>();

        var labToken = "01938561726374829102938475610293.uL7jZ_3xR_yT9aBcDeFgHi";
        var handler = new SubmitPublicRxDispenseCommandHandler(encounterRepo, uow, sender);
        var command = new SubmitPublicRxDispenseCommand(
            labToken, "Mercury Drug", null, null, null, null, null, null);

        var act = async () => await handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*laboratory upload token*");
    }
}
