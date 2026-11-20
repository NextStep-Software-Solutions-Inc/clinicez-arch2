using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.HealthScreenings.Common;
using ClinicEz.Clinic.Application.Features.Yakap.Common;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Application.Features.Yakap.WireBuilders;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Workspace;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Application.Features.Yakap.Commands;

/// <summary>
/// Uploads a completed YAKAP Health Screening (Annex A FPE) via PCAPI v2.0 Service 06
/// and executes Service 03 formal empanelment (MCA...) if not yet issued.
/// Never fails the clinician's local clinical sign-off if PhilHealth is temporarily unreachable —
/// records a Queued <see cref="YakapSubmission"/> for automatic retry/polling.
/// </summary>
public sealed record SubmitHealthScreeningYakapFpeCommand(Guid HealthScreeningId) : IRequest<YakapFpeSubmissionResultDto>;

public sealed class SubmitHealthScreeningYakapFpeCommandHandler : IRequestHandler<SubmitHealthScreeningYakapFpeCommand, YakapFpeSubmissionResultDto>
{
    private readonly IRepository<HealthScreening> _screeningRepo;
    private readonly IRepository<Patient> _patientRepo;
    private readonly IRepository<PatientPhilHealthMembership> _membershipRepo;
    private readonly IRepository<PatientYakapEnlistment> _enlistmentRepo;
    private readonly IRepository<PatientIdentityVerification> _verificationRepo;
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IRepository<PatientVitals> _vitalsRepo;
    private readonly IRepository<PatientPhysicalExam> _physicalExamRepo;
    private readonly IRepository<NcdRiskAssessment> _ncdRepo;
    private readonly IRepository<PatientMedicalHistory> _medicalHistoryRepo;
    private readonly IRepository<PatientFamilyHistory> _familyHistoryRepo;
    private readonly IRepository<PatientAllergy> _allergyRepo;
    private readonly IRepository<PatientImmunization> _immunizationRepo;
    private readonly IRepository<PatientSocialHistory> _socialHistoryRepo;
    private readonly IRepository<YakapSubmission> _submissionRepo;
    private readonly IRepository<YakapSubmissionError> _submissionErrorRepo;
    private readonly IPhilHealthSequenceGenerator _sequenceGenerator;
    private readonly IYakapPcapiClient _pcapiClient;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly YakapFpeWireBuilder _wireBuilder;
    private readonly IWorkspaceProfileProvider? _workspaceProfiles;
    private readonly ILogger<SubmitHealthScreeningYakapFpeCommandHandler>? _logger;

    public SubmitHealthScreeningYakapFpeCommandHandler(
        IRepository<HealthScreening> screeningRepo,
        IRepository<Patient> patientRepo,
        IRepository<PatientPhilHealthMembership> membershipRepo,
        IRepository<PatientYakapEnlistment> enlistmentRepo,
        IRepository<PatientIdentityVerification> verificationRepo,
        IRepository<FacilitySettings> settingsRepo,
        IRepository<PatientVitals> vitalsRepo,
        IRepository<PatientPhysicalExam> physicalExamRepo,
        IRepository<NcdRiskAssessment> ncdRepo,
        IRepository<PatientMedicalHistory> medicalHistoryRepo,
        IRepository<PatientFamilyHistory> familyHistoryRepo,
        IRepository<PatientAllergy> allergyRepo,
        IRepository<PatientImmunization> immunizationRepo,
        IRepository<PatientSocialHistory> socialHistoryRepo,
        IRepository<YakapSubmission> submissionRepo,
        IRepository<YakapSubmissionError> submissionErrorRepo,
        IPhilHealthSequenceGenerator sequenceGenerator,
        IYakapPcapiClient pcapiClient,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        YakapFpeWireBuilder? wireBuilder = null,
        IWorkspaceProfileProvider? workspaceProfiles = null,
        ILogger<SubmitHealthScreeningYakapFpeCommandHandler>? logger = null)
    {
        _screeningRepo = screeningRepo;
        _patientRepo = patientRepo;
        _membershipRepo = membershipRepo;
        _enlistmentRepo = enlistmentRepo;
        _verificationRepo = verificationRepo;
        _settingsRepo = settingsRepo;
        _vitalsRepo = vitalsRepo;
        _physicalExamRepo = physicalExamRepo;
        _ncdRepo = ncdRepo;
        _medicalHistoryRepo = medicalHistoryRepo;
        _familyHistoryRepo = familyHistoryRepo;
        _allergyRepo = allergyRepo;
        _immunizationRepo = immunizationRepo;
        _socialHistoryRepo = socialHistoryRepo;
        _submissionRepo = submissionRepo;
        _submissionErrorRepo = submissionErrorRepo;
        _sequenceGenerator = sequenceGenerator;
        _pcapiClient = pcapiClient;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _wireBuilder = wireBuilder ?? new YakapFpeWireBuilder();
        _workspaceProfiles = workspaceProfiles;
        _logger = logger;
    }

