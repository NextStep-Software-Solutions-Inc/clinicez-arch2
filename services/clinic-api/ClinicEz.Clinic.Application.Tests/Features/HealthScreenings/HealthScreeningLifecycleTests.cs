using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Consultations.Commands;
using ClinicEz.Clinic.Application.Features.HealthScreenings.Commands;
using ClinicEz.Clinic.Application.Features.HealthScreenings.DTOs;
using ClinicEz.Clinic.Application.Features.HealthScreenings.Queries;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Application.Features.Queue.Commands;
using ClinicEz.Clinic.Application.Features.Reports.DTOs;
using ClinicEz.Clinic.Application.Features.Reports.Queries;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.Common;
using ClinicEz.Clinic.Application.Features.Yakap.Commands;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Application.Features.Yakap.WireBuilders;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.HealthScreenings;

public sealed class HealthScreeningLifecycleTests
{
    private const string ValidPatientPin = "12-345678901-8";
    private const string ValidPrincipalPin = "03-025000001-0";

    private static IClinicContext CreateClinicContext(
        Guid clinicId,
        string tenantId = "tenant-hs-test",
        Guid? staffId = null,
        string? staffName = null,
        string? staffRole = null,
        params string[] permissions)
    {
        var permList = permissions.ToList();
        var permSet = permissions.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var ctx = Substitute.For<IClinicContext>();
        ctx.ClinicId.Returns(clinicId);
        ctx.TenantId.Returns(tenantId);
        ctx.StaffId.Returns(staffId ?? Guid.NewGuid());
        ctx.StaffName.Returns(staffName ?? "Test Clinician");
        ctx.StaffRole.Returns(staffRole ?? "Nurse");
        ctx.Permissions.Returns(permList);
        ctx.HasPermission(Arg.Any<string>())
            .Returns(ci => permSet.Contains("*") || permSet.Contains(ci.Arg<string>()));
        return ctx;
    }

