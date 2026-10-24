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
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
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

namespace ClinicEz.Clinic.Application.Tests.Challenger;

/// <summary>
/// Adversarial Challenger Test Suite: Milestone 5
/// Probes RBAC parity, role synchronization, custom permission preservation,
/// DivertEmergencyPatientCommand edge cases, TV display queue shielding,
/// EOD reconciliation no-show protection, and administrative document vault integrity.
/// </summary>
public class NonDoctorWorkflowsMilestone5AdversarialTests
{
    private static (Guid clinicId, string tenantId, Guid staffId, IClinicContext clinicContext) SetupClinicContext()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = $"tenant_m5_adv_{Guid.NewGuid():N}";
        var staffId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        clinicContext.StaffId.Returns(staffId);
        return (clinicId, tenantId, staffId, clinicContext);
    }

    #region Group 1: RBAC Parity & Seeding Adversarial Probes

    [Fact]
    public void Probe_CanonicalRoles_EnforceStrictMilestone5Permissions()
    {
        var templates = ClinicRoleSeeder.GetCanonicalSystemRoleTemplates();

        // 1. Nurse must have DocumentsRead, RecordsUpload, TriageWrite, QueueCompleteNonDoctor
        var nurse = templates.SingleOrDefault(t => t.Name == ClinicRoleSeeder.NurseRoleName);
        nurse.Should().NotBeNull();
        nurse!.Permissions.Should().Contain(ClinicPermissions.DocumentsRead);
        nurse.Permissions.Should().Contain(ClinicPermissions.RecordsUpload);
        nurse.Permissions.Should().Contain(ClinicPermissions.TriageWrite);
        nurse.Permissions.Should().Contain(ClinicPermissions.QueueCompleteNonDoctor);

        // 2. Receptionist must have RecordsUpload, DocumentsRead, QueueCompleteNonDoctor, QueueCheckIn
        var receptionist = templates.SingleOrDefault(t => t.Name == ClinicRoleSeeder.ReceptionistRoleName);
        receptionist.Should().NotBeNull();
        receptionist!.Permissions.Should().Contain(ClinicPermissions.RecordsUpload);
        receptionist.Permissions.Should().Contain(ClinicPermissions.DocumentsRead);
        receptionist.Permissions.Should().Contain(ClinicPermissions.QueueCompleteNonDoctor);
        receptionist.Permissions.Should().Contain(ClinicPermissions.QueueCheckIn);

        // 3. Cashier must have QueueComplete, QueueCompleteNonDoctor, PatientsRead
        var cashier = templates.SingleOrDefault(t => t.Name == ClinicRoleSeeder.CashierRoleName);
        cashier.Should().NotBeNull();
        cashier!.Permissions.Should().Contain(ClinicPermissions.QueueComplete);
        cashier.Permissions.Should().Contain(ClinicPermissions.QueueCompleteNonDoctor);
        cashier.Permissions.Should().Contain(ClinicPermissions.PatientsRead);
    }

    [Fact]
    public async Task Probe_RoleSync_PreservesCustomRolesAndCustomPermissions_WithoutDuplicates()
    {
        var (clinicId, tenantId, _, clinicContext) = SetupClinicContext();
        var (context, uow, _) = TestDbHelper.CreateTestContext(clinicContext);

        // Custom role (IsSystem = false)
        var customRoleId = Guid.NewGuid();
        var customRole = new ClinicRole
        {
            Id = customRoleId,
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Phlebotomist-Specialist",
            Description = "Custom clinical specialist",
            IsSystem = false,
            Permissions = new List<string> { "custom:phlebotomy-draw", "custom:centrifuge-run" },
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "Admin"
        };

        // Existing system Nurse role with custom permission attached
        var nurseRoleId = Guid.NewGuid();
        var existingNurseRole = new ClinicRole
        {
            Id = nurseRoleId,
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = ClinicRoleSeeder.NurseRoleName,
            Description = "Nurse",
            IsSystem = true,
            Permissions = new List<string> { ClinicPermissions.QueueRead, "custom:extra-care-permission" },
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "Admin"
        };

        await context.ClinicRoles.AddRangeAsync(customRole, existingNurseRole);
        await context.SaveChangesAsync();

        // Act 1: First sync
        await ClinicRoleSeeder.SeedDefaultRolesForClinicAsync(context, tenantId, clinicId, CancellationToken.None);

        // Assert 1: Custom role completely untouched
        var loadedCustom = await context.ClinicRoles.FirstAsync(r => r.Id == customRoleId);
        loadedCustom.Name.Should().Be("Phlebotomist-Specialist");
        loadedCustom.Permissions.Should().BeEquivalentTo(new[] { "custom:phlebotomy-draw", "custom:centrifuge-run" });

        // Assert 2: Nurse has canonical permissions backfilled, while retaining custom permission
        var loadedNurse = await context.ClinicRoles.FirstAsync(r => r.Id == nurseRoleId);
        loadedNurse.Permissions.Should().Contain("custom:extra-care-permission");
        loadedNurse.Permissions.Should().Contain(ClinicPermissions.DocumentsRead);
        loadedNurse.Permissions.Should().Contain(ClinicPermissions.RecordsUpload);

        // Act 2: Second sync (idempotency verification)
        var secondRunChanged = await ClinicRoleSeeder.SeedOrUpdateAllClinicsAsync(context, ct: CancellationToken.None);
        secondRunChanged.Should().Be(0, "Subsequent sync when roles are already up to date should make 0 modifications");

        // Verify no duplicate permission entries exist
        var reloadedNurse = await context.ClinicRoles.FirstAsync(r => r.Id == nurseRoleId);
        reloadedNurse.Permissions.GroupBy(p => p, StringComparer.OrdinalIgnoreCase)
            .Any(g => g.Count() > 1)
            .Should().BeFalse("Permissions must contain zero duplicate entries");
    }

    #endregion

    #region Group 2: DivertEmergencyPatientCommand Adversarial Probes

    [Fact]
    public async Task Probe_DivertEmergencyPatient_CrossClinicTenantIsolation_GuaranteedByQueryFilterAndHandlerGuard()
    {
        var (clinicId, tenantId, staffId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var otherClinicId = Guid.NewGuid();
        var foreignTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = otherClinicId, // Different clinic!
            PatientId = Guid.NewGuid(),
            PatientName = "Foreign Clinic Patient",
            QueueNumber = "Q-OTHER-101",
            Status = QueueStatus.Waiting
        };

        // Bypass query filter to seed foreign ticket into db
        await context.QueueItems.AddAsync(foreignTicket);
        await context.SaveChangesAsync();

        var handler = new DivertEmergencyPatientCommandHandler(queueRepo, uow, clinicContext);
        var command = new DivertEmergencyPatientCommand(
            foreignTicket.Id,
            DestinationHospital: "Makati Medical Center",
            TransportMode: "Ambulance",
            ParamedicOrEscortName: "Paramedic Santos",
            ClinicalHandoverSummary: "Severe dyspnea and tachycardia");

        // Layer 1: EF Core Global Query Filter completely conceals foreign ticket (NotFoundException prevents enumeration)
        Func<Task> actQueryFilter = () => handler.Handle(command, CancellationToken.None);
        await actQueryFilter.Should().ThrowAsync<NotFoundException>()
            .WithMessage("*not found*");

        // Layer 2: Defense-in-depth handler guard (if repository bypasses query filters, handler throws ForbiddenException)
        var mockRepo = Substitute.For<IRepository<QueueItem>>();
        mockRepo.GetByIdAsync(foreignTicket.Id, Arg.Any<CancellationToken>()).Returns(foreignTicket);
        var guardHandler = new DivertEmergencyPatientCommandHandler(mockRepo, uow, clinicContext);

        Func<Task> actGuard = () => guardHandler.Handle(command, CancellationToken.None);
        await actGuard.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*does not belong to the current clinic*");
    }

    [Fact]
    public async Task Probe_DivertEmergencyPatient_EmptyGuid_ThrowsBadRequestException()
    {
        var (_, _, _, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var handler = new DivertEmergencyPatientCommandHandler(queueRepo, uow, clinicContext);

        var command = new DivertEmergencyPatientCommand(
            Guid.Empty,
            "Manila Doctors",
            "Ambulance",
            "Paramedic Cruz",
            "Handover summary");

        Func<Task> act = () => handler.Handle(command, CancellationToken.None);
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*QueueItemId is required*");
    }

    [Theory]
    [InlineData("   ", "Ambulance", "Paramedic", "Handover details", "Destination hospital")]
    [InlineData(null, "Ambulance", "Paramedic", "Handover details", "Destination hospital")]
    [InlineData("Manila Doctors", "   ", "Paramedic", "Handover details", "Transport mode")]
    [InlineData("Manila Doctors", null, "Paramedic", "Handover details", "Transport mode")]
    [InlineData("Manila Doctors", "Ambulance", "   ", "Handover details", "Paramedic or escort name")]
    [InlineData("Manila Doctors", "Ambulance", null, "Handover details", "Paramedic or escort name")]
    [InlineData("Manila Doctors", "Ambulance", "Paramedic", "   ", "Clinical handover summary")]
    [InlineData("Manila Doctors", "Ambulance", "Paramedic", null, "Clinical handover summary")]
    public async Task Probe_DivertEmergencyPatient_WhitespaceOrNullInputs_ThrowBadRequestException(
        string? hospital, string? transport, string? escort, string? summary, string expectedErrorMessagePart)
    {
        var (clinicId, tenantId, staffId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var ticket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Juan Dela Cruz",
            QueueNumber = "Q-100",
            Status = QueueStatus.Triaged
        };
        await queueRepo.AddAsync(ticket, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new DivertEmergencyPatientCommandHandler(queueRepo, uow, clinicContext);
        var command = new DivertEmergencyPatientCommand(
            ticket.Id,
            hospital!,
            transport!,
            escort!,
            summary!,
            staffId);

        Func<Task> act = () => handler.Handle(command, CancellationToken.None);
        var ex = await act.Should().ThrowAsync<BadRequestException>();
        ex.WithMessage($"*{expectedErrorMessagePart}*");
    }

    [Theory]
    [InlineData(QueueStatus.Completed)]
    [InlineData(QueueStatus.Cancelled)]
    [InlineData(QueueStatus.NoShow)]
    [InlineData(QueueStatus.DischargedNonDoctor)]
    [InlineData(QueueStatus.Diverted)]
    public async Task Probe_DivertEmergencyPatient_DoubleDiversionOrClosedTickets_StrictlyRejected(QueueStatus terminalStatus)
    {
        var (clinicId, tenantId, staffId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var ticket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Closed Visit Patient",
            QueueNumber = "Q-CLOSED",
            Status = terminalStatus
        };
        await queueRepo.AddAsync(ticket, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new DivertEmergencyPatientCommandHandler(queueRepo, uow, clinicContext);
        var command = new DivertEmergencyPatientCommand(
            ticket.Id,
            "Philippine Heart Center",
            "Emergency Ambulance",
            "Paramedic Reyes",
            "Acute coronary syndrome transfer",
            staffId);

        Func<Task> act = () => handler.Handle(command, CancellationToken.None);
        var ex = await act.Should().ThrowAsync<BadRequestException>();
        ex.WithMessage($"*already closed with status '{terminalStatus}'*");
    }

    [Theory]
    [InlineData(QueueStatus.Waiting)]
    [InlineData(QueueStatus.Triaged)]
    [InlineData(QueueStatus.InConsultation)]
    [InlineData(QueueStatus.PendingProcedure)]
    [InlineData(QueueStatus.ReEvaluation)]
    [InlineData(QueueStatus.OnHold)]
    public async Task Probe_DivertEmergencyPatient_AllActiveWorkflows_CanBeSafelyDiverted(QueueStatus activeStatus)
    {
        var (clinicId, tenantId, staffId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var ticket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = $"Active Patient {activeStatus}",
            QueueNumber = $"Q-{activeStatus}",
            Status = activeStatus,
            CheckInTime = DateTime.UtcNow.AddMinutes(-25)
        };
        await queueRepo.AddAsync(ticket, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new DivertEmergencyPatientCommandHandler(queueRepo, uow, clinicContext);
        var command = new DivertEmergencyPatientCommand(
            ticket.Id,
            "   St. Luke's Medical Center - Global City   ",
            "   Advanced Cardiac Life Support Ambulance   ",
            "   Nurse Escort Maria Ocampo (PRC 081234)   ",
            "   Patient deteriorated into ventricular tachycardia with pulse; cardioversion team dispatched.   ",
            staffId);

        // Act
        var success = await handler.Handle(command, CancellationToken.None);

        // Assert
        success.Should().BeTrue();

        var updated = await queueRepo.GetByIdAsync(ticket.Id, CancellationToken.None);
        updated.Should().NotBeNull();
        updated!.Status.Should().Be(QueueStatus.Diverted);
        // Verify whitespace trimming
        updated.DivertedToFacility.Should().Be("St. Luke's Medical Center - Global City");
        updated.TransportMode.Should().Be("Advanced Cardiac Life Support Ambulance");
        updated.ParamedicOrEscortName.Should().Be("Nurse Escort Maria Ocampo (PRC 081234)");
        updated.HandoverSummary.Should().Be("Patient deteriorated into ventricular tachycardia with pulse; cardioversion team dispatched.");
        updated.DivertedAt.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromSeconds(5));
        updated.DivertedByStaffId.Should().Be(staffId);
        updated.CompletedTime.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromSeconds(5));
    }

    #endregion

    #region Group 3: TV Display Shielding Adversarial Probes

    [Fact]
    public async Task Probe_PublicQueueDisplayQuery_ShieldsDivertedEmergencyPatientsFromPublicDisplay()
    {
        var (clinicId, tenantId, _, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var clinicSettings = new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            ClinicName = "Care Clinic Adversarial",
            TenantSlug = "adv-tenant",
            FacilitySlug = "main-opd"
        };
        await settingsRepo.AddAsync(clinicSettings, CancellationToken.None);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // 1. Consultation Waiting -> UpNext
        var qWait = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Waiting Patient",
            QueueNumber = "Q-WAIT",
            QueueDate = today,
            VisitType = VisitType.Consultation,
            Status = QueueStatus.Waiting,
            CheckInTime = DateTime.UtcNow.AddMinutes(-30),
            SequenceNumber = 1
        };

        // 2. Consultation InConsultation -> NowServing
        var qConsult = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Serving Patient",
            QueueNumber = "Q-SERV",
            QueueDate = today,
            VisitType = VisitType.Consultation,
            Status = QueueStatus.InConsultation,
            CalledTime = DateTime.UtcNow.AddMinutes(-10),
            SequenceNumber = 2
        };

        // 3. Consultation Diverted -> MUST BE EXCLUDED FROM BOTH NowServing AND UpNext
        var qDivertedConsult = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Diverted ER Patient",
            QueueNumber = "Q-DIV-ER",
            QueueDate = today,
            VisitType = VisitType.Consultation,
            Status = QueueStatus.Diverted,
            DivertedToFacility = "City ER",
            SequenceNumber = 3
        };

        // 4. Procedure Diverted -> MUST BE EXCLUDED
        var qDivertedProc = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Diverted Procedure Patient",
            QueueNumber = "Q-DIV-PROC",
            QueueDate = today,
            VisitType = VisitType.StandaloneProcedure,
            Status = QueueStatus.Diverted,
            SequenceNumber = 4
        };

        // 5. Non-Doctor Discharged -> MUST BE EXCLUDED
        var qDischarged = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Discharged Patient",
            QueueNumber = "Q-DIS-NONDOC",
            QueueDate = today,
            VisitType = VisitType.VitalsCheckOnly,
            Status = QueueStatus.DischargedNonDoctor,
            SequenceNumber = 5
        };

        // 6. Retail Purchase Waiting -> Non-consultation waiting, MUST BE EXCLUDED from UpNext
        var qRetail = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Retail Walk-In Guest",
            QueueNumber = "Q-RETAIL",
            QueueDate = today,
            VisitType = VisitType.RetailPurchase,
            Status = QueueStatus.Waiting,
            SequenceNumber = 6
        };

        await queueRepo.AddAsync(qWait, CancellationToken.None);
        await queueRepo.AddAsync(qConsult, CancellationToken.None);
        await queueRepo.AddAsync(qDivertedConsult, CancellationToken.None);
        await queueRepo.AddAsync(qDivertedProc, CancellationToken.None);
        await queueRepo.AddAsync(qDischarged, CancellationToken.None);
        await queueRepo.AddAsync(qRetail, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetPublicQueueDisplayQueryHandler(queueRepo, settingsRepo, clinicContext);

        // Act
        var display = await handler.Handle(
            new GetPublicQueueDisplayQuery(ClinicId: clinicId, TenantSlug: "adv-tenant", FacilitySlug: "main-opd", Date: today),
            CancellationToken.None);

        // Assert
        display.Should().NotBeNull();

        // NowServing
        display!.NowServing.Should().HaveCount(1);
        display.NowServing[0].TicketNumber.Should().Be("Q-SERV");

        // UpNext
        display.UpNext.Should().HaveCount(1);
        display.UpNext[0].TicketNumber.Should().Be("Q-WAIT");

        // Diverted tickets must never appear on public screens
        display.UpNext.Should().NotContain(u => u.TicketNumber == "Q-DIV-ER");
        display.UpNext.Should().NotContain(u => u.TicketNumber == "Q-DIV-PROC");
        display.UpNext.Should().NotContain(u => u.TicketNumber == "Q-DIS-NONDOC");
        display.UpNext.Should().NotContain(u => u.TicketNumber == "Q-RETAIL");

        // PatientsWaitingCount must match UpNext count exactly
        display.PatientsWaitingCount.Should().Be(1);
    }

    #endregion

    #region Group 4: EOD Reconciliation Shielding Adversarial Probes

    [Fact]
    public async Task Probe_ReconcileEodCommand_ShieldsDivertedTicketsFromNoShowAndPreservesAuditData()
    {
        var (clinicId, tenantId, staffId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<EodReconciliationAudit>(context, sieve);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var divertTime = DateTime.UtcNow.AddHours(-3);

        // 1. Consultation Waiting -> should become NoShow
        var consultWaiting = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Consultation No-Show Candidate",
            QueueNumber = "Q-NOSHOW-1",
            QueueDate = today,
            VisitType = VisitType.Consultation,
            Status = QueueStatus.Waiting
        };

        // 2. Diverted Emergency Ticket -> MUST NOT BE MODIFIED!
        var divertedTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Emergency Trauma Divert",
            QueueNumber = "Q-DIVERTED-SECURE",
            QueueDate = today,
            VisitType = VisitType.Consultation,
            Status = QueueStatus.Diverted,
            DivertedToFacility = "East Avenue Medical Center Trauma Center",
            TransportMode = "Emergency Helicopter",
            ParamedicOrEscortName = "Flight Paramedic David Santos",
            HandoverSummary = "Polytrauma with severe pelvic fracture",
            DivertedAt = divertTime,
            DivertedByStaffId = staffId,
            CompletedTime = divertTime
        };

        // 3. Standalone Procedure Diverted -> MUST NOT BE MODIFIED!
        var procDiverted = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Procedure Divert",
            QueueNumber = "Q-PROC-DIVERT",
            QueueDate = today,
            VisitType = VisitType.StandaloneProcedure,
            Status = QueueStatus.Diverted,
            DivertedToFacility = "St. Luke's ER",
            TransportMode = "Ambulance",
            ParamedicOrEscortName = "Paramedic Leo",
            HandoverSummary = "Anaphylaxis to lidocaine local infiltration",
            DivertedAt = divertTime,
            DivertedByStaffId = staffId,
            CompletedTime = divertTime
        };

        // 4. Discharged Non-Doctor -> MUST NOT BE MODIFIED!
        var dischargedTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Discharged Vaccine Visit",
            QueueNumber = "Q-DISCHARGED",
            QueueDate = today,
            VisitType = VisitType.StandaloneProcedure,
            Status = QueueStatus.DischargedNonDoctor,
            CompletedTime = divertTime
        };

        // 5. Non-consultation Waiting (Retail) -> should become Cancelled, not NoShow
        var retailWaiting = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Retail Guest",
            QueueNumber = "Q-RETAIL-CANCEL",
            QueueDate = today,
            VisitType = VisitType.RetailPurchase,
            Status = QueueStatus.Waiting
        };

        await queueRepo.AddAsync(consultWaiting, CancellationToken.None);
        await queueRepo.AddAsync(divertedTicket, CancellationToken.None);
        await queueRepo.AddAsync(procDiverted, CancellationToken.None);
        await queueRepo.AddAsync(dischargedTicket, CancellationToken.None);
        await queueRepo.AddAsync(retailWaiting, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ReconcileEodCommandHandler(queueRepo, auditRepo, uow, clinicContext);

        // Act
        var result = await handler.Handle(new ReconcileEodCommand(today, TriggerType: "Manual", Reason: "Testing EOD Shielding"), CancellationToken.None);

        // Assert
        result.ReconciledCount.Should().Be(2, "Only the 2 waiting tickets (1 consultation + 1 retail) should be reconciled.");
        result.AffectedTicketNumbers.Should().Contain("Q-NOSHOW-1");
        result.AffectedTicketNumbers.Should().Contain("Q-RETAIL-CANCEL");
        result.AffectedTicketNumbers.Should().NotContain("Q-DIVERTED-SECURE");
        result.AffectedTicketNumbers.Should().NotContain("Q-PROC-DIVERT");
        result.AffectedTicketNumbers.Should().NotContain("Q-DISCHARGED");

        // Verify Diverted ticket state is 100% pristine
        var verifiedDivert = await queueRepo.GetByIdAsync(divertedTicket.Id, CancellationToken.None);
        verifiedDivert!.Status.Should().Be(QueueStatus.Diverted);
        verifiedDivert.DivertedToFacility.Should().Be("East Avenue Medical Center Trauma Center");
        verifiedDivert.TransportMode.Should().Be("Emergency Helicopter");
        verifiedDivert.ParamedicOrEscortName.Should().Be("Flight Paramedic David Santos");
        verifiedDivert.HandoverSummary.Should().Be("Polytrauma with severe pelvic fracture");
        verifiedDivert.DivertedAt.Should().Be(divertTime);
        verifiedDivert.CompletedTime.Should().Be(divertTime);

        // Verify DischargedNonDoctor ticket state is 100% pristine
        var verifiedDischarged = await queueRepo.GetByIdAsync(dischargedTicket.Id, CancellationToken.None);
        verifiedDischarged!.Status.Should().Be(QueueStatus.DischargedNonDoctor);

        // Verify Consultation waiting ticket became NoShow
        var verifiedNoShow = await queueRepo.GetByIdAsync(consultWaiting.Id, CancellationToken.None);
        verifiedNoShow!.Status.Should().Be(QueueStatus.NoShow);

        // Verify Retail waiting ticket became Cancelled (shielded from NoShow penalty)
        var verifiedCancelled = await queueRepo.GetByIdAsync(retailWaiting.Id, CancellationToken.None);
        verifiedCancelled!.Status.Should().Be(QueueStatus.Cancelled);
    }

    #endregion

    #region Group 5: Administrative Vault & SHA-256 Digest Probes

    [Fact]
    public async Task Probe_PatientChartQuery_OrdersDescendingAndPreservesSha256SecurityDigest()
    {
        var (clinicId, tenantId, staffId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var patientId = Guid.NewGuid();

        var medCertRepo = TestDbHelper.CreateRepository<MedicalCertificate>(context, sieve);
        var referralRepo = TestDbHelper.CreateRepository<ReferralLetter>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var triageRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        // Add 3 medical certificates with distinct timestamps and SHA-256 digests
        var certOld = new MedicalCertificate
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            CertificateNumber = "MC-OLD-01",
            PatientId = patientId,
            PatientName = "Adversarial Test Patient",
            DoctorId = staffId,
            DoctorName = "Dr. Test Adversarial",
            PrcLicenseNumber = "PRC-123456",
            Diagnosis = "Mild Dehydration",
            SecurityDigest = "1111111111111111111111111111111111111111111111111111111111111111",
            CreatedAt = DateTime.UtcNow.AddDays(-10)
        };
        var certMid = new MedicalCertificate
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            CertificateNumber = "MC-MID-02",
            PatientId = patientId,
            PatientName = "Adversarial Test Patient",
            DoctorId = staffId,
            DoctorName = "Dr. Test Adversarial",
            PrcLicenseNumber = "PRC-123456",
            Diagnosis = "Acute Gastroenteritis",
            SecurityDigest = "2222222222222222222222222222222222222222222222222222222222222222",
            CreatedAt = DateTime.UtcNow.AddDays(-3)
        };
        var certNew = new MedicalCertificate
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            CertificateNumber = "MC-NEW-03",
            PatientId = patientId,
            PatientName = "Adversarial Test Patient",
            DoctorId = staffId,
            DoctorName = "Dr. Test Adversarial",
            PrcLicenseNumber = "PRC-123456",
            Diagnosis = "Post-Infection Fatigue",
            SecurityDigest = "3333333333333333333333333333333333333333333333333333333333333333",
            CreatedAt = DateTime.UtcNow.AddMinutes(-5)
        };

        await medCertRepo.AddAsync(certOld, CancellationToken.None);
        await medCertRepo.AddAsync(certMid, CancellationToken.None);
        await medCertRepo.AddAsync(certNew, CancellationToken.None);

        // Add 2 referrals with distinct timestamps and digests
        var refOld = new ReferralLetter
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            ReferralNumber = "REF-OLD-01",
            PatientId = patientId,
            PatientName = "Adversarial Test Patient",
            ReferringDoctorId = staffId,
            ReferringDoctorName = "Dr. Test Adversarial",
            ReferredToFacility = "St. Luke's BGC",
            ReferredDepartment = "Cardiology",
            ReasonForReferral = "Expert evaluation",
            ProvisionalDiagnosis = "Atypical Chest Pain",
            ClinicalSummary = "Patient presents with persistent atypical discomfort.",
            SecurityDigest = "aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111",
            CreatedAt = DateTime.UtcNow.AddDays(-7)
        };
        var refNew = new ReferralLetter
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            ReferralNumber = "REF-NEW-02",
            PatientId = patientId,
            PatientName = "Adversarial Test Patient",
            ReferringDoctorId = staffId,
            ReferringDoctorName = "Dr. Test Adversarial",
            ReferredToFacility = "National Kidney and Transplant Institute",
            ReferredDepartment = "Nephrology",
            ReasonForReferral = "Renal assessment",
            ProvisionalDiagnosis = "Proteinuria",
            ClinicalSummary = "Patient with elevated creatinine.",
            SecurityDigest = "bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222",
            CreatedAt = DateTime.UtcNow.AddHours(-2)
        };

        await referralRepo.AddAsync(refOld, CancellationToken.None);
        await referralRepo.AddAsync(refNew, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetPatientChartQueryHandler(
            consultRepo, triageRepo, procRepo, labOrderRepo, invoiceRepo, clinicContext,
            medCertRepo: medCertRepo,
            referralRepo: referralRepo);

        // Act
        var chart = await handler.Handle(new GetPatientChartQuery(patientId), CancellationToken.None);

        // Assert
        chart.Should().NotBeNull();

        // Medical certificates verification
        chart.MedicalCertificates.Should().NotBeNull();
        chart.MedicalCertificates!.Should().HaveCount(3);
        // Strict chronological descending order
        chart.MedicalCertificates![0].CertificateNumber.Should().Be("MC-NEW-03");
        chart.MedicalCertificates[0].SecurityDigest.Should().Be("3333333333333333333333333333333333333333333333333333333333333333");
        chart.MedicalCertificates[1].CertificateNumber.Should().Be("MC-MID-02");
        chart.MedicalCertificates[2].CertificateNumber.Should().Be("MC-OLD-01");

        // Referral letters verification
        chart.ReferralLetters.Should().NotBeNull();
        chart.ReferralLetters!.Should().HaveCount(2);
        // Strict chronological descending order
        chart.ReferralLetters![0].ReferralNumber.Should().Be("REF-NEW-02");
        chart.ReferralLetters[0].ReferredToFacility.Should().Be("National Kidney and Transplant Institute");
        chart.ReferralLetters[0].SecurityDigest.Should().Be("bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222");
        chart.ReferralLetters[1].ReferralNumber.Should().Be("REF-OLD-01");
    }

    [Fact]
    public async Task Probe_PatientChartQuery_WhenNoAdministrativeDocuments_ReturnsEmptyListsSafely()
    {
        var (clinicId, tenantId, _, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var patientId = Guid.NewGuid();

        var medCertRepo = TestDbHelper.CreateRepository<MedicalCertificate>(context, sieve);
        var referralRepo = TestDbHelper.CreateRepository<ReferralLetter>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var triageRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        var handler = new GetPatientChartQueryHandler(
            consultRepo, triageRepo, procRepo, labOrderRepo, invoiceRepo, clinicContext,
            medCertRepo: medCertRepo,
            referralRepo: referralRepo);

        // Act
        var chart = await handler.Handle(new GetPatientChartQuery(patientId), CancellationToken.None);

        // Assert
        chart.Should().NotBeNull();
        chart.MedicalCertificates.Should().NotBeNull();
        chart.MedicalCertificates!.Should().BeEmpty();
        chart.ReferralLetters.Should().NotBeNull();
        chart.ReferralLetters!.Should().BeEmpty();
    }

    #endregion
}