    public async Task<YakapFpeSubmissionResultDto> Handle(SubmitHealthScreeningYakapFpeCommand request, CancellationToken ct)
    {
        var screening = await _screeningRepo
            .Query(hs => hs.Id == request.HealthScreeningId && hs.ClinicId == _clinicContext.ClinicId && !hs.IsDeleted)
            .FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException($"Health screening '{request.HealthScreeningId}' was not found.");

        var patient = await _patientRepo
            .Query(p => p.Id == screening.PatientId && p.ClinicId == _clinicContext.ClinicId && !p.IsDeleted)
            .Include(p => p.Addresses)
            .Include(p => p.PhilHealthMembership)
            .FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException($"Patient '{screening.PatientId}' was not found.");

        var membership = patient.PhilHealthMembership ?? await _membershipRepo
            .Query(m => m.PatientId == patient.Id && m.ClinicId == _clinicContext.ClinicId && !m.IsDeleted)
            .AsNoTracking()
            .FirstOrDefaultAsync(ct);

        var settings = await _settingsRepo
            .Query(s => s.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(ct)
            ?? new FacilitySettings
            {
                Id = Guid.NewGuid(),
                TenantId = _clinicContext.TenantId,
                ClinicId = _clinicContext.ClinicId,
                ClinicName = "Clinic Facility",
                AccreditationNumber = "H00000001"
            };

        var accre9 = YakapWorkflowHelpers.ResolveAccreditation9(settings.AccreditationNumber);
        if (string.IsNullOrWhiteSpace(settings.AccreditationNumber))
        {
            settings.AccreditationNumber = accre9;
        }

        var today = await YakapWorkflowHelpers.ResolveTodayAsync(_workspaceProfiles, _clinicContext.TenantId, _settingsRepo, ct);
        var nowUtc = DateTime.UtcNow;
        var actor = _clinicContext.StaffId?.ToString() ?? _clinicContext.StaffName ?? "ClinicStaff";

        PatientYakapEnlistment? enlistment = null;
        if (screening.YakapEnlistmentId.HasValue)
        {
            enlistment = await _enlistmentRepo
                .Query(e => e.Id == screening.YakapEnlistmentId.Value && e.ClinicId == _clinicContext.ClinicId && !e.IsDeleted)
                .FirstOrDefaultAsync(ct);
        }
        enlistment ??= await _enlistmentRepo
            .Query(e => e.PatientId == patient.Id && e.ClinicId == _clinicContext.ClinicId && e.EffectiveYear == today.Year && !e.IsDeleted)
            .FirstOrDefaultAsync(ct);

        var latestVerif = screening.PatientIdentityVerificationId.HasValue
            ? await _verificationRepo
                .Query(v => v.Id == screening.PatientIdentityVerificationId.Value && !v.IsDeleted)
                .FirstOrDefaultAsync(ct)
            : await YakapWorkflowHelpers.GetLatestVerifiedForPatientAsync(_verificationRepo, _clinicContext.ClinicId, patient.Id, ct);

        bool isNewEnlistment = enlistment == null;
        if (enlistment == null)
        {
            var generatedCaseNo = await _sequenceGenerator.GenerateCaseNumberAsync(
                patient.TenantId ?? _clinicContext.TenantId,
                _clinicContext.ClinicId,
                accre9,
                today.Year.ToString(),
                ct);

            enlistment = new PatientYakapEnlistment
            {
                Id = Guid.NewGuid(),
                TenantId = patient.TenantId ?? _clinicContext.TenantId,
                ClinicId = _clinicContext.ClinicId,
                PatientId = patient.Id,
                EffectiveYear = today.Year,
                Status = YakapEnlistmentStatus.Active,
                Source = YakapEnlistmentSource.WalkIn,
                PackageType = YakapPackageType.YakapPrimaryCare,
                EnlistmentDate = today,
                ValidUntil = new DateOnly(today.Year, 12, 31),
                CaseNo = generatedCaseNo,
                HciAccreditationNumber = accre9,
                RegistrationStatusCode = "LOCAL_WALKIN_DRAFT",
                IdentityVerificationId = latestVerif?.Id,
                EmpanelmentMethod = latestVerif != null ? YakapWorkflowHelpers.MapVerificationModeString(latestVerif.Mode) : null,
                IsWalkedIn = screening.IsWalkedIn,
                HasPatientConsent = true,
                ConsentSignedAtUtc = nowUtc,
                CreatedAt = nowUtc,
                CreatedBy = actor
            };
            await _enlistmentRepo.AddAsync(enlistment, ct);
        }

        if (string.IsNullOrWhiteSpace(enlistment.CaseNo))
        {
            enlistment.CaseNo = await _sequenceGenerator.GenerateCaseNumberAsync(
                patient.TenantId ?? _clinicContext.TenantId,
                _clinicContext.ClinicId,
                accre9,
                enlistment.EffectiveYear.ToString(),
                ct);
        }

        if (string.IsNullOrWhiteSpace(enlistment.ProfilingTransNo))
        {
            var profNo = !string.IsNullOrWhiteSpace(screening.ProfilingTransNo)
                ? screening.ProfilingTransNo
                : await _sequenceGenerator.GenerateTransactionNumberAsync(
                    patient.TenantId ?? _clinicContext.TenantId,
                    _clinicContext.ClinicId,
                    PhilHealthSequenceType.Profiling,
                    accre9,
                    enlistment.EffectiveYear.ToString(),
                    ct);
            enlistment.ProfilingTransNo = profNo;
        }

        screening.YakapEnlistmentId = enlistment.Id;
        screening.ProfilingTransNo = enlistment.ProfilingTransNo;
        if (latestVerif != null) screening.PatientIdentityVerificationId = latestVerif.Id;

        var caseNo23 = YakapWorkflowHelpers.Clamp(enlistment.CaseNo, 23);
        var profNo23 = YakapWorkflowHelpers.Clamp(enlistment.ProfilingTransNo, 23);

        // Load clinical components for Annex A wire payload
        var vitals = screening.PatientVitalsId.HasValue
            ? await _vitalsRepo.Query(v => v.Id == screening.PatientVitalsId.Value && !v.IsDeleted).AsNoTracking().FirstOrDefaultAsync(ct)
            : null;
        var pe = screening.PatientPhysicalExamId.HasValue
            ? await _physicalExamRepo.Query(p => p.Id == screening.PatientPhysicalExamId.Value && !p.IsDeleted).AsNoTracking().FirstOrDefaultAsync(ct)
            : null;
        var ncd = screening.NcdRiskAssessmentId.HasValue
            ? await _ncdRepo.Query(n => n.Id == screening.NcdRiskAssessmentId.Value && !n.IsDeleted).AsNoTracking().FirstOrDefaultAsync(ct)
            : null;
        var medHistory = await _medicalHistoryRepo.Query(m => m.PatientId == patient.Id && m.ClinicId == _clinicContext.ClinicId && !m.IsDeleted).AsNoTracking().ToListAsync(ct);
        var famHistory = await _familyHistoryRepo.Query(f => f.PatientId == patient.Id && f.ClinicId == _clinicContext.ClinicId && !f.IsDeleted).AsNoTracking().ToListAsync(ct);
        var allergies = await _allergyRepo.Query(a => a.PatientId == patient.Id && a.ClinicId == _clinicContext.ClinicId && !a.IsDeleted).AsNoTracking().ToListAsync(ct);
        var immunizations = await _immunizationRepo.Query(i => i.PatientId == patient.Id && i.ClinicId == _clinicContext.ClinicId && !i.IsDeleted).AsNoTracking().ToListAsync(ct);
        var socialHistory = await _socialHistoryRepo.Query(s => s.PatientId == patient.Id && s.ClinicId == _clinicContext.ClinicId && !s.IsDeleted).AsNoTracking().FirstOrDefaultAsync(ct);

        var wireResult = _wireBuilder.BuildWirePayload(new YakapFpeContext
        {
            Facility = settings,
            Patient = patient,
            Vitals = vitals,
            PhysicalExam = pe,
            NcdAssessment = ncd,
            MedicalHistory = medHistory,
            FamilyHistory = famHistory,
            Allergies = allergies,
            Immunizations = immunizations,
            SocialHistory = socialHistory,
            HealthScreening = screening,
            Enlistment = enlistment,
            EnlistmentCaseNo = caseNo23,
            ProfilingTransNo = profNo23
        });

        YakapSubmission? submission = null;
        if (screening.YakapSubmissionId.HasValue)
        {
            submission = await _submissionRepo
                .Query(s => s.Id == screening.YakapSubmissionId.Value && s.ClinicId == _clinicContext.ClinicId && !s.IsDeleted)
                .FirstOrDefaultAsync(ct);
        }
        submission ??= await _submissionRepo
            .Query(s => s.SourceRecordId == screening.Id && s.ClinicId == _clinicContext.ClinicId && s.SubmissionType == YakapSubmissionType.Fpe && !s.IsDeleted)
            .FirstOrDefaultAsync(ct);

        bool isNewSubmission = submission == null;
        if (submission == null)
        {
            submission = new YakapSubmission
            {
                Id = Guid.NewGuid(),
                TenantId = patient.TenantId ?? _clinicContext.TenantId,
                ClinicId = _clinicContext.ClinicId,
                PatientId = patient.Id,
                PatientYakapEnlistmentId = enlistment.Id,
                SourceRecordId = screening.Id,
                AccreditationNo = accre9,
                CaseNo = caseNo23,
                SubmissionType = YakapSubmissionType.Fpe,
                ReportStatus = YakapReportStatus.U,
                LocalTransactionNo = profNo23,
                ProcessingStatus = YakapProcessingStatus.Queued,
                CreatedAt = nowUtc,
                CreatedBy = actor
            };
            await _submissionRepo.AddAsync(submission, ct);
        }

        screening.YakapSubmissionId = submission.Id;
        submission.AttemptCount++;
        submission.AccreditationNo = accre9;
        submission.CaseNo = caseNo23;
        submission.LocalTransactionNo = profNo23;
        submission.PatientYakapEnlistmentId = enlistment.Id;
        submission.UpdatedAt = nowUtc;
        submission.UpdatedBy = actor;

        if (wireResult.IsFailure)
        {
            submission.ProcessingStatus = YakapProcessingStatus.Failed;
            submission.LastErrorMessage = string.Join("; ", wireResult.Errors);
            foreach (var err in wireResult.Errors)
            {
                await _submissionErrorRepo.AddAsync(new YakapSubmissionError
                {
                    Id = Guid.NewGuid(),
                    TenantId = submission.TenantId,
                    ClinicId = submission.ClinicId,
                    YakapSubmissionId = submission.Id,
                    FieldPath = "fpe.readiness",
                    Issue = err,
                    ErrorCode = "LOCAL_VALIDATION",
                    CreatedAt = nowUtc,
                    CreatedBy = actor
                }, ct);
            }

            if (!isNewEnlistment) _enlistmentRepo.Update(enlistment);
            if (!isNewSubmission) _submissionRepo.Update(submission);
            _screeningRepo.Update(screening);
            await _unitOfWork.SaveChangesAsync(ct);

            return new YakapFpeSubmissionResultDto(
                SubmissionId: submission.Id,
                ScreeningId: screening.Id,
                ProcessingStatus: submission.ProcessingStatus.ToString(),
                LocalTransactionNo: submission.LocalTransactionNo,
                UploadTransactionNo: null,
                YesReferenceNo: enlistment.YesReferenceNo,
                EmpanelmentStatus: null,
                ErrorMessage: submission.LastErrorMessage);
        }

        var wireJson = wireResult.Value!;
        submission.PayloadSha256Hash = YakapWorkflowHelpers.ComputeSha256Hex(wireJson);

        var pin = PhilHealthPinNormalizer.Normalize(HealthScreeningHelper.ResolvePatientPin(patient, membership)) ?? string.Empty;

        // If clinic assignment was still a local draft and we have verified identity, push Service 04 Selection first.
        if (latestVerif != null &&
            (string.IsNullOrWhiteSpace(enlistment.SelectionControlNumber) ||
             string.Equals(enlistment.RegistrationStatusCode, "LOCAL_WALKIN_DRAFT", StringComparison.OrdinalIgnoreCase)) &&
            !string.IsNullOrWhiteSpace(pin))
        {
            var modeStr = YakapWorkflowHelpers.MapVerificationModeString(latestVerif.Mode);
            var selRes = await _pcapiClient.SubmitSelectionAsync(
                new YakapSelectionRequest(
                    PatientPin: pin,
                    SelectionDate: YakapWorkflowHelpers.FormatMmDdYyyy(enlistment.EnlistmentDate == default ? today : enlistment.EnlistmentDate),
                    Consent: true,
                    PatientVerificationMode: modeStr,
                    PcuTransactionCode: latestVerif.Mode == YakapVerificationMode.PCU ? latestVerif.PcuTransactionId : null,
                    OneTimePin: latestVerif.Mode == YakapVerificationMode.OTP ? latestVerif.OneTimePin : null,
                    ValidIdType: latestVerif.Mode == YakapVerificationMode.VALID_ID ? latestVerif.ValidIdTypeCode : null),
                ct);
            if (selRes.Succeeded && selRes.Data?.Selection != null)
            {
                enlistment.SelectionControlNumber = YakapWorkflowHelpers.Clamp(selRes.Data.Selection.TransactionNo, 23);
                enlistment.RegistrationStatusCode = selRes.Data.Selection.Status;
            }
        }

        // Service 06: Upload Annex A FPE JSON (proxy encrypts with Annex C cipher key)
        var uploadRes = await _pcapiClient.UploadPlainJsonAsync("fpe", wireJson, ct);
        string? empStatus = null;

        if (uploadRes.Succeeded && uploadRes.Data != null && !string.IsNullOrWhiteSpace(uploadRes.Data.UploadTransactionNo))
        {
            submission.UploadTransactionNo = YakapWorkflowHelpers.Clamp(uploadRes.Data.UploadTransactionNo, 23);
            submission.ProcessingStatus = string.Equals(uploadRes.Data.ProcessingStatus, "accepted", StringComparison.OrdinalIgnoreCase)
                ? YakapProcessingStatus.Accepted
                : YakapProcessingStatus.Processing;
            submission.SubmittedAtUtc = nowUtc;
            submission.NextPollAtUtc = nowUtc.AddMinutes(1);
            submission.LastErrorMessage = null;

            enlistment.Status = YakapEnlistmentStatus.ProfilingCompleted;
            enlistment.UpdatedAt = nowUtc;
            enlistment.UpdatedBy = actor;

            // Service 03: Submit formal Empanelment (MCA...) when identity is confirmed and not yet empaneled
            if (string.IsNullOrWhiteSpace(enlistment.YesReferenceNo) && latestVerif != null && !string.IsNullOrWhiteSpace(pin))
            {
                var modeStr = YakapWorkflowHelpers.MapVerificationModeString(latestVerif.Mode);
                var empRes = await _pcapiClient.SubmitEmpanelmentAsync(
                    new YakapEmpanelmentRequest(
                        PatientPin: pin,
                        Consent: true,
                        PatientVerificationMode: modeStr,
                        PcuTransactionCode: latestVerif.Mode == YakapVerificationMode.PCU ? latestVerif.PcuTransactionId : null,
                        OneTimePin: latestVerif.Mode == YakapVerificationMode.OTP ? latestVerif.OneTimePin : null,
                        ValidIdType: latestVerif.Mode == YakapVerificationMode.VALID_ID ? latestVerif.ValidIdTypeCode : null,
                        CreatedBy: _clinicContext.StaffName ?? actor),
                    ct);

                if (empRes.Succeeded && empRes.Data != null && !string.IsNullOrWhiteSpace(empRes.Data.YesReferenceNo))
                {
                    var yesRef = YakapWorkflowHelpers.Clamp(empRes.Data.YesReferenceNo, 10);
                    enlistment.YesReferenceNo = yesRef;
                    enlistment.McaFlag = true;
                    enlistment.EmpanelmentMethod = modeStr;
                    enlistment.Status = YakapEnlistmentStatus.Transmitted;

                    submission.YesReferenceNo = yesRef;
                    empStatus = "EMPANELLED";

                    await _submissionRepo.AddAsync(new YakapSubmission
                    {
                        Id = Guid.NewGuid(),
                        TenantId = submission.TenantId,
                        ClinicId = submission.ClinicId,
                        PatientId = submission.PatientId,
                        PatientYakapEnlistmentId = enlistment.Id,
                        SourceRecordId = enlistment.Id,
                        AccreditationNo = accre9,
                        CaseNo = caseNo23,
                        SubmissionType = YakapSubmissionType.Empanelment,
                        ReportStatus = YakapReportStatus.V,
                        LocalTransactionNo = caseNo23,
                        YesReferenceNo = yesRef,
                        ProcessingStatus = YakapProcessingStatus.Accepted,
                        SubmittedAtUtc = nowUtc,
                        CompletedAtUtc = nowUtc,
                        AttemptCount = 1,
                        CreatedAt = nowUtc,
                        CreatedBy = actor
                    }, ct);
                }
                else
                {
                    empStatus = "PENDING_RETRY";
                }
            }
            else if (!string.IsNullOrWhiteSpace(enlistment.YesReferenceNo))
            {
                submission.YesReferenceNo = YakapWorkflowHelpers.Clamp(enlistment.YesReferenceNo, 10);
                empStatus = "EMPANELLED";
            }
        }
        else
        {
            submission.ProcessingStatus = YakapProcessingStatus.Queued;
            submission.LastErrorMessage = uploadRes.Message ?? "Queued for automatic delivery to PhilHealth.";
            _logger?.LogWarning("[SubmitFpe] Deferred FPE upload for screening {ScreeningId}: {Reason}", screening.Id, submission.LastErrorMessage);
        }

        if (!isNewEnlistment) _enlistmentRepo.Update(enlistment);
        if (!isNewSubmission) _submissionRepo.Update(submission);
        _screeningRepo.Update(screening);
        await _unitOfWork.SaveChangesAsync(ct);

        return new YakapFpeSubmissionResultDto(
            SubmissionId: submission.Id,
            ScreeningId: screening.Id,
            ProcessingStatus: submission.ProcessingStatus.ToString(),
            LocalTransactionNo: submission.LocalTransactionNo,
            UploadTransactionNo: submission.UploadTransactionNo,
            YesReferenceNo: submission.YesReferenceNo,
            EmpanelmentStatus: empStatus,
            ErrorMessage: submission.LastErrorMessage);
    }
}