    private static Patient CreatePatient(Guid clinicId, string tenantId = "tenant-hs-test", DateOnly? dob = null, string? pin = ValidPatientPin) =>
        new()
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = $"PAT-{Guid.NewGuid().ToString()[..6].ToUpperInvariant()}",
            FirstName = "Maria",
            LastName = "Clara",
            DateOfBirth = dob ?? new DateOnly(1990, 6, 15),
            Sex = BiologicalSex.Female,
            ContactNumber = "09171234567",
            PhilHealthNumber = pin
        };

    private static ISender CreateDirectVisitSender(
        ApplicationDbContext context,
        IUnitOfWork uow,
        Sieve.Services.ISieveProcessor sieve,
        IClinicContext clinicContext)
    {
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var ensureHandler = new EnsureDirectVisitCommandHandler(
            queueRepo,
            uow,
            clinicContext,
            settingsRepository: settingsRepo);

        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Any<EnsureDirectVisitCommand>(), Arg.Any<CancellationToken>())
            .Returns(ci => ensureHandler.Handle(ci.Arg<EnsureDirectVisitCommand>(), ci.Arg<CancellationToken>()));
        return sender;
    }

    private static SaveHealthScreeningProgressCommandHandler CreateSaveHandler(
        ApplicationDbContext context,
        IUnitOfWork uow,
        Sieve.Services.ISieveProcessor sieve,
        IClinicContext clinicContext,
        ISender sender) =>
        new(
            TestDbHelper.CreateRepository<HealthScreening>(context, sieve),
            TestDbHelper.CreateRepository<Patient>(context, sieve),
            TestDbHelper.CreateRepository<QueueItem>(context, sieve),
            uow,
            clinicContext,
            sender,
            TestDbHelper.CreateRepository<FacilitySettings>(context, sieve),
            TestDbHelper.CreateRepository<ServiceItem>(context, sieve),
            TestDbHelper.CreateRepository<PatientVitals>(context, sieve),
            TestDbHelper.CreateRepository<PatientPhysicalExam>(context, sieve),
            TestDbHelper.CreateRepository<NcdRiskAssessment>(context, sieve),
            TestDbHelper.CreateRepository<LabOrder>(context, sieve),
            TestDbHelper.CreateRepository<PatientPhilHealthMembership>(context, sieve),
            TestDbHelper.CreateRepository<PatientYakapEnlistment>(context, sieve),
            staffRepo: TestDbHelper.CreateRepository<StaffMember>(context, sieve));

    private static CompleteHealthScreeningCommandHandler CreateCompleteHandler(
        ApplicationDbContext context,
        IUnitOfWork uow,
        Sieve.Services.ISieveProcessor sieve,
        IClinicContext clinicContext,
        IPhilHealthSequenceGenerator? seqGen = null) =>
        new(
            TestDbHelper.CreateRepository<HealthScreening>(context, sieve),
            TestDbHelper.CreateRepository<Patient>(context, sieve),
            TestDbHelper.CreateRepository<QueueItem>(context, sieve),
            uow,
            clinicContext,
            TestDbHelper.CreateRepository<FacilitySettings>(context, sieve),
            TestDbHelper.CreateRepository<ServiceItem>(context, sieve),
            TestDbHelper.CreateRepository<PatientVitals>(context, sieve),
            TestDbHelper.CreateRepository<PatientPhysicalExam>(context, sieve),
            TestDbHelper.CreateRepository<NcdRiskAssessment>(context, sieve),
            TestDbHelper.CreateRepository<LabOrder>(context, sieve),
            TestDbHelper.CreateRepository<PatientPhilHealthMembership>(context, sieve),
            TestDbHelper.CreateRepository<PatientYakapEnlistment>(context, sieve),
            TestDbHelper.CreateRepository<StaffMember>(context, sieve),
            seqGen);

    // =========================================================================
    // 1. Lazy Direct-Visit Creation & Reuse
    // =========================================================================

    [Fact]
    public async Task SaveProgress_LazyDirectVisit_CreatesOnceAndReusesActiveVisit()
    {
        var clinicId = Guid.NewGuid();
        var ctx = CreateClinicContext(clinicId, staffName: "Nurse Joy", permissions: [ClinicPermissions.TriageWrite, ClinicPermissions.PatientsWrite]);
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(ctx);

        var patient = CreatePatient(clinicId);
        context.Patients.Add(patient);
        context.ServiceItems.AddRange(GeneralMedicalCatalogDefaults.CreateDefaults("tenant-hs-test", clinicId));
        await uow.SaveChangesAsync();

        var sender = CreateDirectVisitSender(context, uow, sieve, ctx);
        var saveHandler = CreateSaveHandler(context, uow, sieve, ctx, sender);

        // First save without QueueItemId creates DV-001 (PreventiveHealthAssessment, Triaged) + HealthScreening
        var first = await saveHandler.Handle(new SaveHealthScreeningProgressCommand(
            Id: null,
            PatientId: patient.Id,
            QueueItemId: null,
            ScreeningType: HealthScreeningType.RoutineWellness,
            WorkflowMode: VisitWorkflowMode.Regular,
            NurseScreeningNotes: "Initial intake"), CancellationToken.None);

        first.QueueItemId.Should().NotBeEmpty();
        first.QueueNumber.Should().Be("DV-001");
        first.QueueStatus.Should().Be(QueueStatus.Triaged);
        first.Status.Should().Be(HealthScreeningStatus.InProgress);
        first.ServiceItemCode.Should().Be("HEALTH-SCREEN");

        // Second save without QueueItemId reuses same QueueItem & same HealthScreening
        var second = await saveHandler.Handle(new SaveHealthScreeningProgressCommand(
            Id: null,
            PatientId: patient.Id,
            QueueItemId: null,
            ScreeningType: HealthScreeningType.YakapFpe,
            WorkflowMode: VisitWorkflowMode.YakapAvailment,
            PhilHealthAtc: "ATC-2026-001"), CancellationToken.None);

        second.Id.Should().Be(first.Id);
        second.QueueItemId.Should().Be(first.QueueItemId);
        second.WorkflowMode.Should().Be(VisitWorkflowMode.YakapAvailment);
        second.ServiceItemId.Should().BeNull();

        (await context.QueueItems.CountAsync()).Should().Be(1);
        (await context.HealthScreenings.CountAsync()).Should().Be(1);
        var reusedQueue = await context.QueueItems.SingleAsync();
        reusedQueue.VisitType.Should().Be(VisitType.PreventiveHealthAssessment);
        reusedQueue.VisitWorkflowMode.Should().Be(VisitWorkflowMode.YakapAvailment);
    }

    // =========================================================================
    // 2. Nurse Stations 1-2 Save & Doctor Handoff
    // =========================================================================

    [Fact]
    public async Task SaveProgress_SendToDoctor_TransitionsToAwaitingDoctorAndHydratesDetail()
    {
        var clinicId = Guid.NewGuid();
        var nurseId = Guid.NewGuid();
        var ctx = CreateClinicContext(clinicId, staffId: nurseId, staffName: "Nurse Ana", permissions: [ClinicPermissions.TriageWrite, ClinicPermissions.PatientsWrite]);
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(ctx);

        var patient = CreatePatient(clinicId);
        var queue = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            PatientName = "Maria Clara",
            QueueNumber = "V-001",
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.PreventiveHealthAssessment,
            Status = QueueStatus.Waiting
        };
        var vitals = new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = queue.Id,
            SystolicBp = 120,
            DiastolicBp = 80,
            HeartRateBpm = 72
        };
        var ncd = new NcdRiskAssessment
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            RiskBand = "BandA"
        };
        context.Patients.Add(patient);
        context.QueueItems.Add(queue);
        context.PatientVitals.Add(vitals);
        context.NcdRiskAssessments.Add(ncd);
        await uow.SaveChangesAsync();

        var sender = CreateDirectVisitSender(context, uow, sieve, ctx);
        var saveHandler = CreateSaveHandler(context, uow, sieve, ctx, sender);

        var saved = await saveHandler.Handle(new SaveHealthScreeningProgressCommand(
            Id: null,
            PatientId: patient.Id,
            QueueItemId: queue.Id,
            ScreeningType: HealthScreeningType.AnnualPhysicalExam,
            WorkflowMode: VisitWorkflowMode.Regular,
            NcdRiskAssessmentId: ncd.Id,
            NurseScreeningNotes: "Ready for MD PE",
            AdultsRoutineScreeningCode: "FBS,LIPID",
            SendToDoctor: true), CancellationToken.None);

        saved.Status.Should().Be(HealthScreeningStatus.AwaitingDoctor);
        saved.ScreenedByNurseId.Should().Be(nurseId);
        saved.ScreenedByNurseName.Should().Be("Nurse Ana");
        saved.NurseCompletedAtUtc.Should().NotBeNull();
        saved.PatientVitalsId.Should().Be(vitals.Id);
        saved.NcdRiskAssessmentId.Should().Be(ncd.Id);
        saved.AdultsRoutineScreeningCode.Should().Be("FBS,LIPID");
        saved.Vitals.Should().NotBeNull();
        saved.NcdRiskAssessment.Should().NotBeNull();
        saved.RequiresPhysicianSignOff.Should().BeTrue();

        (await context.QueueItems.SingleAsync(q => q.Id == queue.Id)).Status.Should().Be(QueueStatus.Triaged);

        var listHandler = new GetPatientHealthScreeningsQueryHandler(
            TestDbHelper.CreateRepository<HealthScreening>(context, sieve),
            ctx,
            TestDbHelper.CreateRepository<QueueItem>(context, sieve),
            TestDbHelper.CreateRepository<ServiceItem>(context, sieve));
        var list = await listHandler.Handle(new GetPatientHealthScreeningsQuery(PatientId: patient.Id), CancellationToken.None);
        list.Should().ContainSingle(s => s.Id == saved.Id && s.Status == HealthScreeningStatus.AwaitingDoctor);
    }

    // =========================================================================
    // 3. Completion Authority Matrix (Routine Nurse, APE Nurse 403, Physician, YAKAP Toggle)
    // =========================================================================

    [Fact]
    public async Task CompleteScreening_EnforcesAuthorityMatrixAcrossNurseAndPhysician()
    {
        var clinicId = Guid.NewGuid();
        var nurseCtx = CreateClinicContext(clinicId, staffName: "Nurse Joy", staffRole: "Nurse",
            permissions: [ClinicPermissions.TriageWrite, ClinicPermissions.PatientsWrite, ClinicPermissions.QueueCompleteNonDoctor]);
        var doctorCtx = CreateClinicContext(clinicId, staffName: "Dr. Jose", staffRole: "Doctor",
            permissions: [ClinicPermissions.ConsultationsWrite, ClinicPermissions.ConsultationsSign, ClinicPermissions.PatientsWrite]);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(nurseCtx);
        var patient = CreatePatient(clinicId);
        context.Patients.Add(patient);

        var qRoutine = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            PatientName = "Maria Clara",
            QueueNumber = "V-001",
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.PreventiveHealthAssessment,
            Status = QueueStatus.Triaged
        };
        var vRoutine = new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = qRoutine.Id,
            SystolicBp = 115,
            DiastolicBp = 75
        };
        var sRoutine = new HealthScreening
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = qRoutine.Id,
            PatientVitalsId = vRoutine.Id,
            ScreeningType = HealthScreeningType.RoutineWellness,
            WorkflowMode = VisitWorkflowMode.Regular,
            Status = HealthScreeningStatus.InProgress
        };

        var qApe = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            PatientName = "Maria Clara",
            QueueNumber = "V-002",
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.PreventiveHealthAssessment,
            Status = QueueStatus.Triaged
        };
        var vApe = new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = qApe.Id,
            SystolicBp = 120,
            DiastolicBp = 80
        };
        var sApe = new HealthScreening
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = qApe.Id,
            PatientVitalsId = vApe.Id,
            ScreeningType = HealthScreeningType.AnnualPhysicalExam,
            WorkflowMode = VisitWorkflowMode.Regular,
            Status = HealthScreeningStatus.AwaitingDoctor
        };

        context.QueueItems.AddRange(qRoutine, qApe);
        context.PatientVitals.AddRange(vRoutine, vApe);
        context.HealthScreenings.AddRange(sRoutine, sApe);
        await uow.SaveChangesAsync();

        // 3a. Nurse completes RoutineWellness -> DischargedNonDoctor
        var nurseComplete = CreateCompleteHandler(context, uow, sieve, nurseCtx);
        var routineResult = await nurseComplete.Handle(new CompleteHealthScreeningCommand(
            sRoutine.Id,
            HealthScreeningDisposition.Cleared,
            ClinicalImpression: "Normal wellness screen"), CancellationToken.None);

        routineResult.Status.Should().Be(HealthScreeningStatus.Completed);
        routineResult.QueueStatus.Should().Be(QueueStatus.DischargedNonDoctor);

        // 3b. Nurse attempting APE -> ForbiddenException (403)
        await FluentActions.Invoking(() => nurseComplete.Handle(new CompleteHealthScreeningCommand(
                sApe.Id,
                HealthScreeningDisposition.Cleared), CancellationToken.None))
            .Should().ThrowAsync<ForbiddenException>();

        // 3c. Doctor attempting APE without PE -> BadRequestException
        var docComplete = CreateCompleteHandler(context, uow, sieve, doctorCtx);
        await FluentActions.Invoking(() => docComplete.Handle(new CompleteHealthScreeningCommand(
                sApe.Id,
                HealthScreeningDisposition.Cleared), CancellationToken.None))
            .Should().ThrowAsync<BadRequestException>();

        // 3d. Doctor completes APE with PatientPhysicalExam -> Completed
        var pe = new PatientPhysicalExam
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            GeneralSurveyStatus = GeneralSurveyStatus.Normal,
            GenSurveyId = "1",
            SkinId = "1",
            HeentId = "11",
            ChestId = "6",
            HeartId = "5",
            AbdomenId = "7",
            NeuroId = "6",
            RectalId = "1",
            GuId = "1"
        };
        context.PatientPhysicalExams.Add(pe);
        await uow.SaveChangesAsync();

        var apeResult = await docComplete.Handle(new CompleteHealthScreeningCommand(
            sApe.Id,
            HealthScreeningDisposition.Cleared,
            ClinicalImpression: "Fit for work",
            PatientPhysicalExamId: pe.Id), CancellationToken.None);

        apeResult.Status.Should().Be(HealthScreeningStatus.Completed);
        apeResult.QueueStatus.Should().Be(QueueStatus.Completed);
        apeResult.PatientPhysicalExamId.Should().Be(pe.Id);
        apeResult.ExaminedByDoctorName.Should().Be("Dr. Jose");
    }

    [Fact]
    public async Task CompleteScreening_YakapFpe_NurseFacilitatorToggleControls403VsFacilitatorH()
    {
        var clinicId = Guid.NewGuid();
        var nurseCtx = CreateClinicContext(clinicId, staffName: "Midwife Elena", staffRole: "Nurse",
            permissions: [ClinicPermissions.TriageWrite, ClinicPermissions.PatientsWrite, ClinicPermissions.QueueCompleteNonDoctor]);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(nurseCtx);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            ClinicName = "Rural Health Clinic",
            AccreditationNumber = "P01234567",
            AllowNurseMidwifeYakapFpeFacilitator = false
        };
        var patient = CreatePatient(clinicId);
        var enlistment = new PatientYakapEnlistment
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            EffectiveYear = today.Year,
            Status = YakapEnlistmentStatus.Active,
            EnlistmentDate = new DateOnly(today.Year, 1, 1),
            ValidUntil = new DateOnly(today.Year, 12, 31)
        };
        var queue = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            PatientName = "Maria Clara",
            QueueNumber = "V-010",
            QueueDate = today,
            VisitType = VisitType.PreventiveHealthAssessment,
            VisitWorkflowMode = VisitWorkflowMode.YakapAvailment,
            Status = QueueStatus.Triaged
        };
        var vitals = new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = queue.Id,
            SystolicBp = 110,
            DiastolicBp = 70
        };
        var screening = new HealthScreening
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = queue.Id,
            PatientVitalsId = vitals.Id,
            ScreeningType = HealthScreeningType.YakapFpe,
            WorkflowMode = VisitWorkflowMode.YakapAvailment,
            Status = HealthScreeningStatus.InProgress,
            IsWalkedIn = true
        };

        context.Settings.Add(settings);
        context.Patients.Add(patient);
        context.PatientYakapEnlistments.Add(enlistment);
        context.QueueItems.Add(queue);
        context.PatientVitals.Add(vitals);
        context.HealthScreenings.Add(screening);
        await uow.SaveChangesAsync();

        var seqGen = new PhilHealthSequenceGenerator(context, NullLogger<PhilHealthSequenceGenerator>.Instance);
        var handler = CreateCompleteHandler(context, uow, sieve, nurseCtx, seqGen);

        // Toggle OFF -> 403 ForbiddenException
        await FluentActions.Invoking(() => handler.Handle(new CompleteHealthScreeningCommand(
                screening.Id,
                HealthScreeningDisposition.Cleared), CancellationToken.None))
            .Should().ThrowAsync<ForbiddenException>();

        // Toggle ON -> Allowed as FacilitatorType "H", DischargedNonDoctor
        settings.AllowNurseMidwifeYakapFpeFacilitator = true;
        await uow.SaveChangesAsync();

        var completed = await handler.Handle(new CompleteHealthScreeningCommand(
            screening.Id,
            HealthScreeningDisposition.ClearedWithAdvice), CancellationToken.None);

        completed.Status.Should().Be(HealthScreeningStatus.Completed);
        completed.QueueStatus.Should().Be(QueueStatus.DischargedNonDoctor);
        completed.ProfilingTransNo.Should().StartWith("P");

        var stamped = await context.PatientYakapEnlistments.SingleAsync(e => e.Id == enlistment.Id);
        stamped.FacilitatorType.Should().Be("H");
        stamped.FacilitatorName.Should().Be("Midwife Elena");
        stamped.ProfilingTransNo.Should().Be(completed.ProfilingTransNo);
        stamped.ProfilingAtc.Should().Be("WALKED-IN");
    }

    // =========================================================================
    // 4. YAKAP FPE Atomic Stamping + Annex A Wire Builder + Negative Readiness
    // =========================================================================

    [Fact]
    public async Task CompleteScreening_YakapFpe_StampsEnlistmentAndBuildsEncryptedAnnexAPayload()
    {
        var clinicId = Guid.NewGuid();
        var doctorCtx = CreateClinicContext(clinicId, staffName: "Dr. Rizal", staffRole: "Doctor",
            permissions: [ClinicPermissions.ConsultationsWrite, ClinicPermissions.ConsultationsSign, ClinicPermissions.PatientsWrite]);
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(doctorCtx);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            ClinicName = "Manila Health Center",
            AccreditationNumber = "P09001234",
            AllowNurseMidwifeYakapFpeFacilitator = false
        };
        var patient = CreatePatient(clinicId);
        var priorEnlistment = new PatientYakapEnlistment
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            EffectiveYear = today.Year - 1,
            Status = YakapEnlistmentStatus.Expired,
            EnlistmentDate = new DateOnly(today.Year - 1, 1, 10),
            ValidUntil = new DateOnly(today.Year - 1, 12, 31),
            ProfilingTransNo = $"P09001234{today.Year - 1}00001"
        };
        var currentEnlistment = new PatientYakapEnlistment
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            EffectiveYear = today.Year,
            Status = YakapEnlistmentStatus.Active,
            EnlistmentDate = new DateOnly(today.Year, 1, 5),
            ValidUntil = new DateOnly(today.Year, 12, 31)
        };
        var queue = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            PatientName = "Maria Clara",
            QueueNumber = "DV-001",
            IsDirectVisit = true,
            QueueDate = today,
            VisitType = VisitType.PreventiveHealthAssessment,
            VisitWorkflowMode = VisitWorkflowMode.YakapAvailment,
            Status = QueueStatus.Triaged
        };
        var vitals = new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = queue.Id,
            SystolicBp = 118,
            DiastolicBp = 76,
            HeartRateBpm = 70,
            HeightCm = 160m,
            WeightKg = 55m,
            Bmi = 21.5m
        };
        var pe = new PatientPhysicalExam
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            GeneralSurveyStatus = GeneralSurveyStatus.Normal,
            GenSurveyId = "1",
            SkinId = "1",
            HeentId = "11",
            ChestId = "6",
            HeartId = "5",
            AbdomenId = "7",
            NeuroId = "6",
            RectalId = "1",
            GuId = "1"
        };
        var social = new PatientSocialHistory
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            IsSmoker = false,
            SmokingStatus = "never",
            IsAlcoholDrinker = false,
            AlcoholStatus = "never"
        };
        var ncd = new NcdRiskAssessment
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            AssessmentDate = DateTime.UtcNow,
            RiskBand = "BandA",
            HasChestPain = false
        };
        var screening = new HealthScreening
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = queue.Id,
            PatientVitalsId = vitals.Id,
            PatientPhysicalExamId = pe.Id,
            NcdRiskAssessmentId = ncd.Id,
            ScreeningType = HealthScreeningType.YakapFpe,
            WorkflowMode = VisitWorkflowMode.YakapAvailment,
            Status = HealthScreeningStatus.AwaitingDoctor,
            PhilHealthAtc = "ATC-998877",
            IsWalkedIn = false,
            ServiceDeliveryMethod = YakapServiceDeliveryMethod.OutOfFacility
        };

        context.Settings.Add(settings);
        context.Patients.Add(patient);
        context.PatientYakapEnlistments.AddRange(priorEnlistment, currentEnlistment);
        context.QueueItems.Add(queue);
        context.PatientVitals.Add(vitals);
        context.PatientPhysicalExams.Add(pe);
        context.PatientSocialHistories.Add(social);
        context.NcdRiskAssessments.Add(ncd);
        context.HealthScreenings.Add(screening);
        await uow.SaveChangesAsync();

        var seqGen = new PhilHealthSequenceGenerator(context, NullLogger<PhilHealthSequenceGenerator>.Instance);
        var handler = CreateCompleteHandler(context, uow, sieve, doctorCtx, seqGen);

        var result = await handler.Handle(new CompleteHealthScreeningCommand(
            screening.Id,
            HealthScreeningDisposition.Cleared,
            ClinicalImpression: "Cleared annual FPE"), CancellationToken.None);

        result.ProfilingTransNo.Should().StartWith("P");
        result.FpeClassificationType.Should().Be("2"); // Repeat FPE because prior year has ProfilingTransNo
        result.YakapEnlistmentId.Should().Be(currentEnlistment.Id);

        var stamped = await context.PatientYakapEnlistments.SingleAsync(e => e.Id == currentEnlistment.Id);
        stamped.CaseNo.Should().HaveLength(23).And.StartWith("C");
        stamped.ProfilingTransNo.Should().Be(result.ProfilingTransNo);
        stamped.ProfilingDate.Should().NotBeNull();
        stamped.ProfilingTime.Should().NotBeNull();
        stamped.ProfilingAtc.Should().Be("ATC-998877");
        stamped.ServiceDeliveryMethod.Should().Be("2");
        stamped.FacilitatorType.Should().Be("P");
        stamped.FacilitatorName.Should().Be("Dr. Rizal");

        // Build & Encrypt Annex A wire payload
        var wireBuilder = new YakapFpeWireBuilder();
        var encryptor = new PhilHealthPayloadEncryptor();
        const string cipherKey = "PCAPI-TEST-CIPHER-KEY-0001";

        var encResult = wireBuilder.BuildEncryptedPayload(new YakapFpeContext
        {
            Facility = settings,
            Patient = patient,
            Vitals = vitals,
            PhysicalExam = pe,
            SocialHistory = social,
            NcdAssessment = ncd,
            HealthScreening = await context.HealthScreenings.SingleAsync(hs => hs.Id == screening.Id),
            Enlistment = stamped
        }, cipherKey, encryptor);

        encResult.IsSuccess.Should().BeTrue();
        var decryptedJson = encryptor.DecryptJson(encResult.Value!, cipherKey);
        using var doc = JsonDocument.Parse(decryptedJson);
        var root = doc.RootElement;

        root.GetProperty("pHciAccreNo").GetString().Should().Be("P09001234");
        root.GetProperty("pHciCaseNo").GetString().Should().Be(stamped.CaseNo);
        root.GetProperty("pPatientPin").GetString().Should().Be(ValidPatientPin);
        root.GetProperty("pProfilingTransNo").GetString().Should().Be(stamped.ProfilingTransNo);
        root.GetProperty("pProfilingDate").GetString().Should().MatchRegex(@"^\d{4}-\d{2}-\d{2}$");
        root.GetProperty("pProfilingTime").GetString().Should().MatchRegex(@"^\d{2}:\d{2}:\d{2}$");
        root.GetProperty("pProfilingAtc").GetString().Should().Be("ATC-998877");
        root.GetProperty("pIsWalkedIn").GetString().Should().Be("N");
        root.GetProperty("pServiceDeliveryMethod").GetString().Should().Be("2");
        root.GetProperty("pFpeClassificationType").GetString().Should().Be("2");
        root.GetProperty("pFacilitatorType").GetString().Should().Be("P");
        root.GetProperty("pFacilitatorName").GetString().Should().Be("Dr. Rizal");
        root.GetProperty("pPhysicalExam").GetProperty("pGeneralSurveyId").GetString().Should().Be("1");
        root.GetProperty("pSocialHistory").GetProperty("pIsSmoker").GetString().Should().Be("N");
        root.GetProperty("pNcdAssessment").GetProperty("pAssessmentDate").GetString().Should().MatchRegex(@"^\d{4}-\d{2}-\d{2}$");
    }

    [Fact]
    public async Task CompleteScreening_YakapFpe_NegativeReadinessFailsWithoutStamping()
    {
        var clinicId = Guid.NewGuid();
        var doctorCtx = CreateClinicContext(clinicId, staffName: "Dr. Rizal", staffRole: "Doctor",
            permissions: [ClinicPermissions.ConsultationsWrite, ClinicPermissions.ConsultationsSign]);
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(doctorCtx);

        var patient = CreatePatient(clinicId, pin: null); // Missing PIN!
        var queue = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            PatientName = "Maria Clara",
            QueueNumber = "V-011",
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.PreventiveHealthAssessment,
            VisitWorkflowMode = VisitWorkflowMode.YakapAvailment
        };
        var vitals = new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = queue.Id,
            SystolicBp = 120,
            DiastolicBp = 80
        };
        var pe = new PatientPhysicalExam
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            GeneralSurveyStatus = GeneralSurveyStatus.Normal
        };
        var screening = new HealthScreening
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = queue.Id,
            PatientVitalsId = vitals.Id,
            PatientPhysicalExamId = pe.Id,
            ScreeningType = HealthScreeningType.YakapFpe,
            WorkflowMode = VisitWorkflowMode.YakapAvailment,
            Status = HealthScreeningStatus.AwaitingDoctor,
            IsWalkedIn = false,
            PhilHealthAtc = null // Missing ATC too!
        };

        context.Patients.Add(patient);
        context.QueueItems.Add(queue);
        context.PatientVitals.Add(vitals);
        context.PatientPhysicalExams.Add(pe);
        context.HealthScreenings.Add(screening);
        await uow.SaveChangesAsync();

        var detailHandler = new GetHealthScreeningByIdQueryHandler(
            TestDbHelper.CreateRepository<HealthScreening>(context, sieve),
            TestDbHelper.CreateRepository<Patient>(context, sieve),
            doctorCtx,
            TestDbHelper.CreateRepository<QueueItem>(context, sieve),
            vitalsRepo: TestDbHelper.CreateRepository<PatientVitals>(context, sieve),
            physicalExamRepo: TestDbHelper.CreateRepository<PatientPhysicalExam>(context, sieve),
            membershipRepo: TestDbHelper.CreateRepository<PatientPhilHealthMembership>(context, sieve),
            enlistmentRepo: TestDbHelper.CreateRepository<PatientYakapEnlistment>(context, sieve));

        var detail = await detailHandler.Handle(new GetHealthScreeningByIdQuery(screening.Id), CancellationToken.None);
        detail.YakapReadiness.Should().NotBeNull();
        detail.YakapReadiness!.IsReady.Should().BeFalse();
        detail.YakapReadiness.HasValidPin.Should().BeFalse();
        detail.YakapReadiness.HasActiveEnlistment.Should().BeFalse();
        detail.YakapReadiness.HasAtcOrWalkIn.Should().BeFalse();

        var completeHandler = CreateCompleteHandler(context, uow, sieve, doctorCtx, new PhilHealthSequenceGenerator(context, NullLogger<PhilHealthSequenceGenerator>.Instance));
        await FluentActions.Invoking(() => completeHandler.Handle(new CompleteHealthScreeningCommand(
                screening.Id,
                HealthScreeningDisposition.Cleared), CancellationToken.None))
            .Should().ThrowAsync<BadRequestException>();

        (await context.HealthScreenings.SingleAsync(hs => hs.Id == screening.Id)).ProfilingTransNo.Should().BeNull();
    }

    // =========================================================================
    // 5. Escalation Preserving QueueItemId & Vitals
    // =========================================================================

    [Fact]
    public async Task EscalateScreening_PreservesQueueItemIdAndVitals_TransitionsVisitType()
    {
        var clinicId = Guid.NewGuid();
        var ctx = CreateClinicContext(clinicId, staffName: "Nurse Joy", permissions: [ClinicPermissions.TriageWrite, ClinicPermissions.PatientsWrite]);
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(ctx);

        var patient = CreatePatient(clinicId);
        var queue = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            PatientName = "Maria Clara",
            QueueNumber = "DV-002",
            IsDirectVisit = true,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.PreventiveHealthAssessment,
            Status = QueueStatus.Triaged,
            Priority = QueuePriority.Routine
        };
        var vitals = new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = queue.Id,
            SystolicBp = 190,
            DiastolicBp = 115
        };
        var screening = new HealthScreening
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = queue.Id,
            PatientVitalsId = vitals.Id,
            ScreeningType = HealthScreeningType.RoutineWellness,
            Status = HealthScreeningStatus.InProgress
        };

        context.Patients.Add(patient);
        context.QueueItems.Add(queue);
        context.PatientVitals.Add(vitals);
        context.HealthScreenings.Add(screening);
        await uow.SaveChangesAsync();

        var escalateHandler = new EscalateHealthScreeningCommandHandler(
            TestDbHelper.CreateRepository<HealthScreening>(context, sieve),
            TestDbHelper.CreateRepository<Patient>(context, sieve),
            TestDbHelper.CreateRepository<QueueItem>(context, sieve),
            uow,
            ctx,
            vitalsRepo: TestDbHelper.CreateRepository<PatientVitals>(context, sieve));

        var escalated = await escalateHandler.Handle(new EscalateHealthScreeningCommand(
            screening.Id,
            Reason: "Hypertensive crisis 190/115",
            IsUrgent: true), CancellationToken.None);

        escalated.Status.Should().Be(HealthScreeningStatus.EscalatedToConsultation);
        escalated.Disposition.Should().Be(HealthScreeningDisposition.EscalatedToConsultation);
        escalated.QueueItemId.Should().Be(queue.Id);
        escalated.Vitals.Should().NotBeNull();
        escalated.Vitals!.SystolicBp.Should().Be(190);

        var updatedQueue = await context.QueueItems.SingleAsync(q => q.Id == queue.Id);
        updatedQueue.VisitType.Should().Be(VisitType.UrgentCareVisit);
        updatedQueue.Status.Should().Be(QueueStatus.Triaged);
        updatedQueue.Priority.Should().Be(QueuePriority.Urgent);
    }

    // =========================================================================
    // 6. 1NF PhilHealth Membership (DD without PIN), Enlistments & YakapProfileController DB Read
    // =========================================================================

    [Fact]
    public async Task PhilHealthCoverageAndProfileController_Persist1NfAndReadFromDb()
    {
        var clinicId = Guid.NewGuid();
        var ctx = CreateClinicContext(clinicId, permissions: [ClinicPermissions.PatientsRead, ClinicPermissions.PatientsWrite]);
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(ctx);

        // Adult patient (born 1985) who is actually a Dependent (DD, Disabled "D") without own PIN
        var adultDependent = CreatePatient(clinicId, dob: new DateOnly(1985, 3, 20), pin: ValidPatientPin);
        context.Patients.Add(adultDependent);
        await uow.SaveChangesAsync();

        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var membershipRepo = TestDbHelper.CreateRepository<PatientPhilHealthMembership>(context, sieve);
        var enlistmentRepo = TestDbHelper.CreateRepository<PatientYakapEnlistment>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var upsertHandler = new UpsertPatientPhilHealthMembershipCommandHandler(patientRepo, membershipRepo, uow, ctx);
        var upsertValidator = new UpsertPatientPhilHealthMembershipCommandValidator();

        var invalidCmd = new UpsertPatientPhilHealthMembershipCommand(
            adultDependent.Id,
            MemberType: "DD",
            DependentRelationship: "D",
            PhilHealthPin: null,
            PrincipalMemberPin: "12-345678901-9", // invalid Mod-11
            PrincipalLastName: "Clara",
            PrincipalFirstName: "Juan",
            PrincipalDateOfBirth: new DateOnly(1960, 1, 1));
        upsertValidator.Validate(invalidCmd).IsValid.Should().BeFalse();

        var validCmd = new UpsertPatientPhilHealthMembershipCommand(
            adultDependent.Id,
            MemberType: "DD",
            DependentRelationship: "D",
            PhilHealthPin: null,
            PrincipalMemberPin: ValidPrincipalPin,
            PrincipalLastName: "Clara",
            PrincipalFirstName: "Juan",
            PrincipalDateOfBirth: new DateOnly(1960, 1, 1),
            DefaultWalkInAtc: "WALKIN-01");
        upsertValidator.Validate(validCmd).IsValid.Should().BeTrue();

        var memDto = await upsertHandler.Handle(validCmd, CancellationToken.None);
        memDto.MemberType.Should().Be("DD");
        memDto.DependentRelationship.Should().Be("D");
        memDto.PhilHealthPin.Should().BeNull();
        memDto.PrincipalMemberPin.Should().Be(ValidPrincipalPin);

        var dbMem = await context.PatientPhilHealthMemberships.SingleAsync(m => m.PatientId == adultDependent.Id);
        dbMem.MemberPin.Should().Be(string.Empty); // NOT NULL column satisfied
        (await context.Patients.SingleAsync(p => p.Id == adultDependent.Id)).PhilHealthNumber.Should().BeNull();

        // Historical enlistment preservation (2025 preserved when 2026 added + renewed in place)
        var trackedPatient = await context.Patients
            .Include(p => p.YakapEnlistments)
            .SingleAsync(p => p.Id == adultDependent.Id);

        trackedPatient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            TenantId = trackedPatient.TenantId,
            ClinicId = trackedPatient.ClinicId,
            EffectiveYear = 2025,
            EnlistmentDate = new DateOnly(2025, 2, 1),
            ValidUntil = new DateOnly(2025, 12, 31),
            CaseNo = "CASE-2025"
        });
        trackedPatient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            TenantId = trackedPatient.TenantId,
            ClinicId = trackedPatient.ClinicId,
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 15),
            ValidUntil = new DateOnly(2026, 12, 31),
            YesReferenceNo = "MCA2026001"
        });
        trackedPatient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            TenantId = trackedPatient.TenantId,
            ClinicId = trackedPatient.ClinicId,
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 2, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
            Remarks = "Renewed"
        });
        await context.SaveChangesAsync();

        var allEnlistments = await context.PatientYakapEnlistments
            .Where(e => e.PatientId == adultDependent.Id)
            .OrderBy(e => e.EffectiveYear)
            .ToListAsync();
        allEnlistments.Should().HaveCount(2);
        allEnlistments[0].EffectiveYear.Should().Be(2025);
        allEnlistments[0].CaseNo.Should().Be("CASE-2025");
        allEnlistments[1].EffectiveYear.Should().Be(2026);
        allEnlistments[1].Remarks.Should().Be("Renewed");

        var coverageHandler = new GetPatientPhilHealthCoverageQueryHandler(patientRepo, membershipRepo, enlistmentRepo, ctx);
        var coverage = await coverageHandler.Handle(new GetPatientPhilHealthCoverageQuery(adultDependent.Id, Year: 2026), CancellationToken.None);
        coverage.Membership.Should().NotBeNull();
        coverage.Membership!.MemberType.Should().Be("DD");
        coverage.Enlistments.Should().HaveCount(2);
        coverage.CurrentYearFpeStatus.HasActiveEnlistment.Should().BeTrue();
        coverage.CurrentYearFpeStatus.IsCompleted.Should().BeFalse();

        // YakapPatientProfileController.GetProfile must read DB membership (DD/D) rather than age-only heuristic (MM)!
        var profileController = new YakapPatientProfileController(
            patientRepo,
            TestDbHelper.CreateRepository<PatientVitals>(context, sieve),
            TestDbHelper.CreateRepository<PatientMedicalHistory>(context, sieve),
            TestDbHelper.CreateRepository<PatientFamilyHistory>(context, sieve),
            TestDbHelper.CreateRepository<PatientImmunization>(context, sieve),
            TestDbHelper.CreateRepository<PatientSocialHistory>(context, sieve),
            TestDbHelper.CreateRepository<PatientReproductiveHistory>(context, sieve),
            TestDbHelper.CreateRepository<NcdRiskAssessment>(context, sieve),
            uow,
            ctx,
            PhilHealthCatalogLookup.FromBundledSeed(),
            TestDbHelper.CreateRepository<PatientPhysicalExam>(context, sieve),
            membershipRepo);

        var actionResult = await profileController.GetProfile(adultDependent.Id, CancellationToken.None);
        var ok = actionResult.Result.Should().BeOfType<OkObjectResult>().Subject;
        var apiResp = ok.Value.Should().BeOfType<ApiResponse<PhilHealthPatientProfileDto>>().Subject;
        apiResp.Data!.MemberType.Should().Be("DD");
        apiResp.Data.DependentRelationship.Should().Be("D");
        apiResp.Data.MemberPin.Should().Be(ValidPrincipalPin);
        apiResp.Data.MemberFirstName.Should().Be("Juan");
        apiResp.Data.Atc.Should().Be("WALKIN-01");
    }

    // =========================================================================
    // 7. Patient Chart & Census Report Integration
    // =========================================================================

    [Fact]
    public async Task PatientChartAndCensusReport_IncludeAndDistinguishHealthScreenings()
    {
        var clinicId = Guid.NewGuid();
        var ctx = CreateClinicContext(clinicId, permissions: [ClinicPermissions.ConsultationsRead, ClinicPermissions.ReportsRead]);
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(ctx);

        var today = DateTime.UtcNow.Date;
        var patient = CreatePatient(clinicId);
        var qScreening = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            PatientName = "Maria Clara",
            QueueNumber = "V-001",
            QueueDate = DateOnly.FromDateTime(today),
            CheckInTime = today.AddHours(9),
            VisitType = VisitType.PreventiveHealthAssessment,
            VisitWorkflowMode = VisitWorkflowMode.Regular,
            Status = QueueStatus.Completed,
            CompletedTime = today.AddHours(9).AddMinutes(30)
        };
        var qVitalsOnly = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            PatientName = "Maria Clara",
            QueueNumber = "V-002",
            QueueDate = DateOnly.FromDateTime(today),
            CheckInTime = today.AddHours(10),
            VisitType = VisitType.PreventiveHealthAssessment,
            VisitWorkflowMode = VisitWorkflowMode.Regular,
            Status = QueueStatus.Completed,
            CompletedTime = today.AddHours(10).AddMinutes(10)
        };
        var screening = new HealthScreening
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = qScreening.Id,
            ScreeningType = HealthScreeningType.AnnualPhysicalExam,
            WorkflowMode = VisitWorkflowMode.Regular,
            Status = HealthScreeningStatus.Completed,
            Disposition = HealthScreeningDisposition.Cleared,
            ScreeningDateUtc = today.AddHours(9),
            ScreenedByNurseName = "Nurse Joy",
            ExaminedByDoctorName = "Dr. Santos"
        };
        context.Patients.Add(patient);
        context.QueueItems.AddRange(qScreening, qVitalsOnly);
        context.HealthScreenings.Add(screening);
        context.ServiceItems.Add(new ServiceItem
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            Code = "VITALS",
            Name = "Vitals Check",
            Category = "NursingService",
            StandardPrice = 100m,
            IsActive = true
        });
        await uow.SaveChangesAsync();

        var hsRepo = TestDbHelper.CreateRepository<HealthScreening>(context, sieve);

        var chartHandler = new GetPatientChartQueryHandler(
            TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve),
            TestDbHelper.CreateRepository<PatientVitals>(context, sieve),
            TestDbHelper.CreateRepository<Procedure>(context, sieve),
            TestDbHelper.CreateRepository<LabOrder>(context, sieve),
            TestDbHelper.CreateRepository<Invoice>(context, sieve),
            ctx,
            patientRepo: TestDbHelper.CreateRepository<Patient>(context, sieve),
            healthScreeningRepo: hsRepo);

        var chart = await chartHandler.Handle(new GetPatientChartQuery(patient.Id), CancellationToken.None);
        chart.HealthScreenings.Should().NotBeNull();
        chart.HealthScreenings!.Should().ContainSingle(s => s.Id == screening.Id && s.ScreeningType == HealthScreeningType.AnnualPhysicalExam);

        var censusHandler = new GetClinicCensusReportQueryHandler(
            TestDbHelper.CreateRepository<QueueItem>(context, sieve),
            TestDbHelper.CreateRepository<Patient>(context, sieve),
            TestDbHelper.CreateRepository<PatientVitals>(context, sieve),
            TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve),
            TestDbHelper.CreateRepository<Procedure>(context, sieve),
            TestDbHelper.CreateRepository<Invoice>(context, sieve),
            ctx,
            serviceItemRepo: TestDbHelper.CreateRepository<ServiceItem>(context, sieve),
            healthScreeningRepo: hsRepo);

        var report = await censusHandler.Handle(new GetClinicCensusReportQuery(today, today), CancellationToken.None);
        report.Items.Should().HaveCount(2);
        var screeningRow = report.Items.Single(i => i.QueueNumber == "V-001");
        var vitalsRow = report.Items.Single(i => i.QueueNumber == "V-002");

        screeningRow.ServicesAvailed.Should().Contain("Health Screening");
        screeningRow.VitalsFee.Should().Be(0m);
        vitalsRow.ServicesAvailed.Should().Contain("Preventive Health Assessment");
        vitalsRow.VitalsFee.Should().Be(100m);

        report.Summary.HealthScreeningVisits.Should().Be(1);
        report.Summary.VitalsCheckVisits.Should().Be(1);
        report.ServiceBreakdown!.Single(s => s.ServiceName == "Health Screening").VisitCount.Should().Be(1);
        report.ServiceBreakdown!.Single(s => s.ServiceName == "Vitals Check").VisitCount.Should().Be(1);
    }

    // =========================================================================
    // 8. AbandonConsultationCommand Direct-Visit Guard
    // =========================================================================

    [Fact]
    public async Task AbandonConsultation_WithLinkedHealthScreening_DoesNotHardDeleteDirectVisitQueueItem()
    {
        var clinicId = Guid.NewGuid();
        var ctx = CreateClinicContext(clinicId);
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(ctx);

        var patient = CreatePatient(clinicId);
        var queue = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            PatientName = "Maria Clara",
            QueueNumber = "DV-005",
            IsDirectVisit = true,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.RoutineCheckup,
            Status = QueueStatus.InConsultation
        };
        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            PatientName = "Maria Clara",
            QueueItemId = queue.Id,
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Santos",
            IsSigned = false
        };
        var screening = new HealthScreening
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = queue.Id,
            ConsultationEncounterId = encounter.Id,
            Status = HealthScreeningStatus.EscalatedToConsultation
        };

        context.Patients.Add(patient);
        context.QueueItems.Add(queue);
        context.Consultations.Add(encounter);
        context.HealthScreenings.Add(screening);
        await uow.SaveChangesAsync();

        var abandonHandler = new AbandonConsultationCommandHandler(
            TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve),
            TestDbHelper.CreateRepository<QueueItem>(context, sieve),
            uow,
            ctx,
            healthScreeningRepository: TestDbHelper.CreateRepository<HealthScreening>(context, sieve));

        var result = await abandonHandler.Handle(new AbandonConsultationCommand(encounter.Id, "Patient left", CancelVisit: true), CancellationToken.None);
        result.Should().BeTrue();

        var survivingQueue = await context.QueueItems.IgnoreQueryFilters().FirstOrDefaultAsync(q => q.Id == queue.Id);
        survivingQueue.Should().NotBeNull();
        survivingQueue!.Status.Should().Be(QueueStatus.Cancelled);

        var survivingScreening = await context.HealthScreenings.FirstOrDefaultAsync(hs => hs.Id == screening.Id);
        survivingScreening.Should().NotBeNull();
        survivingScreening!.ConsultationEncounterId.Should().BeNull();
    }

    // =========================================================================
    // 9. AuditRequestMetadataRegistry + Controller Authorization Attributes
    // =========================================================================

    [Fact]
    public void AuditRequestMetadataRegistry_ResolvesAllFiveM2Commands()
    {
        var saveDesc = AuditRequestMetadataRegistry.GetDescriptor<SaveHealthScreeningProgressCommand>();
        saveDesc.IsAuditable.Should().BeTrue();
        saveDesc.Category.Should().Be(ClinicAuditCategories.Clinical);
        saveDesc.Action.Should().Be("clinical.health_screening.saved");
        saveDesc.TargetEntityType.Should().Be("HealthScreening");

        var hsId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        saveDesc.TargetEntityIdGetter(new SaveHealthScreeningProgressCommand(null, patientId)).Should().BeNull();
        saveDesc.TargetEntityIdGetter(new SaveHealthScreeningProgressCommand(hsId, patientId)).Should().Be(hsId.ToString());
        saveDesc.PatientIdGetter(new SaveHealthScreeningProgressCommand(null, patientId)).Should().Be(patientId);

        var completeDesc = AuditRequestMetadataRegistry.GetDescriptor<CompleteHealthScreeningCommand>();
        completeDesc.IsAuditable.Should().BeTrue();
        completeDesc.Action.Should().Be("clinical.health_screening.completed");
        completeDesc.TargetEntityIdGetter(new CompleteHealthScreeningCommand(hsId, HealthScreeningDisposition.Cleared)).Should().Be(hsId.ToString());

        var escalateDesc = AuditRequestMetadataRegistry.GetDescriptor<EscalateHealthScreeningCommand>();
        escalateDesc.IsAuditable.Should().BeTrue();
        escalateDesc.Action.Should().Be("clinical.health_screening.escalated");
        escalateDesc.Severity.Should().Be(ClinicAuditSeverities.Urgent);

        var memDesc = AuditRequestMetadataRegistry.GetDescriptor<UpsertPatientPhilHealthMembershipCommand>();
        memDesc.IsAuditable.Should().BeTrue();
        memDesc.Category.Should().Be(ClinicAuditCategories.PhilHealth);
        memDesc.Action.Should().Be("philhealth.membership.upserted");
        var memCmd = new UpsertPatientPhilHealthMembershipCommand(patientId, "MM", PhilHealthPin: ValidPatientPin);
        memDesc.PatientIdGetter(memCmd).Should().Be(patientId);
        memDesc.PatientPinGetter(memCmd).Should().Be(ValidPatientPin);

        var selectDesc = AuditRequestMetadataRegistry.GetDescriptor<SubmitPatientYakapSelectionCommand>();
        selectDesc.IsAuditable.Should().BeTrue();
        selectDesc.Category.Should().Be(ClinicAuditCategories.PhilHealth);
        selectDesc.Action.Should().Be("yakap.selection.submitted");

        var standingDesc = AuditRequestMetadataRegistry.GetDescriptor<ValidatePatientYakapStandingCommand>();
        standingDesc.IsAuditable.Should().BeTrue();
        standingDesc.Category.Should().Be(ClinicAuditCategories.PhilHealth);
        standingDesc.Action.Should().Be("yakap.standing.validated");
    }

    [Fact]
    public void HealthScreeningsController_And_PatientsController_HaveExpectedAuthorizationAttributes()
    {
        var hsMethods = typeof(HealthScreeningsController).GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly);
        hsMethods.Should().HaveCount(5);
        foreach (var method in hsMethods)
        {
            method.GetCustomAttributes<HasAnyPermissionAttribute>(true).Should().NotBeEmpty($"{method.Name} must be guarded");
        }

        // Write endpoints must require clinical permissions only and MUST NOT allow PatientsWrite (which Front Desk Receptionist holds)
        var writeMethods = new[]
        {
            typeof(HealthScreeningsController).GetMethod(nameof(HealthScreeningsController.SaveHealthScreeningProgress))!,
            typeof(HealthScreeningsController).GetMethod(nameof(HealthScreeningsController.CompleteHealthScreening))!,
            typeof(HealthScreeningsController).GetMethod(nameof(HealthScreeningsController.EscalateHealthScreening))!
        };

        foreach (var writeMethod in writeMethods)
        {
            var perms = writeMethod.GetCustomAttributes<HasAnyPermissionAttribute>(true)
                .SelectMany(a => a.Permissions)
                .ToList();

            perms.Should().NotContain(ClinicPermissions.PatientsWrite,
                $"{writeMethod.Name} must not grant access via PatientsWrite (Front Desk Receptionist)");
            perms.Should().BeEquivalentTo(new[]
            {
                ClinicPermissions.TriageWrite,
                ClinicPermissions.ConsultationsWrite,
                ClinicPermissions.ConsultationsSign
            });
        }

        // Read endpoints retain PatientsRead, TriageRead, ConsultationsRead for Billing/Patients/Queue lookup
        var readMethods = new[]
        {
            typeof(HealthScreeningsController).GetMethod(nameof(HealthScreeningsController.GetHealthScreenings))!,
            typeof(HealthScreeningsController).GetMethod(nameof(HealthScreeningsController.GetHealthScreeningById))!
        };

        foreach (var readMethod in readMethods)
        {
            var perms = readMethod.GetCustomAttributes<HasAnyPermissionAttribute>(true)
                .SelectMany(a => a.Permissions)
                .ToList();

            perms.Should().Contain(ClinicPermissions.PatientsRead);
            perms.Should().Contain(ClinicPermissions.TriageRead);
            perms.Should().Contain(ClinicPermissions.ConsultationsRead);
        }

        var getCov = typeof(PatientsController).GetMethod(nameof(PatientsController.GetPhilHealthCoverage))!;
        getCov.GetCustomAttributes<HasPermissionAttribute>(true).Select(a => a.Permission).Should().Equal(ClinicPermissions.PatientsRead);

        var upsertMem = typeof(PatientsController).GetMethod(nameof(PatientsController.UpsertPhilHealthMembership))!;
        upsertMem.GetCustomAttributes<HasPermissionAttribute>(true).Select(a => a.Permission).Should().Equal(ClinicPermissions.PatientsWrite);

        var submitSel = typeof(YakapTransmittalsController).GetMethod(nameof(YakapTransmittalsController.SubmitSelection))!;
        submitSel.GetCustomAttributes<HasAnyPermissionAttribute>(true).SelectMany(a => a.Permissions).Should().BeEquivalentTo(new[]
        {
            ClinicPermissions.PatientsWrite,
            ClinicPermissions.TriageWrite,
            ClinicPermissions.YakapRead
        });
    }

    // =========================================================================
    // 10. M2 Remediation & Hardening Verification Tests
    // =========================================================================

    [Fact]
    public async Task FrontDeskReceptionist_And_Cashier_AreBlockedWithForbiddenOnAllHealthScreeningWrites()
    {
        var clinicId = Guid.NewGuid();
        var templates = ClinicRoleSeeder.GetCanonicalSystemRoleTemplates();
        var receptionistPerms = templates.Single(t => t.Name == ClinicRoleSeeder.ReceptionistRoleName).Permissions.ToArray();
        var cashierPerms = templates.Single(t => t.Name == ClinicRoleSeeder.CashierRoleName).Permissions.ToArray();

        // Sanity check: Receptionist has PatientsWrite + QueueCompleteNonDoctor + PatientsRead, NOT TriageWrite/Consultations*
        receptionistPerms.Should().Contain(ClinicPermissions.PatientsWrite);
        receptionistPerms.Should().Contain(ClinicPermissions.QueueCompleteNonDoctor);
        receptionistPerms.Should().Contain(ClinicPermissions.PatientsRead);
        receptionistPerms.Should().NotContain(ClinicPermissions.TriageWrite);
        receptionistPerms.Should().NotContain(ClinicPermissions.ConsultationsWrite);
        receptionistPerms.Should().NotContain(ClinicPermissions.ConsultationsSign);

        var receptionistId = Guid.NewGuid();
        var cashierId = Guid.NewGuid();
        var receptionistCtx = CreateClinicContext(clinicId, staffId: receptionistId, staffName: "Front Desk Ana", staffRole: "Receptionist", permissions: receptionistPerms);
        var cashierCtx = CreateClinicContext(clinicId, staffId: cashierId, staffName: "Cashier Ben", staffRole: "Cashier", permissions: cashierPerms);
        var patientsWriteOnlyNurseCtx = CreateClinicContext(clinicId, staffId: Guid.NewGuid(), staffName: "NonTriage Nurse", staffRole: "Nurse", permissions: [ClinicPermissions.PatientsWrite]);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(receptionistCtx);
        var patient = CreatePatient(clinicId);
        var queue = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            PatientName = "Maria Clara",
            QueueNumber = "V-050",
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.PreventiveHealthAssessment,
            Status = QueueStatus.Triaged
        };
        var vitals = new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = queue.Id,
            SystolicBp = 120,
            DiastolicBp = 80
        };
        var screening = new HealthScreening
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = queue.Id,
            PatientVitalsId = vitals.Id,
            ScreeningType = HealthScreeningType.RoutineWellness,
            WorkflowMode = VisitWorkflowMode.Regular,
            Status = HealthScreeningStatus.InProgress
        };

        context.StaffMembers.AddRange(
            new StaffMember
            {
                Id = receptionistId,
                TenantId = "tenant-hs-test",
                ClinicId = clinicId,
                FirstName = "Ana",
                LastName = "FrontDesk",
                Email = "ana.frontdesk@clinic.test",
                Role = StaffRole.Receptionist
            },
            new StaffMember
            {
                Id = cashierId,
                TenantId = "tenant-hs-test",
                ClinicId = clinicId,
                FirstName = "Ben",
                LastName = "Cashier",
                Email = "ben.cashier@clinic.test",
                Role = StaffRole.Cashier
            });
        context.Patients.Add(patient);
        context.QueueItems.Add(queue);
        context.PatientVitals.Add(vitals);
        context.HealthScreenings.Add(screening);
        await uow.SaveChangesAsync();

        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        foreach (var blockedCtx in new[] { receptionistCtx, cashierCtx, patientsWriteOnlyNurseCtx })
        {
            var sender = CreateDirectVisitSender(context, uow, sieve, blockedCtx);
            var saveHandler = CreateSaveHandler(context, uow, sieve, blockedCtx, sender);
            var completeHandler = CreateCompleteHandler(context, uow, sieve, blockedCtx);
            var escalateHandler = new EscalateHealthScreeningCommandHandler(
                TestDbHelper.CreateRepository<HealthScreening>(context, sieve),
                TestDbHelper.CreateRepository<Patient>(context, sieve),
                TestDbHelper.CreateRepository<QueueItem>(context, sieve),
                uow,
                blockedCtx,
                staffRepo: staffRepo);

            await FluentActions.Invoking(() => saveHandler.Handle(new SaveHealthScreeningProgressCommand(
                    Id: screening.Id,
                    PatientId: patient.Id,
                    QueueItemId: queue.Id,
                    NurseScreeningNotes: "Unauthorized attempt"), CancellationToken.None))
                .Should().ThrowAsync<ForbiddenException>();

            await FluentActions.Invoking(() => completeHandler.Handle(new CompleteHealthScreeningCommand(
                    screening.Id,
                    HealthScreeningDisposition.Cleared), CancellationToken.None))
                .Should().ThrowAsync<ForbiddenException>();

            await FluentActions.Invoking(() => escalateHandler.Handle(new EscalateHealthScreeningCommand(
                    screening.Id,
                    Reason: "Unauthorized escalation"), CancellationToken.None))
                .Should().ThrowAsync<ForbiddenException>();
        }
    }

    [Fact]
    public async Task EscalateScreening_LongReasonOver255Chars_TruncatesChiefComplaintTo255()
    {
        var clinicId = Guid.NewGuid();
        var ctx = CreateClinicContext(clinicId, staffName: "Nurse Joy", permissions: [ClinicPermissions.TriageWrite, ClinicPermissions.PatientsWrite]);
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(ctx);

        var patient = CreatePatient(clinicId);
        var queue = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            PatientName = "Maria Clara",
            QueueNumber = "DV-099",
            IsDirectVisit = true,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.PreventiveHealthAssessment,
            Status = QueueStatus.Triaged
        };
        var screening = new HealthScreening
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = queue.Id,
            ScreeningType = HealthScreeningType.RoutineWellness,
            Status = HealthScreeningStatus.InProgress
        };
        context.Patients.Add(patient);
        context.QueueItems.Add(queue);
        context.HealthScreenings.Add(screening);
        await uow.SaveChangesAsync();

        var longReason = new string('R', 320);
        var validator = new EscalateHealthScreeningCommandValidator();
        var cmd = new EscalateHealthScreeningCommand(screening.Id, Reason: longReason, IsUrgent: false);
        validator.Validate(cmd).IsValid.Should().BeTrue();

        var escalateHandler = new EscalateHealthScreeningCommandHandler(
            TestDbHelper.CreateRepository<HealthScreening>(context, sieve),
            TestDbHelper.CreateRepository<Patient>(context, sieve),
            TestDbHelper.CreateRepository<QueueItem>(context, sieve),
            uow,
            ctx,
            staffRepo: TestDbHelper.CreateRepository<StaffMember>(context, sieve));

        await escalateHandler.Handle(cmd, CancellationToken.None);

        var updatedQueue = await context.QueueItems.SingleAsync(q => q.Id == queue.Id);
        updatedQueue.ChiefComplaint.Should().NotBeNull();
        updatedQueue.ChiefComplaint!.Length.Should().Be(255);
        updatedQueue.ChiefComplaint.Should().Be(longReason[..255]);
    }

    [Fact]
    public async Task SaveProgress_PartialUpdateWithNullYakapFlags_PreservesExistingAndGuardsEscalated()
    {
        var clinicId = Guid.NewGuid();
        var ctx = CreateClinicContext(clinicId, staffName: "Nurse Joy", permissions: [ClinicPermissions.TriageWrite, ClinicPermissions.PatientsWrite]);
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(ctx);

        // Verify JSON payload with explicit null serviceDeliveryMethod & isWalkedIn deserializes cleanly
        const string jsonWithNulls = """{"patientId":"11111111-1111-1111-1111-111111111111","isWalkedIn":null,"serviceDeliveryMethod":null}""";
        var deserializedReq = JsonSerializer.Deserialize<SaveHealthScreeningProgressRequest>(
            jsonWithNulls,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        deserializedReq.Should().NotBeNull();
        deserializedReq!.IsWalkedIn.Should().BeNull();
        deserializedReq.ServiceDeliveryMethod.Should().BeNull();

        var patient = CreatePatient(clinicId);
        context.Patients.Add(patient);
        await uow.SaveChangesAsync();

        var sender = CreateDirectVisitSender(context, uow, sieve, ctx);
        var saveHandler = CreateSaveHandler(context, uow, sieve, ctx, sender);

        // Station 1 creates screening with IsWalkedIn=true and OutOfFacility
        var created = await saveHandler.Handle(new SaveHealthScreeningProgressCommand(
            Id: null,
            PatientId: patient.Id,
            ScreeningType: HealthScreeningType.YakapFpe,
            WorkflowMode: VisitWorkflowMode.YakapAvailment,
            IsWalkedIn: true,
            ServiceDeliveryMethod: YakapServiceDeliveryMethod.OutOfFacility), CancellationToken.None);

        created.IsWalkedIn.Should().BeTrue();
        created.ServiceDeliveryMethod.Should().Be(YakapServiceDeliveryMethod.OutOfFacility);

        // Partial Station 3 save omits IsWalkedIn & ServiceDeliveryMethod (null) -> must NOT clobber Station 1 values
        var updated = await saveHandler.Handle(new SaveHealthScreeningProgressCommand(
            Id: created.Id,
            PatientId: patient.Id,
            QueueItemId: created.QueueItemId,
            ScreeningType: HealthScreeningType.YakapFpe,
            WorkflowMode: VisitWorkflowMode.YakapAvailment,
            ClinicalImpression: "Station 3 partial save",
            IsWalkedIn: null,
            ServiceDeliveryMethod: null), CancellationToken.None);

        updated.IsWalkedIn.Should().BeTrue();
        updated.ServiceDeliveryMethod.Should().Be(YakapServiceDeliveryMethod.OutOfFacility);
        updated.ClinicalImpression.Should().Be("Station 3 partial save");

        // Escalate and verify subsequent SaveHealthScreeningProgressCommand is rejected with BadRequestException
        var escalateHandler = new EscalateHealthScreeningCommandHandler(
            TestDbHelper.CreateRepository<HealthScreening>(context, sieve),
            TestDbHelper.CreateRepository<Patient>(context, sieve),
            TestDbHelper.CreateRepository<QueueItem>(context, sieve),
            uow,
            ctx,
            staffRepo: TestDbHelper.CreateRepository<StaffMember>(context, sieve));
        await escalateHandler.Handle(new EscalateHealthScreeningCommand(created.Id, Reason: "Red flag"), CancellationToken.None);

        await FluentActions.Invoking(() => saveHandler.Handle(new SaveHealthScreeningProgressCommand(
                Id: created.Id,
                PatientId: patient.Id,
                QueueItemId: created.QueueItemId,
                ClinicalImpression: "Stale edit after escalation"), CancellationToken.None))
            .Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task SaveAndComplete_RejectCrossPatientOrNonexistentClinicalRecordIds()
    {
        var clinicId = Guid.NewGuid();
        var doctorCtx = CreateClinicContext(clinicId, staffName: "Dr. Jose", staffRole: "Doctor",
            permissions: [ClinicPermissions.ConsultationsWrite, ClinicPermissions.ConsultationsSign, ClinicPermissions.TriageWrite]);
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(doctorCtx);

        var patientA = CreatePatient(clinicId);
        var patientB = CreatePatient(clinicId);
        var qA = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patientA.Id,
            PatientName = "Patient A",
            QueueNumber = "V-071",
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.PreventiveHealthAssessment,
            Status = QueueStatus.Triaged
        };
        var vitalsA = new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patientA.Id,
            QueueItemId = qA.Id,
            SystolicBp = 120,
            DiastolicBp = 80
        };
        var deletedVitalsA = new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patientA.Id,
            QueueItemId = qA.Id,
            SystolicBp = 130,
            DiastolicBp = 85,
            IsDeleted = true
        };
        var vitalsB = new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patientB.Id,
            SystolicBp = 110,
            DiastolicBp = 70
        };
        var peB = new PatientPhysicalExam
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patientB.Id,
            GeneralSurveyStatus = GeneralSurveyStatus.Normal
        };
        var ncdB = new NcdRiskAssessment
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patientB.Id,
            RiskBand = "BandA"
        };
        var screeningA = new HealthScreening
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patientA.Id,
            QueueItemId = qA.Id,
            PatientVitalsId = vitalsA.Id,
            ScreeningType = HealthScreeningType.RoutineWellness,
            Status = HealthScreeningStatus.InProgress
        };

        context.Patients.AddRange(patientA, patientB);
        context.QueueItems.Add(qA);
        context.PatientVitals.AddRange(vitalsA, deletedVitalsA, vitalsB);
        context.PatientPhysicalExams.Add(peB);
        context.NcdRiskAssessments.Add(ncdB);
        context.HealthScreenings.Add(screeningA);
        await uow.SaveChangesAsync();

        var sender = CreateDirectVisitSender(context, uow, sieve, doctorCtx);
        var saveHandler = CreateSaveHandler(context, uow, sieve, doctorCtx, sender);
        var completeHandler = CreateCompleteHandler(context, uow, sieve, doctorCtx);

        // SaveHealthScreeningProgressCommand rejects Patient B's vitals/PE/NCD, soft-deleted vitals, and nonexistent IDs
        await FluentActions.Invoking(() => saveHandler.Handle(new SaveHealthScreeningProgressCommand(
                screeningA.Id, patientA.Id, qA.Id, PatientVitalsId: vitalsB.Id), CancellationToken.None))
            .Should().ThrowAsync<BadRequestException>();

        await FluentActions.Invoking(() => saveHandler.Handle(new SaveHealthScreeningProgressCommand(
                screeningA.Id, patientA.Id, qA.Id, PatientVitalsId: deletedVitalsA.Id), CancellationToken.None))
            .Should().ThrowAsync<BadRequestException>();

        await FluentActions.Invoking(() => saveHandler.Handle(new SaveHealthScreeningProgressCommand(
                screeningA.Id, patientA.Id, qA.Id, PatientPhysicalExamId: peB.Id), CancellationToken.None))
            .Should().ThrowAsync<BadRequestException>();

        await FluentActions.Invoking(() => saveHandler.Handle(new SaveHealthScreeningProgressCommand(
                screeningA.Id, patientA.Id, qA.Id, NcdRiskAssessmentId: ncdB.Id), CancellationToken.None))
            .Should().ThrowAsync<BadRequestException>();

        await FluentActions.Invoking(() => saveHandler.Handle(new SaveHealthScreeningProgressCommand(
                screeningA.Id, patientA.Id, qA.Id, NcdRiskAssessmentId: Guid.NewGuid()), CancellationToken.None))
            .Should().ThrowAsync<BadRequestException>();

        // CompleteHealthScreeningCommand rejects Patient B's vitals/PE/NCD and nonexistent IDs
        await FluentActions.Invoking(() => completeHandler.Handle(new CompleteHealthScreeningCommand(
                screeningA.Id, HealthScreeningDisposition.Cleared, PatientVitalsId: vitalsB.Id), CancellationToken.None))
            .Should().ThrowAsync<BadRequestException>();

        await FluentActions.Invoking(() => completeHandler.Handle(new CompleteHealthScreeningCommand(
                screeningA.Id, HealthScreeningDisposition.Cleared, PatientPhysicalExamId: peB.Id), CancellationToken.None))
            .Should().ThrowAsync<BadRequestException>();

        await FluentActions.Invoking(() => completeHandler.Handle(new CompleteHealthScreeningCommand(
                screeningA.Id, HealthScreeningDisposition.Cleared, NcdRiskAssessmentId: ncdB.Id), CancellationToken.None))
            .Should().ThrowAsync<BadRequestException>();

        await FluentActions.Invoking(() => completeHandler.Handle(new CompleteHealthScreeningCommand(
                screeningA.Id, HealthScreeningDisposition.Cleared, PatientPhysicalExamId: Guid.NewGuid()), CancellationToken.None))
            .Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public void PhilHealthValidators_RejectUndefinedNumericEnumStrings()
    {
        var membershipValidator = new UpsertPatientPhilHealthMembershipCommandValidator();
        membershipValidator.Validate(new UpsertPatientPhilHealthMembershipCommand(
            Guid.NewGuid(),
            MemberType: "999",
            PhilHealthPin: ValidPatientPin)).IsValid.Should().BeFalse();

        membershipValidator.Validate(new UpsertPatientPhilHealthMembershipCommand(
            Guid.NewGuid(),
            MemberType: "DD",
            DependentRelationship: "999",
            PrincipalMemberPin: ValidPrincipalPin,
            PrincipalLastName: "Clara",
            PrincipalFirstName: "Juan",
            PrincipalDateOfBirth: new DateOnly(1960, 1, 1))).IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task SaveProgress_And_Query_EnforceCrossPatientQueueItemBoundary()
    {
        var clinicId = Guid.NewGuid();
        var nurseCtx = CreateClinicContext(clinicId, staffName: "Nurse Joy", staffRole: "Nurse",
            permissions: [ClinicPermissions.TriageWrite, ClinicPermissions.PatientsWrite, ClinicPermissions.PatientsRead]);
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(nurseCtx);

        var patientA = CreatePatient(clinicId);
        var patientB = CreatePatient(clinicId);
        var queueBWithScreening = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patientB.Id,
            PatientName = "Patient B",
            QueueNumber = "V-201",
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.PreventiveHealthAssessment,
            VisitWorkflowMode = VisitWorkflowMode.Regular,
            Status = QueueStatus.Triaged,
            ChiefComplaint = "Original B1"
        };
        var queueBFresh = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patientB.Id,
            PatientName = "Patient B",
            QueueNumber = "V-202",
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.PreventiveHealthAssessment,
            VisitWorkflowMode = VisitWorkflowMode.Regular,
            Status = QueueStatus.Triaged,
            ChiefComplaint = "Original B2"
        };
        var screeningB = new HealthScreening
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patientB.Id,
            QueueItemId = queueBWithScreening.Id,
            ScreeningType = HealthScreeningType.RoutineWellness,
            WorkflowMode = VisitWorkflowMode.Regular,
            Status = HealthScreeningStatus.InProgress,
            NurseScreeningNotes = "Patient B confidential notes"
        };

        context.Patients.AddRange(patientA, patientB);
        context.QueueItems.AddRange(queueBWithScreening, queueBFresh);
        context.HealthScreenings.Add(screeningB);
        await uow.SaveChangesAsync();

        var sender = CreateDirectVisitSender(context, uow, sieve, nurseCtx);
        var saveHandler = CreateSaveHandler(context, uow, sieve, nurseCtx, sender);

        // Case 1: Patient B's QueueItem already has a HealthScreening
        await FluentActions.Invoking(() => saveHandler.Handle(new SaveHealthScreeningProgressCommand(
                Id: null,
                PatientId: patientA.Id,
                QueueItemId: queueBWithScreening.Id,
                WorkflowMode: VisitWorkflowMode.YakapAvailment,
                NurseScreeningNotes: "Cross-patient overwrite attempt"), CancellationToken.None))
            .Should().ThrowAsync<BadRequestException>();

        // Case 2: Patient B's QueueItem has no HealthScreening yet
        await FluentActions.Invoking(() => saveHandler.Handle(new SaveHealthScreeningProgressCommand(
                Id: null,
                PatientId: patientA.Id,
                QueueItemId: queueBFresh.Id,
                NurseScreeningNotes: "Cross-patient attach attempt"), CancellationToken.None))
            .Should().ThrowAsync<BadRequestException>();

        // Verify Patient B's records were NOT mutated and no extra screening was created
        (await context.HealthScreenings.CountAsync()).Should().Be(1);
        var unchangedScreeningB = await context.HealthScreenings.AsNoTracking().SingleAsync(hs => hs.Id == screeningB.Id);
        unchangedScreeningB.NurseScreeningNotes.Should().Be("Patient B confidential notes");
        unchangedScreeningB.WorkflowMode.Should().Be(VisitWorkflowMode.Regular);

        var unchangedQB1 = await context.QueueItems.AsNoTracking().SingleAsync(q => q.Id == queueBWithScreening.Id);
        unchangedQB1.VisitWorkflowMode.Should().Be(VisitWorkflowMode.Regular);
        unchangedQB1.ChiefComplaint.Should().Be("Original B1");

        var unchangedQB2 = await context.QueueItems.AsNoTracking().SingleAsync(q => q.Id == queueBFresh.Id);
        unchangedQB2.ChiefComplaint.Should().Be("Original B2");

        // Verify GetPatientHealthScreeningsQuery applies both PatientId and QueueItemId predicates when both are passed
        var listHandler = new GetPatientHealthScreeningsQueryHandler(
            TestDbHelper.CreateRepository<HealthScreening>(context, sieve),
            nurseCtx,
            TestDbHelper.CreateRepository<QueueItem>(context, sieve),
            TestDbHelper.CreateRepository<ServiceItem>(context, sieve));
        var crossQuery = await listHandler.Handle(
            new GetPatientHealthScreeningsQuery(PatientId: patientA.Id, QueueItemId: queueBWithScreening.Id),
            CancellationToken.None);
        crossQuery.Should().BeEmpty();

        var ownQuery = await listHandler.Handle(
            new GetPatientHealthScreeningsQuery(PatientId: patientB.Id, QueueItemId: queueBWithScreening.Id),
            CancellationToken.None);
        ownQuery.Should().ContainSingle(s => s.Id == screeningB.Id);
    }

    [Fact]
    public async Task CompleteScreening_LongClinicalImpression_TruncatesDischargeNotesTo1000AndPreservesImpression()
    {
        var clinicId = Guid.NewGuid();
        var nurseCtx = CreateClinicContext(clinicId, staffName: "Nurse Joy", staffRole: "Nurse",
            permissions: [ClinicPermissions.TriageWrite, ClinicPermissions.PatientsWrite, ClinicPermissions.QueueCompleteNonDoctor]);
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(nurseCtx);

        var patient = CreatePatient(clinicId);
        var queue = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            PatientName = "Maria Clara",
            QueueNumber = "V-301",
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.PreventiveHealthAssessment,
            Status = QueueStatus.Triaged
        };
        var vitals = new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = queue.Id,
            SystolicBp = 120,
            DiastolicBp = 80
        };
        var screening = new HealthScreening
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = queue.Id,
            PatientVitalsId = vitals.Id,
            ScreeningType = HealthScreeningType.RoutineWellness,
            WorkflowMode = VisitWorkflowMode.Regular,
            Status = HealthScreeningStatus.InProgress
        };
        context.Patients.Add(patient);
        context.QueueItems.Add(queue);
        context.PatientVitals.Add(vitals);
        context.HealthScreenings.Add(screening);
        await uow.SaveChangesAsync();

        var impression1500 = new string('I', 1500);
        var completeCmd = new CompleteHealthScreeningCommand(
            screening.Id,
            HealthScreeningDisposition.ClearedWithAdvice,
            ClinicalImpression: impression1500);
        new CompleteHealthScreeningCommandValidator().Validate(completeCmd).IsValid.Should().BeTrue();

        var completeHandler = CreateCompleteHandler(context, uow, sieve, nurseCtx);
        var result = await completeHandler.Handle(completeCmd, CancellationToken.None);

        result.ClinicalImpression.Should().Be(impression1500);
        result.ClinicalImpression!.Length.Should().Be(1500);

        var updatedQueue = await context.QueueItems.AsNoTracking().SingleAsync(q => q.Id == queue.Id);
        updatedQueue.DischargeNotes.Should().NotBeNull();
        updatedQueue.DischargeNotes!.Length.Should().Be(1000);
        updatedQueue.DischargeNotes.Should().Be(impression1500[..1000]);
    }

    [Fact]
    public async Task EscalateScreening_LongExistingImpressionAndReason_ClampsClinicalImpressionTo2000Chars()
    {
        var clinicId = Guid.NewGuid();
        var nurseCtx = CreateClinicContext(clinicId, staffName: "Nurse Joy", staffRole: "Nurse",
            permissions: [ClinicPermissions.TriageWrite, ClinicPermissions.PatientsWrite]);
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(nurseCtx);

        var existing1900 = new string('E', 1900);
        var reason500 = new string('R', 500);

        var patient = CreatePatient(clinicId);
        var queue = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            PatientName = "Maria Clara",
            QueueNumber = "V-302",
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.PreventiveHealthAssessment,
            Status = QueueStatus.Triaged
        };
        var screening = new HealthScreening
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = queue.Id,
            ScreeningType = HealthScreeningType.RoutineWellness,
            Status = HealthScreeningStatus.InProgress,
            ClinicalImpression = existing1900
        };
        context.Patients.Add(patient);
        context.QueueItems.Add(queue);
        context.HealthScreenings.Add(screening);
        await uow.SaveChangesAsync();

        var escalateHandler = new EscalateHealthScreeningCommandHandler(
            TestDbHelper.CreateRepository<HealthScreening>(context, sieve),
            TestDbHelper.CreateRepository<Patient>(context, sieve),
            TestDbHelper.CreateRepository<QueueItem>(context, sieve),
            uow,
            nurseCtx,
            staffRepo: TestDbHelper.CreateRepository<StaffMember>(context, sieve));

        var result = await escalateHandler.Handle(
            new EscalateHealthScreeningCommand(screening.Id, Reason: reason500),
            CancellationToken.None);

        result.ClinicalImpression.Should().NotBeNull();
        result.ClinicalImpression!.Length.Should().Be(2000);
        result.ClinicalImpression.Should().StartWith(existing1900);

        var updatedQueue = await context.QueueItems.AsNoTracking().SingleAsync(q => q.Id == queue.Id);
        updatedQueue.ChiefComplaint.Should().NotBeNull();
        updatedQueue.ChiefComplaint!.Length.Should().Be(255);
    }

    [Fact]
    public async Task CompleteScreening_StaffRoleNurseWithoutTriageWrite_ThrowsForbiddenException()
    {
        var clinicId = Guid.NewGuid();
        var nurseStaffId = Guid.NewGuid();
        var patientsWriteOnlyNurseCtx = CreateClinicContext(
            clinicId,
            staffId: nurseStaffId,
            staffName: "Nurse Without TriageWrite",
            staffRole: "Nurse",
            permissions: [ClinicPermissions.PatientsWrite, ClinicPermissions.QueueCompleteNonDoctor]);
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(patientsWriteOnlyNurseCtx);

        var nurseStaff = new StaffMember
        {
            Id = nurseStaffId,
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            FirstName = "Nora",
            LastName = "Nurse",
            Email = "nora.nurse@clinic.test",
            Role = StaffRole.Nurse
        };
        var patient = CreatePatient(clinicId);
        var queue = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            PatientName = "Maria Clara",
            QueueNumber = "V-303",
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.PreventiveHealthAssessment,
            Status = QueueStatus.Triaged
        };
        var vitals = new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = queue.Id,
            SystolicBp = 120,
            DiastolicBp = 80
        };
        var screening = new HealthScreening
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-hs-test",
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = queue.Id,
            PatientVitalsId = vitals.Id,
            ScreeningType = HealthScreeningType.RoutineWellness,
            WorkflowMode = VisitWorkflowMode.Regular,
            Status = HealthScreeningStatus.InProgress
        };
        context.StaffMembers.Add(nurseStaff);
        context.Patients.Add(patient);
        context.QueueItems.Add(queue);
        context.PatientVitals.Add(vitals);
        context.HealthScreenings.Add(screening);
        await uow.SaveChangesAsync();

        var completeHandler = CreateCompleteHandler(context, uow, sieve, patientsWriteOnlyNurseCtx);
        await FluentActions.Invoking(() => completeHandler.Handle(
                new CompleteHealthScreeningCommand(screening.Id, HealthScreeningDisposition.Cleared),
                CancellationToken.None))
            .Should().ThrowAsync<ForbiddenException>();
    }
}
