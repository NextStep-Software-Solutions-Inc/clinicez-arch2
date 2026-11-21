using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.HealthScreenings.Common;
using ClinicEz.Clinic.Application.Features.HealthScreenings.DTOs;
using ClinicEz.Clinic.Application.Features.HealthScreenings.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Workspace;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.HealthScreenings.Commands;

public sealed record CompleteHealthScreeningCommand(
    Guid Id,
    HealthScreeningDisposition Disposition,
    string? ClinicalImpression = null,
    string? PreventiveCounselingNotes = null,
    DateOnly? RecommendedFollowUpDate = null,
    Guid? PatientVitalsId = null,
    Guid? PatientPhysicalExamId = null,
    Guid? NcdRiskAssessmentId = null,
    Guid? ServiceItemId = null,
    string? AdultsRoutineScreeningCode = null,
    string? PediatricRoutineScreeningCode = null,
    string? PrenatalScreeningServicesCode = null,
    string? BreastCancerScreeningCode = null,
    string? CervicalCancerScreeningCode = null,
    string? ColorectalCancerScreeningCode = null,
    string? ProstateCancerScreeningCode = null,
    string? PhilHealthAtc = null,
    bool? IsWalkedIn = null,
    YakapServiceDeliveryMethod? ServiceDeliveryMethod = null,
    string? FpeClassificationType = null,
    string? FacilitatorType = null,
    string? FacilitatorName = null,
    bool? HasCoPayment = null,
    DateOnly? CoPaymentDate = null,
    decimal? CoPaymentAmount = null,
    decimal? CoPaymentBalance = null) : IRequest<HealthScreeningDetailDto>;

public sealed class CompleteHealthScreeningCommandValidator : AbstractValidator<CompleteHealthScreeningCommand>
{
    public CompleteHealthScreeningCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty().WithMessage("Health screening ID is required.");
        RuleFor(x => x.Disposition).IsInEnum();
        RuleFor(x => x.ClinicalImpression).MaximumLength(2000);
        RuleFor(x => x.PreventiveCounselingNotes).MaximumLength(2000);
        RuleFor(x => x.AdultsRoutineScreeningCode).MaximumLength(100);
        RuleFor(x => x.PediatricRoutineScreeningCode).MaximumLength(100);
        RuleFor(x => x.PrenatalScreeningServicesCode).MaximumLength(100);
        RuleFor(x => x.BreastCancerScreeningCode).MaximumLength(50);
        RuleFor(x => x.CervicalCancerScreeningCode).MaximumLength(50);
        RuleFor(x => x.ColorectalCancerScreeningCode).MaximumLength(50);
        RuleFor(x => x.ProstateCancerScreeningCode).MaximumLength(50);
        RuleFor(x => x.PhilHealthAtc).MaximumLength(50);
        RuleFor(x => x.FpeClassificationType).MaximumLength(30);
        RuleFor(x => x.FacilitatorName).MaximumLength(150);
    }
}

