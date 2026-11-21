using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.HealthScreenings.Commands;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Yakap.Commands;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Queries;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Application.Features.Yakap.WireBuilders;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Yakap;

public sealed class Yakap2OnboardingAndScreeningTests
{
    private const string ValidWalkInPin = "12-345678901-2";
    private const string NormalizedWalkInPin = "123456789012";
    private const string AccreditationNo = "H00000921";

    private static IClinicContext CreateClinicContext(Guid clinicId, string tenantId = "tenant_yakap2_test")
    {
        var ctx = Substitute.For<IClinicContext>();
        ctx.ClinicId.Returns(clinicId);
        ctx.TenantId.Returns(tenantId);
        ctx.StaffId.Returns(Guid.NewGuid());
        ctx.StaffName.Returns("Dr. Jose Rizal");
        ctx.StaffRole.Returns("Doctor");
        ctx.HasPermission(Arg.Any<string>()).Returns(true);
        ctx.Permissions.Returns(new[]
        {
            ClinicPermissions.ConsultationsSign,
            ClinicPermissions.ConsultationsWrite,
            ClinicPermissions.TriageWrite,
            ClinicPermissions.YakapRead
        });
        return ctx;
    }

    private static async Task<(ApplicationDbContext Db, IUnitOfWork Uow, Sieve.Services.ISieveProcessor Sieve, Patient Patient, FacilitySettings Settings)>
        SeedClinicAndWalkInPatientAsync(IClinicContext clinicContext, string? pin = ValidWalkInPin)
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var clinicId = clinicContext.ClinicId;
        var tenantId = clinicContext.TenantId!;

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            ClinicName = "ClinicEZ Test Health Center",
            AccreditationNumber = AccreditationNo,
            PmccNumber = "Z15445",
            SoftwareCertificateId = "CERT-TEST-01",
            PhilHealthBaseUrl = "https://pcapi-sandbox.philhealth.gov.ph",
            IsPhilHealthConfigured = true,
            AllowNurseMidwifeYakapFpeFacilitator = true
        };

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-Y2-001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            MiddleName = "Santos",
            ContactNumber = "09171234567",
            PhilHealthNumber = pin,
            DateOfBirth = new DateOnly(1988, 5, 14),
            Sex = BiologicalSex.Male
        };

        var membership = new PatientPhilHealthMembership
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            MemberPin = pin ?? string.Empty,
            MemberType = PhilHealthMemberType.MM
        };

        db.Settings.Add(settings);
        db.Patients.Add(patient);
        if (!string.IsNullOrWhiteSpace(pin))
        {
            db.PatientPhilHealthMemberships.Add(membership);
        }
        await db.SaveChangesAsync();

        return (db, uow, sieve, patient, settings);
    }

    [Fact]
    public async Task WalkInOnboarding_StandingToPcuToSelectionToFpeAndEmpanelment_SucceedsEndToEnd()
    {
        var clinicId = Guid.NewGuid();
        var ctx = CreateClinicContext(clinicId);
        var (db, uow, sieve, patient, _) = await SeedClinicAndWalkInPatientAsync(ctx);
        var year = DateTime.UtcNow.Year;

        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var membershipRepo = TestDbHelper.CreateRepository<PatientPhilHealthMembership>(db, sieve);
        var enlistmentRepo = TestDbHelper.CreateRepository<PatientYakapEnlistment>(db, sieve);
        var verificationRepo = TestDbHelper.CreateRepository<PatientIdentityVerification>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var screeningRepo = TestDbHelper.CreateRepository<HealthScreening>(db, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var submissionRepo = TestDbHelper.CreateRepository<YakapSubmission>(db, sieve);
        var submissionErrorRepo = TestDbHelper.CreateRepository<YakapSubmissionError>(db, sieve);
        var seqGen = new PhilHealthSequenceGenerator(db, NullLogger<PhilHealthSequenceGenerator>.Instance);

        var pcapi = Substitute.For<IYakapPcapiClient>();

        // Service 02: Walk-in starts UNVERIFIED / NOT_ASSIGNED
        pcapi.ValidateStandingAsync(Arg.Any<YakapValidateStandingRequest>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<YakapValidatorResponse>.Success(new YakapValidatorResponse(
                PatientPin: NormalizedWalkInPin,
                PatientLname: "DELA CRUZ",
                PatientFname: "JUAN",
                PatientMname: "SANTOS",
                PatientExtname: null,
                Pcu: new PcuStatusInfo("UNVERIFIED"),
                Selection: new SelectionStatusInfo("NOT_ASSIGNED"),
                Empanelment: new EmpanelmentStatusInfo("N"),
                Fpe: new FpeStatusInfo("N"),
                Consultation: null)));

        var standingHandler = new ValidatePatientYakapStandingCommandHandler(
            patientRepo, membershipRepo, enlistmentRepo, verificationRepo, settingsRepo, pcapi, seqGen, uow, ctx);

        var standing = await standingHandler.Handle(new ValidatePatientYakapStandingCommand(patient.Id, year), CancellationToken.None);
        standing.NeedsIdentityCheck.Should().BeTrue();
        standing.NeedsClinicSelection.Should().BeTrue();
        standing.CanStartCheckup.Should().BeFalse();

        // Service 01: Start & verify Face Scan (PCU)
        pcapi.StartPcuSessionAsync(Arg.Any<PcuStartRequest>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<PcuStartResponse>.Success(new PcuStartResponse(
                SdkUrl: "https://pcu-sandbox.philhealth.gov.ph/liveness?auth=AUTH-001",
                LivenessAuthorizationId: "AUTH-001",
                Status: "PENDING",
                ExpiresIn: 900)));

        pcapi.VerifyPcuTokenAsync(Arg.Any<PcuVerifyRequest>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<PcuVerifyResponse>.Success(new PcuVerifyResponse(
                TransNo: "PCU-TX-9001",
                PinMatched: true,
                Status: "VERIFIED",
                MemberPin: NormalizedWalkInPin)));

        var pcuStartHandler = new StartPatientPcuSessionCommandHandler(
            patientRepo, membershipRepo, verificationRepo, settingsRepo, pcapi, uow, ctx);
        var pcuStart = await pcuStartHandler.Handle(new StartPatientPcuSessionCommand(patient.Id), CancellationToken.None);
        pcuStart.LivenessAuthorizationId.Should().Be("AUTH-001");

        var pcuVerifyHandler = new VerifyPatientPcuSessionCommandHandler(
            verificationRepo, enlistmentRepo, settingsRepo, pcapi, uow, ctx);
        var verified = await pcuVerifyHandler.Handle(
            new VerifyPatientPcuSessionCommand(patient.Id, pcuStart.VerificationId, "AUTH-001"),
            CancellationToken.None);
        verified.IsVerified.Should().BeTrue();
        verified.Mode.Should().Be("PCU");
        verified.TransactionCode.Should().Be("PCU-TX-9001");

        // Service 04: Assign walk-in patient to clinic
        var selTx = $"KH00000921{year}011500001";
        pcapi.SubmitSelectionAsync(Arg.Any<YakapSelectionRequest>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<YakapSelectionResponse>.Success(new YakapSelectionResponse(
                PatientPin: NormalizedWalkInPin,
                AccreNo: AccreditationNo,
                Selection: new SelectionDetails("ASSIGNED", selTx, $"{year}-01-15"))));

        var selectionHandler = new SubmitPatientYakapSelectionCommandHandler(
            patientRepo, membershipRepo, enlistmentRepo, verificationRepo, settingsRepo, pcapi, seqGen, uow, ctx);
        var selResult = await selectionHandler.Handle(new SubmitPatientYakapSelectionCommand(patient.Id), CancellationToken.None);
        selResult.QueuedForSync.Should().BeFalse();
        selResult.SelectionStatus.Should().Be("ASSIGNED");
        selResult.SelectionTransactionNo.Should().Be(selTx);
        selResult.CaseNo.Should().HaveLength(23).And.StartWith("CH00000921");

        // Seed QueueItem & HealthScreening and sign off -> triggers FPE upload (06) + Empanelment (03)
        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = ctx.TenantId!,
            ClinicId = clinicId,
            PatientId = patient.Id,
            PatientName = "Juan Dela Cruz",
            QueueNumber = "S-001",
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.PreventiveHealthAssessment,
            Status = QueueStatus.Triaged,
            CheckInTime = DateTime.UtcNow
        };
        db.QueueItems.Add(queueItem);

        var vitals = new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = ctx.TenantId!,
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = queueItem.Id,
            SystolicBp = 120,
            DiastolicBp = 80,
            HeartRateBpm = 72,
            TemperatureCelsius = 36.6m,
            RespiratoryRateBreathsPerMin = 16,
            OxygenSaturationPercent = 98m,
            HeightCm = 170m,
            WeightKg = 68m,
            RecordedAt = DateTime.UtcNow
        };
        db.PatientVitals.Add(vitals);

        var pe = new PatientPhysicalExam
        {
            Id = Guid.NewGuid(),
            TenantId = ctx.TenantId!,
            ClinicId = clinicId,
            PatientId = patient.Id,
            ExamDate = DateTime.UtcNow
        };
        db.PatientPhysicalExams.Add(pe);

        var ncd = new NcdRiskAssessment
        {
            Id = Guid.NewGuid(),
            TenantId = ctx.TenantId!,
            ClinicId = clinicId,
            PatientId = patient.Id,
            AssessmentDate = DateTime.UtcNow
        };
        db.NcdRiskAssessments.Add(ncd);

        var screening = new HealthScreening
        {
            Id = Guid.NewGuid(),
            TenantId = ctx.TenantId!,
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = queueItem.Id,
            PatientVitalsId = vitals.Id,
            PatientPhysicalExamId = pe.Id,
            NcdRiskAssessmentId = ncd.Id,
            WorkflowMode = VisitWorkflowMode.YakapAvailment,
            Status = HealthScreeningStatus.AwaitingDoctor,
            YakapEnlistmentId = selResult.EnlistmentId,
            PatientIdentityVerificationId = verified.VerificationId,
            IsWalkedIn = true,
            ServiceDeliveryMethod = YakapServiceDeliveryMethod.FacilityBased
        };
        db.HealthScreenings.Add(screening);
        await db.SaveChangesAsync();

        var uploadTxNo = $"UH00000921{year}011500001";
        pcapi.UploadPlainJsonAsync("fpe", Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<DataUploadResponse>.Success(new DataUploadResponse(
                UploadTransactionNo: uploadTxNo,
                Form: "fpe",
                ProcessingStatus: "on_queue",
                CaseNo: selResult.CaseNo,
                ReceivedAt: DateTime.UtcNow)));

        pcapi.SubmitEmpanelmentAsync(Arg.Any<YakapEmpanelmentRequest>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<YakapEmpanelmentResponse>.Success(new YakapEmpanelmentResponse(
                YesReferenceNo: $"MCA{year}001",
                PatientPin: NormalizedWalkInPin,
                AccreNo: AccreditationNo,
                EffYear: year.ToString(),
                WithYes: true,
                WithFpe: true,
                FpeTransactionNo: null,
                PcuTransactionCode: "PCU-TX-9001")));

        var fpeHandler = new SubmitHealthScreeningYakapFpeCommandHandler(
            screeningRepo,
            patientRepo,
            membershipRepo,
            enlistmentRepo,
            verificationRepo,
            settingsRepo,
            TestDbHelper.CreateRepository<PatientVitals>(db, sieve),
            TestDbHelper.CreateRepository<PatientPhysicalExam>(db, sieve),
            TestDbHelper.CreateRepository<NcdRiskAssessment>(db, sieve),
            TestDbHelper.CreateRepository<PatientMedicalHistory>(db, sieve),
            TestDbHelper.CreateRepository<PatientFamilyHistory>(db, sieve),
            TestDbHelper.CreateRepository<PatientAllergy>(db, sieve),
            TestDbHelper.CreateRepository<PatientImmunization>(db, sieve),
            TestDbHelper.CreateRepository<PatientSocialHistory>(db, sieve),
            submissionRepo,
            submissionErrorRepo,
            seqGen,
            pcapi,
            uow,
            ctx);

        var fpeRes = await fpeHandler.Handle(new SubmitHealthScreeningYakapFpeCommand(screening.Id), CancellationToken.None);
        fpeRes.UploadTransactionNo.Should().Be(uploadTxNo);
        fpeRes.YesReferenceNo.Should().Be($"MCA{year}001");
        fpeRes.EmpanelmentStatus.Should().Be("EMPANELLED");

        // CompleteHealthScreeningCommand using IYakapScreeningDispatcher runs cleanly without cross-feature direct reference
        var dispatcher = Substitute.For<IYakapScreeningDispatcher>();
        dispatcher.DispatchFpeSubmissionAsync(screening.Id, Arg.Any<CancellationToken>())
            .Returns(Task.CompletedTask);

        var completeHandler = new CompleteHealthScreeningCommandHandler(
            screeningRepo,
            patientRepo,
            queueRepo,
            uow,
            ctx,
            settingsRepo: settingsRepo,
            vitalsRepo: TestDbHelper.CreateRepository<PatientVitals>(db, sieve),
            physicalExamRepo: TestDbHelper.CreateRepository<PatientPhysicalExam>(db, sieve),
            ncdRepo: TestDbHelper.CreateRepository<NcdRiskAssessment>(db, sieve),
            membershipRepo: membershipRepo,
            enlistmentRepo: enlistmentRepo,
            sequenceGenerator: seqGen,
            verificationRepo: verificationRepo,
            submissionRepo: submissionRepo,
            yakapDispatcher: dispatcher);

        var completed = await completeHandler.Handle(new CompleteHealthScreeningCommand(
            screening.Id,
            HealthScreeningDisposition.Cleared,
            ClinicalImpression: "Normal adult screening"), CancellationToken.None);

        completed.Status.Should().Be(HealthScreeningStatus.Completed);
        await dispatcher.Received(1).DispatchFpeSubmissionAsync(screening.Id, Arg.Any<CancellationToken>());

        // Poll Service 06 -> Rejected with field errors -> persists YakapSubmissionError rows -> Retry succeeds!
        pcapi.GetUploadStatusAsync(uploadTxNo, Arg.Any<CancellationToken>())
            .Returns(ApiResponse<DataUploadStatusResponse>.Success(new DataUploadStatusResponse(
                UploadTransactionNo: uploadTxNo,
                Form: "fpe",
                ProcessingStatus: "rejected",
                ProcessedAt: DateTime.UtcNow,
                Errors: new[] { new DataUploadFieldError("pBloodPressure", "Invalid diastolic reading.") })));

        var pollHandler = new PollYakapSubmissionStatusCommandHandler(submissionRepo, submissionErrorRepo, patientRepo, pcapi, uow, ctx);
        var polled = await pollHandler.Handle(new PollYakapSubmissionStatusCommand(fpeRes.SubmissionId), CancellationToken.None);

        polled.ProcessingStatus.Should().Be("Rejected");
        polled.Errors.Should().ContainSingle(e => e.FieldPath == "pBloodPressure");
        polled.PatientCode.Should().Be("PAT-Y2-001"); // Zero-PHI Portal DTO: PatientCode only!

        // Retry via Sender dispatches FPE submission again
        var retrySender = Substitute.For<ISender>();
        retrySender.Send(Arg.Any<SubmitHealthScreeningYakapFpeCommand>(), Arg.Any<CancellationToken>())
            .Returns(fpeRes);
        var retryHandler = new RetryYakapSubmissionCommandHandler(submissionRepo, patientRepo, retrySender, ctx);
        var retried = await retryHandler.Handle(new RetryYakapSubmissionCommand(fpeRes.SubmissionId), CancellationToken.None);
        retried.Id.Should().Be(fpeRes.SubmissionId);
        await retrySender.Received(1).Send(
            Arg.Is<SubmitHealthScreeningYakapFpeCommand>(c => c.HealthScreeningId == screening.Id),
            Arg.Any<CancellationToken>());

        // Service 08 Confirmation / Availment Slip PDF
        pcapi.GenerateAvailmentSlipAsync(Arg.Any<AvailmentSlipRequest>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<AvailmentSlipResponse>.Success(new AvailmentSlipResponse(
                PatientPin: NormalizedWalkInPin,
                EffYear: year.ToString(),
                MimeType: "application/pdf",
                PdfBase64: Convert.ToBase64String(System.Text.Encoding.ASCII.GetBytes("%PDF-1.4\n")))));

        var slipHandler = new GetYakapAvailmentSlipQueryHandler(patientRepo, membershipRepo, settingsRepo, pcapi, ctx);
        var slip = await slipHandler.Handle(new GetYakapAvailmentSlipQuery(patient.Id, year), CancellationToken.None);
        slip.MimeType.Should().Be("application/pdf");
        slip.PdfBase64.Should().NotBeNullOrWhiteSpace();

        // Zero-PHI Portal telemetry queries
        var summaryHandler = new GetYakapSubmissionsSummaryQueryHandler(submissionRepo, enlistmentRepo, settingsRepo, ctx);
        var summary = await summaryHandler.Handle(new GetYakapSubmissionsSummaryQuery(), CancellationToken.None);
        summary.EmpaneledCount.Should().Be(1);
        summary.RejectedOrFailedCount.Should().Be(1);

        var listHandler = new GetYakapSubmissionsQueryHandler(submissionRepo, ctx);
        var list = await listHandler.Handle(new GetYakapSubmissionsQuery(), CancellationToken.None);
        list.Should().HaveCount(2);
        list.Should().OnlyContain(x => x.PatientCode == "PAT-Y2-001");
        list.Should().ContainSingle(x => x.SubmissionType == "Fpe");
        list.Should().ContainSingle(x => x.SubmissionType == "Empanelment");
        System.Text.Json.JsonSerializer.Serialize(list).Should().NotContain(NormalizedWalkInPin);
        System.Text.Json.JsonSerializer.Serialize(list).Should().NotContain("Dela Cruz");
    }

    [Fact]
    public async Task OtpAndValidIdIdentityModes_AndOfflineSelectionDraft_WorkWhenSelectedOrOutage()
    {
        var clinicId = Guid.NewGuid();
        var ctx = CreateClinicContext(clinicId);
        var (db, uow, sieve, patient, _) = await SeedClinicAndWalkInPatientAsync(ctx);

        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var membershipRepo = TestDbHelper.CreateRepository<PatientPhilHealthMembership>(db, sieve);
        var enlistmentRepo = TestDbHelper.CreateRepository<PatientYakapEnlistment>(db, sieve);
        var verificationRepo = TestDbHelper.CreateRepository<PatientIdentityVerification>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var seqGen = new PhilHealthSequenceGenerator(db, NullLogger<PhilHealthSequenceGenerator>.Instance);
        var pcapi = Substitute.For<IYakapPcapiClient>();

        // Service 07: Text Code OTP
        pcapi.ValidateVerificationCodeAsync(Arg.Any<VerificationCodeRequest>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<VerificationCodeResponse>.Success(new VerificationCodeResponse(
                PatientPin: NormalizedWalkInPin,
                AccreNo: AccreditationNo,
                TransactionDate: DateTime.UtcNow.ToString("yyyy-MM-dd"),
                Status: "VALID")));

        var otpHandler = new ValidatePatientOtpCommandHandler(
            patientRepo, membershipRepo, verificationRepo, enlistmentRepo, settingsRepo, pcapi, uow, ctx);
        var otpRes = await otpHandler.Handle(new ValidatePatientOtpCommand(patient.Id, "482910"), CancellationToken.None);
        otpRes.Mode.Should().Be("OTP");
        otpRes.IsVerified.Should().BeTrue();

        // Fallback Valid Government Photo ID
        var idHandler = new RecordValidIdVerificationCommandHandler(
            patientRepo, verificationRepo, enlistmentRepo, settingsRepo, uow, ctx);
        var idRes = await idHandler.Handle(new RecordValidIdVerificationCommand(patient.Id, "DL", "N01-12-345678"), CancellationToken.None);
        idRes.Mode.Should().Be("VALID_ID");
        idRes.ValidIdTypeCode.Should().Be("DL");
        idRes.IsVerified.Should().BeTrue();

        // Service 04 Outage -> saves local WalkIn draft & queues sync instead of blocking walk-in patient!
        pcapi.SubmitSelectionAsync(Arg.Any<YakapSelectionRequest>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<YakapSelectionResponse>.Fail("PhilHealth gateway timed out (504)."));

        var selectionHandler = new SubmitPatientYakapSelectionCommandHandler(
            patientRepo, membershipRepo, enlistmentRepo, verificationRepo, settingsRepo, pcapi, seqGen, uow, ctx);
        var draft = await selectionHandler.Handle(new SubmitPatientYakapSelectionCommand(patient.Id), CancellationToken.None);

        draft.QueuedForSync.Should().BeTrue();
        draft.SelectionStatus.Should().Be("LOCAL_WALKIN_DRAFT");
        draft.CaseNo.Should().HaveLength(23).And.StartWith("CH00000921");

        var savedEnlistment = await db.PatientYakapEnlistments.SingleAsync(e => e.Id == draft.EnlistmentId);
        savedEnlistment.Source.Should().Be(YakapEnlistmentSource.WalkIn);
        savedEnlistment.Status.Should().Be(YakapEnlistmentStatus.Active);
        savedEnlistment.RegistrationStatusCode.Should().Be("LOCAL_WALKIN_DRAFT");
    }

    [Fact]
    public async Task Empanelment_WithoutConsent_ThrowsPlainEnglishBadRequest()
    {
        var clinicId = Guid.NewGuid();
        var ctx = CreateClinicContext(clinicId);
        var (db, uow, sieve, patient, _) = await SeedClinicAndWalkInPatientAsync(ctx);

        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var membershipRepo = TestDbHelper.CreateRepository<PatientPhilHealthMembership>(db, sieve);
        var enlistmentRepo = TestDbHelper.CreateRepository<PatientYakapEnlistment>(db, sieve);
        var verificationRepo = TestDbHelper.CreateRepository<PatientIdentityVerification>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var seqGen = new PhilHealthSequenceGenerator(db, NullLogger<PhilHealthSequenceGenerator>.Instance);
        var pcapi = Substitute.For<IYakapPcapiClient>();

        var selectionHandler = new SubmitPatientYakapSelectionCommandHandler(
            patientRepo, membershipRepo, enlistmentRepo, verificationRepo, settingsRepo, pcapi, seqGen, uow, ctx);

        var act = () => selectionHandler.Handle(new SubmitPatientYakapSelectionCommand(patient.Id, Consent: false), CancellationToken.None);
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*permission*");
    }

    [Fact]
    public async Task VerifyPinQuery_RequiresValidMod11SequenceAndPhilHealthRegistryConfirmation()
    {
        var clinicId = Guid.NewGuid();
        var ctx = CreateClinicContext(clinicId);
        var (db, _, sieve, _, _) = await SeedClinicAndWalkInPatientAsync(ctx);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var pcapi = Substitute.For<IYakapPcapiClient>();

        var handler = new VerifyPhilHealthPinQueryHandler(pcapi, settingsRepo, ctx);

        // 1. Invalid Mod-11 sequence is rejected locally without calling PhilHealth
        var badSeq = await handler.Handle(new VerifyPhilHealthPinQuery("12-345678901-9"), CancellationToken.None);
        badSeq.IsValid.Should().BeFalse();
        badSeq.IsSequenceValid.Should().BeFalse();
        badSeq.IsPhilHealthVerified.Should().BeFalse();
        await pcapi.DidNotReceive().ValidateStandingAsync(Arg.Any<YakapValidateStandingRequest>(), Arg.Any<CancellationToken>());

        // 2. Valid Mod-11 sequence but PhilHealth DB lookup fails -> IsSequenceValid true, IsPhilHealthVerified false, IsValid false, IsServerError false
        pcapi.ValidateStandingAsync(Arg.Any<YakapValidateStandingRequest>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<YakapValidatorResponse>.Fail("Beneficiary not found in PhilHealth registry."));
        var notInDb = await handler.Handle(new VerifyPhilHealthPinQuery("12-345678901-8"), CancellationToken.None);
        notInDb.IsValid.Should().BeFalse();
        notInDb.IsSequenceValid.Should().BeTrue();
        notInDb.IsPhilHealthVerified.Should().BeFalse();
        notInDb.IsServerError.Should().BeFalse();
        notInDb.FailureReason.Should().Contain("Beneficiary not found");

        // 2b. Valid Mod-11 sequence but PhilHealth verification fails due to server/timeout error -> IsServerError true
        pcapi.ValidateStandingAsync(Arg.Any<YakapValidateStandingRequest>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<YakapValidatorResponse>.Fail("PhilHealth did not answer in time.", "TIMEOUT"));
        var timedOut = await handler.Handle(new VerifyPhilHealthPinQuery("12-345678901-8"), CancellationToken.None);
        timedOut.IsValid.Should().BeFalse();
        timedOut.IsSequenceValid.Should().BeTrue();
        timedOut.IsPhilHealthVerified.Should().BeFalse();
        timedOut.IsServerError.Should().BeTrue();

        // 3. Valid Mod-11 sequence AND PhilHealth DB confirmed -> IsValid true
        pcapi.ValidateStandingAsync(Arg.Any<YakapValidateStandingRequest>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<YakapValidatorResponse>.Success(new YakapValidatorResponse(
                PatientPin: "123456789018",
                PatientLname: "SANTOS",
                PatientFname: "MARIA",
                PatientMname: null,
                PatientExtname: null,
                Pcu: new PcuStatusInfo("UNVERIFIED"),
                Selection: new SelectionStatusInfo("NOT_ASSIGNED"),
                Empanelment: new EmpanelmentStatusInfo("N"),
                Fpe: new FpeStatusInfo("N"),
                Consultation: new ConsultationStatusInfo("N"))));
        var verified = await handler.Handle(new VerifyPhilHealthPinQuery("12-345678901-8"), CancellationToken.None);
        verified.IsValid.Should().BeTrue();
        verified.IsSequenceValid.Should().BeTrue();
        verified.IsPhilHealthVerified.Should().BeTrue();
        verified.IsUniqueInClinic.Should().BeTrue();
        verified.FormattedPin.Should().Be("12-345678901-8");
        verified.MemberName.Should().Be("SANTOS, MARIA");
    }

    [Fact]
    public async Task PinValidationAndMembership_EnforceClinicUniquenessAndDistinctDependentPrincipalPin()
    {
        var clinicId = Guid.NewGuid();
        var ctx = CreateClinicContext(clinicId);
        var (db, uow, sieve, existingOwner, _) = await SeedClinicAndWalkInPatientAsync(ctx);
        existingOwner.PhilHealthNumber = "12-121212121-7";
        await uow.SaveChangesAsync();

        var secondPatient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = ctx.TenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-SECOND",
            FirstName = "Marco",
            LastName = "Donito",
            DateOfBirth = new DateOnly(2000, 1, 1),
            Sex = BiologicalSex.Male,
            ContactNumber = "09170000002"
        };
        db.Patients.Add(secondPatient);
        await uow.SaveChangesAsync();

        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var membershipRepo = TestDbHelper.CreateRepository<PatientPhilHealthMembership>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var pcapi = Substitute.For<IYakapPcapiClient>();

        // 1. VerifyPhilHealthPinQuery rejects PIN already owned by another patient in the clinic without waiting on PhilHealth PCAPI
        var verifyHandler = new VerifyPhilHealthPinQueryHandler(pcapi, settingsRepo, ctx, null, patientRepo, membershipRepo);
        var dupResult = await verifyHandler.Handle(new VerifyPhilHealthPinQuery("12-121212121-7", secondPatient.Id), CancellationToken.None);
        dupResult.IsValid.Should().BeFalse();
        dupResult.IsUniqueInClinic.Should().BeFalse();
        dupResult.IsServerError.Should().BeFalse();
        dupResult.ConflictingPatientCode.Should().Be(existingOwner.PatientCode);
        await pcapi.DidNotReceive().ValidateStandingAsync(Arg.Any<YakapValidateStandingRequest>(), Arg.Any<CancellationToken>());

        // Self-check (ExcludePatientId == existingOwner.Id) is allowed as unique
        pcapi.ValidateStandingAsync(Arg.Any<YakapValidateStandingRequest>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<YakapValidatorResponse>.Success(new YakapValidatorResponse(
                PatientPin: "1212121217", PatientLname: "DELA CRUZ", PatientFname: "JUAN", PatientMname: null, PatientExtname: null,
                Pcu: new("UNVERIFIED"), Selection: new("PENDING"), Empanelment: new("N"), Fpe: new("N"), Consultation: new("N"))));
        var selfResult = await verifyHandler.Handle(new VerifyPhilHealthPinQuery("12-121212121-7", existingOwner.Id), CancellationToken.None);
        selfResult.IsValid.Should().BeTrue();
        selfResult.IsUniqueInClinic.Should().BeTrue();

        // Principal Member PIN check (CheckClinicUniqueness: false) still checks Mod-11 + PhilHealth DB
        // while allowing a Principal Sponsor who is already a patient in the clinic.
        var principalSponsorResult = await verifyHandler.Handle(
            new VerifyPhilHealthPinQuery("12-121212121-7", ExcludePatientId: null, CheckClinicUniqueness: false),
            CancellationToken.None);
        principalSponsorResult.IsValid.Should().BeTrue();
        principalSponsorResult.IsPhilHealthVerified.Should().BeTrue();
        principalSponsorResult.MemberName.Should().Be("DELA CRUZ, JUAN");

        // 2. Validator & Handler reject DD Dependent sharing the exact same PIN as their Principal Member
        var validator = new UpsertPatientPhilHealthMembershipCommandValidator();
        var samePinCmd = new UpsertPatientPhilHealthMembershipCommand(
            PatientId: secondPatient.Id,
            MemberType: "DD",
            DependentRelationship: "S",
            PhilHealthPin: "12-345678901-8",
            PrincipalMemberPin: "12-345678901-8",
            PrincipalLastName: "Donito",
            PrincipalFirstName: "Elena",
            PrincipalDateOfBirth: new DateOnly(1998, 2, 10));
        validator.Validate(samePinCmd).IsValid.Should().BeFalse();

        var upsertHandler = new UpsertPatientPhilHealthMembershipCommandHandler(patientRepo, membershipRepo, uow, ctx);
        await Assert.ThrowsAsync<ClinicEz.Shared.Exceptions.BadRequestException>(
            () => upsertHandler.Handle(samePinCmd, CancellationToken.None));

        // 3. Handler rejects saving another patient's PIN (ConflictException)
        var duplicatePinCmd = new UpsertPatientPhilHealthMembershipCommand(
            PatientId: secondPatient.Id,
            MemberType: "MM",
            PhilHealthPin: "12-121212121-7");
        await Assert.ThrowsAsync<ClinicEz.Shared.Exceptions.ConflictException>(
            () => upsertHandler.Handle(duplicatePinCmd, CancellationToken.None));
    }
}
