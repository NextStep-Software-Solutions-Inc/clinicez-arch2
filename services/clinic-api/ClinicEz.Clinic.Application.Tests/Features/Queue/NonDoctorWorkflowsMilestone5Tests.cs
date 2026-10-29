using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Application.Features.Queue.Commands;
using ClinicEz.Clinic.Application.Features.Queue.DTOs;
using ClinicEz.Clinic.Application.Features.Queue.Queries;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Queue;

public class NonDoctorWorkflowsMilestone5Tests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_milestone5_test";
    private readonly Guid _staffId = Guid.NewGuid();

    public NonDoctorWorkflowsMilestone5Tests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(_staffId);
    }

    #region F23: RBAC Parity Tests

    [Fact]
    public void CanonicalRoleTemplates_ContainMilestone5Permissions()
    {
        var templates = ClinicRoleSeeder.GetCanonicalSystemRoleTemplates();

        // 1. Nurse must have DocumentsRead
        var nurse = templates.SingleOrDefault(t => t.Name == ClinicRoleSeeder.NurseRoleName);
        nurse.Should().NotBeNull();
        nurse!.Permissions.Should().Contain(ClinicPermissions.DocumentsRead,
            "Nurse needs DocumentsRead to inspect and reprint medical certificates and referrals.");

        // 2. Receptionist must have RecordsUpload
        var receptionist = templates.SingleOrDefault(t => t.Name == ClinicRoleSeeder.ReceptionistRoleName);
        receptionist.Should().NotBeNull();
        receptionist!.Permissions.Should().Contain(ClinicPermissions.RecordsUpload,
            "Receptionist needs RecordsUpload to upload outside medical records and scans during patient registration.");
    }

    [Fact]
    public async Task SeedDefaultRolesForClinicAsync_BackfillsMissingPermissionsToExistingRoles()
    {
        // Arrange
        var (context, uow, _) = TestDbHelper.CreateTestContext(_clinicContext);

        // Seed existing Nurse role with legacy permissions only (missing DocumentsRead)
        var nurseRole = new Role
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            Name = ClinicRoleSeeder.NurseRoleName,
            Description = "Nurse",
            IsSystem = true,
            Permissions = new List<string> { ClinicPermissions.QueueRead, ClinicPermissions.TriageWrite }
        };

        // Seed existing Receptionist role with legacy permissions only (missing RecordsUpload)
        var receptionistRole = new Role
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            Name = ClinicRoleSeeder.ReceptionistRoleName,
            Description = "Receptionist",
            IsSystem = true,
            Permissions = new List<string> { ClinicPermissions.QueueRead, ClinicPermissions.QueueCall }
        };

        await context.Roles.AddRangeAsync(nurseRole, receptionistRole);
        await context.SaveChangesAsync();

        // Act
        await ClinicRoleSeeder.SeedDefaultRolesForClinicAsync(context, _tenantId, _clinicId, CancellationToken.None);

        // Assert
        var updatedNurse = await context.Roles.FirstAsync(r => r.Id == nurseRole.Id);
        updatedNurse.Permissions.Should().Contain(ClinicPermissions.DocumentsRead);

        var updatedReceptionist = await context.Roles.FirstAsync(r => r.Id == receptionistRole.Id);
        updatedReceptionist.Permissions.Should().Contain(ClinicPermissions.RecordsUpload);
    }

    #endregion

    #region F24: Administrative Certificates Vault Tests

    [Fact]
    public async Task GetPatientChartQueryHandler_PopulatesMedicalCertificatesAndReferralLettersWithSecurityDigest()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientId = Guid.NewGuid();

        var medCertRepo = TestDbHelper.CreateRepository<MedicalCertificate>(context, sieve);
        var referralRepo = TestDbHelper.CreateRepository<ReferralLetter>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var triageRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<LabOrder>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var clinicPatient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-00001",
            FirstName = "Maria",
            LastName = "Santos",
            DateOfBirth = new DateOnly(1990, 5, 15),
            Gender = Gender.Female,
            ContactNumber = "+639171234567"
        };
        await patientRepo.AddAsync(clinicPatient, CancellationToken.None);

        var cert1 = new MedicalCertificate
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CertificateNumber = "MC-20261023-0001",
            PatientId = patientId,
            PatientName = "Maria Santos",
            DoctorId = _staffId,
            DoctorName = "Dr. Rizal",
            PrcLicenseNumber = "PRC-123456",
            Diagnosis = "Acute Bronchitis",
            Remarks = "Bed rest for 3 days",
            SecurityDigest = "a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890",
            CreatedAt = DateTime.UtcNow.AddDays(-2)
        };
        var cert2 = new MedicalCertificate
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CertificateNumber = "MC-20261023-0002",
            PatientId = patientId,
            PatientName = "Maria Santos",
            DoctorId = _staffId,
            DoctorName = "Dr. Rizal",
            PrcLicenseNumber = "PRC-123456",
            Diagnosis = "Upper Respiratory Tract Infection",
            Remarks = "Home isolation",
            SecurityDigest = "b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890a1",
            CreatedAt = DateTime.UtcNow.AddDays(-1)
        };
        await medCertRepo.AddAsync(cert1, CancellationToken.None);
        await medCertRepo.AddAsync(cert2, CancellationToken.None);

        var referral = new ReferralLetter
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ReferralNumber = "REF-20261023-0001",
            PatientId = patientId,
            PatientName = "Maria Santos",
            ReferringDoctorId = _staffId,
            ReferringDoctorName = "Dr. Rizal",
            ReferredToFacility = "Philippine General Hospital",
            ReferredDepartment = "Pulmonology",
            ReasonForReferral = "Specialist evaluation for recurrent bronchospasm",
            ProvisionalDiagnosis = "Recurrent Bronchospasm",
            ClinicalSummary = "Patient with persistent wheezing unresponsive to bronchodilators.",
            SecurityDigest = "c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890a1b2",
            CreatedAt = DateTime.UtcNow.AddHours(-5)
        };
        await referralRepo.AddAsync(referral, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetPatientChartQueryHandler(
            consultRepo, triageRepo, procRepo, labOrderRepo, invoiceRepo, _clinicContext,
            patientRepo: patientRepo,
            medCertRepo: medCertRepo,
            referralRepo: referralRepo);

        // Act
        var result = await handler.Handle(new GetPatientChartQuery(patientId), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.MedicalCertificates.Should().NotBeNull();
        result.MedicalCertificates!.Should().HaveCount(2);
        // Ordered descending by CreatedAt
        result.MedicalCertificates![0].Diagnosis.Should().Be("Upper Respiratory Tract Infection");
        result.MedicalCertificates![0].SecurityDigest.Should().Be("b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890a1");
        result.MedicalCertificates![1].Diagnosis.Should().Be("Acute Bronchitis");

        result.ReferralLetters.Should().NotBeNull();
        result.ReferralLetters!.Should().HaveCount(1);
        result.ReferralLetters![0].ReferredToFacility.Should().Be("Philippine General Hospital");
        result.ReferralLetters![0].SecurityDigest.Should().Be("c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890a1b2");
    }

    #endregion

    #region F25: Audited Emergency Triage Diversion Tests

    [Fact]
    public async Task DivertEmergencyPatientCommand_WhenValid_TransitionsToDivertedAndRecordsAudit()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var ticket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Emergency Patient Alpha",
            QueueNumber = "Q-ER-001",
            Status = QueueStatus.Triaged,
            Priority = QueuePriority.Emergency,
            CheckInTime = DateTime.UtcNow.AddMinutes(-15)
        };
        await queueRepo.AddAsync(ticket, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new DivertEmergencyPatientCommandHandler(queueRepo, uow, _clinicContext);
        var command = new DivertEmergencyPatientCommand(
            ticket.Id,
            DestinationHospital: "Manila Doctors Hospital - Emergency Department",
            TransportMode: "City / Red Cross Ambulance",
            ParamedicOrEscortName: "Paramedic Juan Cruz (Badge #883)",
            ClinicalHandoverSummary: "Severe acute chest pain radiating to left jaw, SpO2 88%, diaphoresis. Vitals stabilized with 4L O2.",
            DivertedByStaffId: _staffId);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().BeTrue();

        var updated = await queueRepo.GetByIdAsync(ticket.Id, CancellationToken.None);
        updated.Should().NotBeNull();
        updated!.Status.Should().Be(QueueStatus.Diverted);
        updated.DivertedToFacility.Should().Be("Manila Doctors Hospital - Emergency Department");
        updated.TransportMode.Should().Be("City / Red Cross Ambulance");
        updated.ParamedicOrEscortName.Should().Be("Paramedic Juan Cruz (Badge #883)");
        updated.HandoverSummary.Should().Contain("Severe acute chest pain");
        updated.DivertedAt.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromSeconds(5));
        updated.DivertedByStaffId.Should().Be(_staffId);
    }

    [Fact]
    public async Task DivertEmergencyPatientCommand_WhenTicketNotFound_ThrowsNotFoundException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var handler = new DivertEmergencyPatientCommandHandler(queueRepo, uow, _clinicContext);
        var command = new DivertEmergencyPatientCommand(
            Guid.NewGuid(), "PGH ER", "Ambulance", "Paramedic Cruz", "Handover details", _staffId);

        // Act
        Func<Task> act = () => handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Theory]
    [InlineData("", "Ambulance", "Paramedic", "Summary")]
    [InlineData("PGH", "", "Paramedic", "Summary")]
    [InlineData("PGH", "Ambulance", "", "Summary")]
    [InlineData("PGH", "Ambulance", "Paramedic", "")]
    public async Task DivertEmergencyPatientCommand_WhenRequiredFieldsMissing_ThrowsValidationException(
        string hospital, string transport, string escort, string summary)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var ticket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Jane Doe",
            QueueNumber = "Q-002",
            Status = QueueStatus.Waiting
        };
        await queueRepo.AddAsync(ticket, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new DivertEmergencyPatientCommandHandler(queueRepo, uow, _clinicContext);
        var command = new DivertEmergencyPatientCommand(ticket.Id, hospital, transport, escort, summary, _staffId);

        // Act
        Func<Task> act = () => handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Theory]
    [InlineData(QueueStatus.Completed)]
    [InlineData(QueueStatus.DischargedNonDoctor)]
    [InlineData(QueueStatus.Cancelled)]
    [InlineData(QueueStatus.NoShow)]
    [InlineData(QueueStatus.Diverted)]
    public async Task DivertEmergencyPatientCommand_WhenTicketAlreadyTerminal_ThrowsBadRequestException(QueueStatus terminalStatus)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var ticket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Terminal Ticket",
            QueueNumber = "Q-003",
            Status = terminalStatus
        };
        await queueRepo.AddAsync(ticket, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new DivertEmergencyPatientCommandHandler(queueRepo, uow, _clinicContext);
        var command = new DivertEmergencyPatientCommand(
            ticket.Id, "St. Luke's ER", "Ambulance", "Paramedic Lee", "Handover notes", _staffId);

        // Act
        Func<Task> act = () => handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage($"*already closed with status '{terminalStatus}'*");
    }

    [Fact]
    public void QueueController_DivertEmergencyPatient_RequiresTriageWritePermission()
    {
        // Reflect on QueueController to verify endpoint metadata
        var method = typeof(QueueController).GetMethod(nameof(QueueController.DivertEmergencyPatient));
        method.Should().NotBeNull("QueueController must expose DivertEmergencyPatient endpoint");

        var permissionAttr = method!.GetCustomAttribute<HasPermissionAttribute>();
        permissionAttr.Should().NotBeNull("DivertEmergencyPatient endpoint must enforce RBAC permission");
        permissionAttr!.Permission.Should().Be(ClinicPermissions.TriageWrite);

        var httpPostAttr = method.GetCustomAttribute<HttpPostAttribute>();
        httpPostAttr.Should().NotBeNull();
        httpPostAttr!.Template.Should().Be("{id:guid}/divert");
    }

    [Fact]
    public async Task PublicQueueDisplayQuery_ExcludesDivertedAndDischargedNonDoctorTickets()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var clinicSettings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Care Clinic",
            TenantSlug = "care-clinic",
            FacilitySlug = "main"
        };
        await settingsRepo.AddAsync(clinicSettings, CancellationToken.None);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // 1. Waiting ticket (should be in UpNext)
        var waitingTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Pedro Penduko",
            QueueNumber = "Q-WAIT-1",
            QueueDate = today,
            Status = QueueStatus.Waiting,
            CheckInTime = DateTime.UtcNow.AddMinutes(-20)
        };

        // 2. Diverted ticket (MUST be excluded)
        var divertedTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Diverted Patient",
            QueueNumber = "Q-DIV-1",
            QueueDate = today,
            Status = QueueStatus.Diverted,
            CheckInTime = DateTime.UtcNow.AddMinutes(-30)
        };

        // 3. DischargedNonDoctor ticket (MUST be excluded)
        var dischargedTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Discharged Patient",
            QueueNumber = "Q-DIS-1",
            QueueDate = today,
            Status = QueueStatus.DischargedNonDoctor,
            CheckInTime = DateTime.UtcNow.AddMinutes(-40)
        };

        await queueRepo.AddAsync(waitingTicket, CancellationToken.None);
        await queueRepo.AddAsync(divertedTicket, CancellationToken.None);
        await queueRepo.AddAsync(dischargedTicket, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetPublicQueueDisplayQueryHandler(queueRepo, settingsRepo, _clinicContext);

        // Act
        var display = await handler.Handle(new GetPublicQueueDisplayQuery(ClinicId: _clinicId, TenantSlug: "care-clinic", FacilitySlug: "main", Date: today), CancellationToken.None);

        // Assert
        display.Should().NotBeNull();
        display!.UpNext.Should().Contain(u => u.TicketNumber == "Q-WAIT-1");
        display.UpNext.Should().NotContain(u => u.TicketNumber == "Q-DIV-1",
            "Diverted emergency patients must be shielded from public TV display.");
        display.UpNext.Should().NotContain(u => u.TicketNumber == "Q-DIS-1",
            "Non-doctor discharged patients must be shielded from public TV display.");
    }

    [Fact]
    public async Task ReconcileEodCommand_ShieldsDivertedAndNonDoctorDischargedTicketsFromNoShow()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<EodReconciliationAudit>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var waitingTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Forgot to attend",
            QueueNumber = "Q-NO-SHOW",
            QueueDate = today,
            Status = QueueStatus.Waiting
        };

        var divertedTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Diverted ER",
            QueueNumber = "Q-DIV-SAFE",
            QueueDate = today,
            Status = QueueStatus.Diverted,
            DivertedToFacility = "City ER"
        };

        var dischargedTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Discharged Vaccine Visit",
            QueueNumber = "Q-DIS-SAFE",
            QueueDate = today,
            Status = QueueStatus.DischargedNonDoctor
        };

        await queueRepo.AddAsync(waitingTicket, CancellationToken.None);
        await queueRepo.AddAsync(divertedTicket, CancellationToken.None);
        await queueRepo.AddAsync(dischargedTicket, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ReconcileEodCommandHandler(queueRepo, auditRepo, uow, _clinicContext);

        // Act
        var result = await handler.Handle(new ReconcileEodCommand(today), CancellationToken.None);

        // Assert
        result.ReconciledCount.Should().Be(1, "Only waiting ticket should be reconciled to NoShow.");

        var afterWaiting = await queueRepo.GetByIdAsync(waitingTicket.Id, CancellationToken.None);
        afterWaiting!.Status.Should().Be(QueueStatus.NoShow);

        var afterDiverted = await queueRepo.GetByIdAsync(divertedTicket.Id, CancellationToken.None);
        afterDiverted!.Status.Should().Be(QueueStatus.Diverted,
            "Diverted tickets must never be overwritten as NoShow by EOD reconciliation.");

        var afterDischarged = await queueRepo.GetByIdAsync(dischargedTicket.Id, CancellationToken.None);
        afterDischarged!.Status.Should().Be(QueueStatus.DischargedNonDoctor,
            "Non-doctor discharged tickets must never be overwritten as NoShow by EOD reconciliation.");
    }

    #endregion
}