public sealed class CompleteHealthScreeningCommandHandler
    : IRequestHandler<CompleteHealthScreeningCommand, HealthScreeningDetailDto>
{
    private readonly IRepository<HealthScreening> _screeningRepo;
    private readonly IRepository<Patient> _patientRepo;
    private readonly IRepository<QueueItem> _queueRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<FacilitySettings>? _settingsRepo;
    private readonly IRepository<ServiceItem>? _serviceItemRepo;
    private readonly IRepository<PatientVitals>? _vitalsRepo;
    private readonly IRepository<PatientPhysicalExam>? _physicalExamRepo;
    private readonly IRepository<NcdRiskAssessment>? _ncdRepo;
    private readonly IRepository<LabOrder>? _labOrderRepo;
    private readonly IRepository<PatientPhilHealthMembership>? _membershipRepo;
    private readonly IRepository<PatientYakapEnlistment>? _enlistmentRepo;
    private readonly IRepository<StaffMember>? _staffRepo;
    private readonly IPhilHealthSequenceGenerator? _sequenceGenerator;
    private readonly IWorkspaceProfileProvider? _workspaceProfiles;
    private readonly IRepository<PatientIdentityVerification>? _verificationRepo;
    private readonly IRepository<YakapSubmission>? _submissionRepo;
    private readonly IYakapScreeningDispatcher? _yakapDispatcher;

    public CompleteHealthScreeningCommandHandler(
        IRepository<HealthScreening> screeningRepo,
        IRepository<Patient> patientRepo,
        IRepository<QueueItem> queueRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IRepository<FacilitySettings>? settingsRepo = null,
        IRepository<ServiceItem>? serviceItemRepo = null,
        IRepository<PatientVitals>? vitalsRepo = null,
        IRepository<PatientPhysicalExam>? physicalExamRepo = null,
        IRepository<NcdRiskAssessment>? ncdRepo = null,
        IRepository<LabOrder>? labOrderRepo = null,
        IRepository<PatientPhilHealthMembership>? membershipRepo = null,
        IRepository<PatientYakapEnlistment>? enlistmentRepo = null,
        IRepository<StaffMember>? staffRepo = null,
        IPhilHealthSequenceGenerator? sequenceGenerator = null,
        IWorkspaceProfileProvider? workspaceProfiles = null,
        IRepository<PatientIdentityVerification>? verificationRepo = null,
        IRepository<YakapSubmission>? submissionRepo = null,
        IYakapScreeningDispatcher? yakapDispatcher = null)
    {
        _screeningRepo = screeningRepo;
        _patientRepo = patientRepo;
        _queueRepo = queueRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _settingsRepo = settingsRepo;
        _serviceItemRepo = serviceItemRepo;
        _vitalsRepo = vitalsRepo;
        _physicalExamRepo = physicalExamRepo;
        _ncdRepo = ncdRepo;
        _labOrderRepo = labOrderRepo;
        _membershipRepo = membershipRepo;
        _enlistmentRepo = enlistmentRepo;
        _staffRepo = staffRepo;
        _sequenceGenerator = sequenceGenerator;
        _workspaceProfiles = workspaceProfiles;
        _verificationRepo = verificationRepo;
        _submissionRepo = submissionRepo;
        _yakapDispatcher = yakapDispatcher;
    }

    public async Task<HealthScreeningDetailDto> Handle(
        CompleteHealthScreeningCommand request,
        CancellationToken cancellationToken)
    {
        var screening = await _screeningRepo
            .Query(hs => hs.Id == request.Id && hs.ClinicId == _clinicContext.ClinicId && !hs.IsDeleted)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException($"Health screening '{request.Id}' was not found in this clinic.");

        if (screening.Status is HealthScreeningStatus.Completed or HealthScreeningStatus.Cancelled or HealthScreeningStatus.EscalatedToConsultation)
        {
            throw new BadRequestException($"Health screening '{screening.Id}' cannot be completed from status '{screening.Status}'.");
        }

        var queueItem = await _queueRepo
            .Query(q => q.Id == screening.QueueItemId && q.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException($"Queue visit '{screening.QueueItemId}' was not found in this clinic.");

        if (queueItem.PatientId != screening.PatientId)
        {
            throw new BadRequestException($"Queue visit '{queueItem.Id}' does not belong to patient '{screening.PatientId}'.");
        }

        var patient = await _patientRepo
            .Query(p => p.Id == screening.PatientId && p.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException($"Patient '{screening.PatientId}' was not found in this clinic.");

        var settings = _settingsRepo != null
            ? await _settingsRepo.Query(s => s.ClinicId == _clinicContext.ClinicId).AsNoTracking().FirstOrDefaultAsync(cancellationToken)
            : null;

        StaffMember? callerStaff = null;
        if (_staffRepo != null && _clinicContext.StaffId.HasValue)
        {
            callerStaff = await _staffRepo
                .Query(s => s.Id == _clinicContext.StaffId.Value && s.ClinicId == _clinicContext.ClinicId)
                .Include(s => s.ClinicRole)
                .AsNoTracking()
                .FirstOrDefaultAsync(cancellationToken);
        }

        bool isPhysician = HealthScreeningHelper.IsCallerPhysician(_clinicContext, callerStaff);
        bool isNurseOrMidwife = HealthScreeningHelper.IsCallerAuthorizedClinicalNurseOrMidwife(_clinicContext, callerStaff);
        bool isYakap = screening.WorkflowMode == VisitWorkflowMode.YakapAvailment || screening.ScreeningType == HealthScreeningType.YakapFpe;

        // Enforce Completion & Sign-Off Authority Matrix
        if (isYakap)
        {
            bool allowNurseMidwife = settings?.AllowNurseMidwifeYakapFpeFacilitator ?? false;
            if (!isPhysician && !(allowNurseMidwife && isNurseOrMidwife))
            {
                throw new ForbiddenException(
                    "PhilHealth YAKAP FPE completion requires an attending Physician unless clinic settings allow an authorized Nurse/Midwife facilitator.");
            }
        }
        else if (screening.ScreeningType is HealthScreeningType.AnnualPhysicalExam or HealthScreeningType.PreEmployment or HealthScreeningType.SchoolPhysical)
        {
            if (!isPhysician)
            {
                throw new ForbiddenException(
                    $"{HealthScreeningHelper.ResolveScreeningTypeLabel(screening.ScreeningType)} requires Physician physical examination and sign-off.");
            }
        }
        else // RoutineWellness or CommunityScreening
        {
            if (!isPhysician && !isNurseOrMidwife)
            {
                throw new ForbiddenException(
                    "Completing a Routine Wellness or Community Health Screening requires either a Physician or an authorized Nurse.");
            }
        }

        // Validate Vitals exist (validate explicit PatientVitalsId belongs to same patient & clinic and is not deleted)
        PatientVitals? vitals = null;
        if (request.PatientVitalsId.HasValue)
        {
            if (request.PatientVitalsId.Value == Guid.Empty)
            {
                throw new BadRequestException("Patient vitals ID cannot be empty.");
            }

            if (_vitalsRepo != null)
            {
                vitals = await _vitalsRepo
                    .Query(v => v.Id == request.PatientVitalsId.Value &&
                                v.ClinicId == _clinicContext.ClinicId &&
                                v.PatientId == screening.PatientId &&
                                !v.IsDeleted)
                    .FirstOrDefaultAsync(cancellationToken)
                    ?? throw new BadRequestException($"Patient vitals '{request.PatientVitalsId.Value}' was not found for this patient in this clinic.");
            }
        }
        else if (_vitalsRepo != null)
        {
            if (screening.PatientVitalsId.HasValue)
            {
                vitals = await _vitalsRepo
                    .Query(v => v.Id == screening.PatientVitalsId.Value &&
                                v.ClinicId == _clinicContext.ClinicId &&
                                v.PatientId == screening.PatientId &&
                                !v.IsDeleted)
                    .FirstOrDefaultAsync(cancellationToken);
            }

            vitals ??= await _vitalsRepo
                .Query(v => v.QueueItemId == screening.QueueItemId &&
                            v.ClinicId == _clinicContext.ClinicId &&
                            v.PatientId == screening.PatientId &&
                            !v.IsDeleted)
                .OrderByDescending(v => v.RecordedAt)
                .FirstOrDefaultAsync(cancellationToken);
        }

        if (vitals == null)
        {
            throw new BadRequestException("Station 1 Vitals must be recorded before completing a health screening.");
        }
        screening.PatientVitalsId = vitals.Id;

        // Resolve Physical Exam and enforce requirement for Physician-signed / formal PE screenings
        PatientPhysicalExam? physicalExam = null;
        if (request.PatientPhysicalExamId.HasValue)
        {
            if (request.PatientPhysicalExamId.Value == Guid.Empty)
            {
                throw new BadRequestException("Physical exam ID cannot be empty.");
            }

            if (_physicalExamRepo != null)
            {
                physicalExam = await _physicalExamRepo
                    .Query(pe => pe.Id == request.PatientPhysicalExamId.Value &&
                                 pe.ClinicId == _clinicContext.ClinicId &&
                                 pe.PatientId == screening.PatientId &&
                                 !pe.IsDeleted)
                    .FirstOrDefaultAsync(cancellationToken)
                    ?? throw new BadRequestException($"Physical exam '{request.PatientPhysicalExamId.Value}' was not found for this patient in this clinic.");
            }
        }
        else if (_physicalExamRepo != null)
        {
            if (screening.PatientPhysicalExamId.HasValue)
            {
                physicalExam = await _physicalExamRepo
                    .Query(pe => pe.Id == screening.PatientPhysicalExamId.Value &&
                                 pe.ClinicId == _clinicContext.ClinicId &&
                                 pe.PatientId == screening.PatientId &&
                                 !pe.IsDeleted)
                    .FirstOrDefaultAsync(cancellationToken);
            }

            physicalExam ??= await _physicalExamRepo
                .Query(pe => pe.PatientId == screening.PatientId &&
                             pe.ClinicId == _clinicContext.ClinicId &&
                             !pe.IsDeleted)
                .OrderByDescending(pe => pe.ExamDate)
                .ThenByDescending(pe => pe.CreatedAt)
                .FirstOrDefaultAsync(cancellationToken);
        }

        bool requiresPhysicalExam =
            screening.ScreeningType is HealthScreeningType.AnnualPhysicalExam or HealthScreeningType.PreEmployment or HealthScreeningType.SchoolPhysical ||
            (isYakap && isPhysician);

        if (requiresPhysicalExam && physicalExam == null)
        {
            throw new BadRequestException("A 9-System Physical Examination must be recorded before Physician sign-off.");
        }

        if (physicalExam != null)
        {
            screening.PatientPhysicalExamId = physicalExam.Id;
        }

        if (request.NcdRiskAssessmentId.HasValue)
        {
            if (request.NcdRiskAssessmentId.Value == Guid.Empty)
            {
                throw new BadRequestException("NCD risk assessment ID cannot be empty.");
            }

            if (_ncdRepo != null)
            {
                bool ncdExists = await _ncdRepo
                    .Query(n => n.Id == request.NcdRiskAssessmentId.Value &&
                                n.ClinicId == _clinicContext.ClinicId &&
                                n.PatientId == screening.PatientId &&
                                !n.IsDeleted)
                    .AnyAsync(cancellationToken);
                if (!ncdExists)
                {
                    throw new BadRequestException($"NCD risk assessment '{request.NcdRiskAssessmentId.Value}' was not found for this patient in this clinic.");
                }
            }

            screening.NcdRiskAssessmentId = request.NcdRiskAssessmentId.Value;
        }
        else if (!screening.NcdRiskAssessmentId.HasValue && _ncdRepo != null)
        {
            screening.NcdRiskAssessmentId = await _ncdRepo
                .Query(n => n.PatientId == screening.PatientId && n.ClinicId == _clinicContext.ClinicId && !n.IsDeleted)
                .OrderByDescending(n => n.AssessmentDate)
                .ThenByDescending(n => n.CreatedAt)
                .Select(n => (Guid?)n.Id)
                .FirstOrDefaultAsync(cancellationToken);
        }

        if (request.ServiceItemId.HasValue && request.ServiceItemId.Value != Guid.Empty && _serviceItemRepo != null)
        {
            var explicitSvc = await HealthScreeningHelper.ResolveScreeningServiceItemAsync(
                request.ServiceItemId,
                screening.WorkflowMode,
                settings,
                _serviceItemRepo,
                _clinicContext.ClinicId,
                cancellationToken);
            if (explicitSvc == null)
            {
                throw new BadRequestException($"Service item '{request.ServiceItemId.Value}' is invalid or inactive for this clinic.");
            }
            screening.ServiceItemId = explicitSvc.Id;
        }
        else if (screening.WorkflowMode == VisitWorkflowMode.Regular && !screening.ServiceItemId.HasValue)
        {
            var defaultSvc = await HealthScreeningHelper.ResolveScreeningServiceItemAsync(
                null,
                screening.WorkflowMode,
                settings,
                _serviceItemRepo,
                _clinicContext.ClinicId,
                cancellationToken);
            screening.ServiceItemId = defaultSvc?.Id;
        }

        var nowUtc = DateTime.UtcNow;
        var tz = ClinicTimeZoneResolver.ResolveTimeZone(settings?.TimeZoneId);
        var localNow = TimeZoneInfo.ConvertTimeFromUtc(nowUtc, tz);
        var todayLocal = DateOnly.FromDateTime(localNow);
        var actor = _clinicContext.StaffId?.ToString() ?? _clinicContext.StaffName ?? "ClinicStaff";

        var facilitatorDisplayName = !string.IsNullOrWhiteSpace(request.FacilitatorName)
            ? request.FacilitatorName.Trim()
            : (!string.IsNullOrWhiteSpace(_clinicContext.StaffName)
                ? _clinicContext.StaffName.Trim()
                : (callerStaff != null ? $"{callerStaff.FirstName} {callerStaff.LastName}".Trim() : (isPhysician ? "Attending Physician" : "Clinic Nurse")));

        var effectiveAtc = !string.IsNullOrWhiteSpace(request.PhilHealthAtc)
            ? request.PhilHealthAtc.Trim()
            : screening.PhilHealthAtc;
        var effectiveWalkIn = request.IsWalkedIn ?? screening.IsWalkedIn;
        var effectiveDeliveryMethod = request.ServiceDeliveryMethod ?? screening.ServiceDeliveryMethod;
        var effectiveFpeClass = !string.IsNullOrWhiteSpace(request.FpeClassificationType)
            ? request.FpeClassificationType.Trim()
            : screening.FpeClassificationType;

        if (isYakap)
        {
            var membership = _membershipRepo != null
                ? await _membershipRepo.Query(m => m.PatientId == patient.Id && m.ClinicId == _clinicContext.ClinicId)
                    .AsNoTracking()
                    .FirstOrDefaultAsync(cancellationToken)
                : null;

            var resolvedPin = HealthScreeningHelper.ResolvePatientPin(patient, membership);
            if (string.IsNullOrWhiteSpace(resolvedPin) || !PhilHealthPinNormalizer.IsValidPin(resolvedPin))
            {
                throw new BadRequestException("A valid 12-digit PhilHealth PIN is required before completing a PhilHealth YAKAP FPE.");
            }

            if (string.IsNullOrWhiteSpace(effectiveAtc) && !effectiveWalkIn)
            {
                throw new BadRequestException("Enter a PhilHealth Visit Code or mark the visit as Walk-In.");
            }

            if (_enlistmentRepo == null)
            {
                throw new InvalidOperationException("Yakap enlistment repository is required for YAKAP FPE completion.");
            }

            var enlistments = await _enlistmentRepo
                .Query(e => e.PatientId == patient.Id && e.ClinicId == _clinicContext.ClinicId)
                .OrderByDescending(e => e.EffectiveYear)
                .ToListAsync(cancellationToken);

            patient.SetYakapEnlistments(enlistments);

            PatientYakapEnlistment activeEnlistment;
            try
            {
                activeEnlistment = patient.ResolveActiveEnlistmentOrThrow(todayLocal, todayLocal.Year);
            }
            catch (InvalidOperationException ex)
            {
                throw new BadRequestException($"Check PhilHealth eligibility and assign this patient to the clinic first. ({ex.Message})");
            }

            if (string.IsNullOrWhiteSpace(activeEnlistment.ProfilingTransNo))
            {
                if (_sequenceGenerator == null)
                {
                    throw new InvalidOperationException("PhilHealth sequence generator is required to assign ProfilingTransNo.");
                }

                var journeyNumbers = await _sequenceGenerator.AssignPatientJourneyNumbersAsync(
                    patient.TenantId ?? _clinicContext.TenantId,
                    _clinicContext.ClinicId,
                    patient.Id,
                    encounterId: null,
                    accreditationNumber: settings?.AccreditationNumber ?? string.Empty,
                    effectiveYear: activeEnlistment.EffectiveYear.ToString(),
                    referenceDate: todayLocal.ToDateTime(TimeOnly.MinValue),
                    ct: cancellationToken);

                if (string.IsNullOrWhiteSpace(activeEnlistment.CaseNo))
                    activeEnlistment.CaseNo = journeyNumbers.CaseNumber;
                activeEnlistment.ProfilingTransNo = journeyNumbers.ProfilingTransactionNumber;
            }

            bool hasPriorYearFpe = enlistments.Any(e =>
                !e.IsDeleted &&
                e.EffectiveYear < activeEnlistment.EffectiveYear &&
                !string.IsNullOrWhiteSpace(e.ProfilingTransNo));

            var resolvedFacilitatorType = isPhysician ? "P" : "H";
            var resolvedFpeClass = !string.IsNullOrWhiteSpace(effectiveFpeClass)
                ? effectiveFpeClass
                : (hasPriorYearFpe ? "2" : "1");
            var resolvedProfilingAtc = !string.IsNullOrWhiteSpace(effectiveAtc)
                ? effectiveAtc
                : (effectiveWalkIn ? "WALKED-IN" : null);

            activeEnlistment.ProfilingDate = todayLocal;
            activeEnlistment.ProfilingTime = TimeOnly.FromDateTime(localNow);
            activeEnlistment.ProfilingAtc = resolvedProfilingAtc;
            activeEnlistment.IsWalkedIn = effectiveWalkIn;
            activeEnlistment.ServiceDeliveryMethod = HealthScreeningHelper.MapDeliveryMethodCode(effectiveDeliveryMethod);
            activeEnlistment.FpeClassificationType = resolvedFpeClass;
            activeEnlistment.FacilitatorType = resolvedFacilitatorType;
            activeEnlistment.FacilitatorName = facilitatorDisplayName;

            if (request.HasCoPayment.HasValue)
            {
                activeEnlistment.HasCoPayment = request.HasCoPayment.Value;
                activeEnlistment.CoPaymentDate = request.CoPaymentDate;
                activeEnlistment.CoPaymentAmount = request.CoPaymentAmount;
                activeEnlistment.CoPaymentBalance = request.CoPaymentBalance;
            }

            activeEnlistment.UpdatedAt = nowUtc;
            activeEnlistment.UpdatedBy = actor;
            _enlistmentRepo.Update(activeEnlistment);

            screening.YakapEnlistmentId = activeEnlistment.Id;
            screening.ProfilingTransNo = activeEnlistment.ProfilingTransNo;
            screening.FpeClassificationType = resolvedFpeClass;
            screening.PhilHealthAtc = resolvedProfilingAtc;
            screening.IsWalkedIn = effectiveWalkIn;
            screening.ServiceDeliveryMethod = effectiveDeliveryMethod;
        }
        else
        {
            if (effectiveAtc != null) screening.PhilHealthAtc = effectiveAtc;
            if (request.IsWalkedIn.HasValue) screening.IsWalkedIn = request.IsWalkedIn.Value;
            if (request.ServiceDeliveryMethod.HasValue) screening.ServiceDeliveryMethod = request.ServiceDeliveryMethod.Value;
            if (effectiveFpeClass != null) screening.FpeClassificationType = effectiveFpeClass;
        }

        if (request.ClinicalImpression != null) screening.ClinicalImpression = NullIfWhiteSpace(request.ClinicalImpression);
        if (request.PreventiveCounselingNotes != null) screening.PreventiveCounselingNotes = NullIfWhiteSpace(request.PreventiveCounselingNotes);
        if (request.RecommendedFollowUpDate.HasValue) screening.RecommendedFollowUpDate = request.RecommendedFollowUpDate;

        if (request.AdultsRoutineScreeningCode != null) screening.AdultsRoutineScreeningCode = NullIfWhiteSpace(request.AdultsRoutineScreeningCode);
        if (request.PediatricRoutineScreeningCode != null) screening.PediatricRoutineScreeningCode = NullIfWhiteSpace(request.PediatricRoutineScreeningCode);
        if (request.PrenatalScreeningServicesCode != null) screening.PrenatalScreeningServicesCode = NullIfWhiteSpace(request.PrenatalScreeningServicesCode);
        if (request.BreastCancerScreeningCode != null) screening.BreastCancerScreeningCode = NullIfWhiteSpace(request.BreastCancerScreeningCode);
        if (request.CervicalCancerScreeningCode != null) screening.CervicalCancerScreeningCode = NullIfWhiteSpace(request.CervicalCancerScreeningCode);
        if (request.ColorectalCancerScreeningCode != null) screening.ColorectalCancerScreeningCode = NullIfWhiteSpace(request.ColorectalCancerScreeningCode);
        if (request.ProstateCancerScreeningCode != null) screening.ProstateCancerScreeningCode = NullIfWhiteSpace(request.ProstateCancerScreeningCode);

        screening.Status = HealthScreeningStatus.Completed;
        screening.Disposition = request.Disposition;
        screening.CompletedAtUtc = nowUtc;
        screening.UpdatedAt = nowUtc;
        screening.UpdatedBy = actor;

        if (isPhysician)
        {
            screening.ExaminedByDoctorId = _clinicContext.StaffId ?? screening.ExaminedByDoctorId;
            screening.ExaminedByDoctorName = facilitatorDisplayName;
            queueItem.Status = QueueStatus.Completed;
            queueItem.CompletedTime = nowUtc;
            queueItem.DoctorId ??= _clinicContext.StaffId;
            queueItem.DoctorName ??= facilitatorDisplayName;
        }
        else
        {
            screening.ScreenedByNurseId ??= _clinicContext.StaffId;
            screening.ScreenedByNurseName ??= facilitatorDisplayName;
            screening.NurseCompletedAtUtc ??= nowUtc;
            queueItem.Status = QueueStatus.DischargedNonDoctor;
            queueItem.DischargedAt = nowUtc;
            queueItem.DischargedByStaffId = _clinicContext.StaffId;
            queueItem.CompletedTime = nowUtc;
        }

        var dischargeNotes = !string.IsNullOrWhiteSpace(screening.ClinicalImpression)
            ? screening.ClinicalImpression
            : $"Health Screening Completed ({request.Disposition})";
        queueItem.DischargeNotes = dischargeNotes.Length <= 1000
            ? dischargeNotes
            : dischargeNotes[..1000];
        queueItem.UpdatedAt = nowUtc;
        queueItem.UpdatedBy = actor;

        _screeningRepo.Update(screening);
        _queueRepo.Update(queueItem);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // Auto-submit YAKAP 2.0 Annex A FPE & Service 03 Empanelment (never fails local clinical sign-off)
        if (isYakap && _yakapDispatcher != null)
        {
            try
            {
                await _yakapDispatcher.DispatchFpeSubmissionAsync(screening.Id, cancellationToken);
                var refreshed = await _screeningRepo.Query(hs => hs.Id == screening.Id).AsNoTracking().FirstOrDefaultAsync(cancellationToken);
                if (refreshed != null) screening = refreshed;
            }
            catch
            {
                // Graceful non-blocking: clinical sign-off stays committed even if submission fails.
            }
        }

        var detailQuery = new GetHealthScreeningByIdQueryHandler(
            _screeningRepo,
            _patientRepo,
            _clinicContext,
            _queueRepo,
            _serviceItemRepo,
            _vitalsRepo,
            _physicalExamRepo,
            _ncdRepo,
            _labOrderRepo,
            _membershipRepo,
            _enlistmentRepo,
            _settingsRepo,
            _workspaceProfiles,
            _verificationRepo,
            _submissionRepo);

        return await detailQuery.BuildDetailAsync(screening, cancellationToken);
    }

    private static string? NullIfWhiteSpace(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
