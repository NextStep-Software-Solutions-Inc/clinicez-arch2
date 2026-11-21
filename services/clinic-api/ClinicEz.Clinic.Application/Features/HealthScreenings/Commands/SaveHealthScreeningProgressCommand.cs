using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.HealthScreenings.Common;
using ClinicEz.Clinic.Application.Features.HealthScreenings.DTOs;
using ClinicEz.Clinic.Application.Features.HealthScreenings.Queries;
using ClinicEz.Clinic.Application.Features.Queue.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Workspace;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.HealthScreenings.Commands;

public sealed record SaveHealthScreeningProgressCommand(
    Guid? Id,
    Guid PatientId,
    Guid? QueueItemId = null,
    HealthScreeningType ScreeningType = HealthScreeningType.RoutineWellness,
    VisitWorkflowMode WorkflowMode = VisitWorkflowMode.Regular,
    Guid? ServiceItemId = null,
    Guid? PatientVitalsId = null,
    Guid? PatientPhysicalExamId = null,
    Guid? NcdRiskAssessmentId = null,
    string? NurseScreeningNotes = null,
    string? ClinicalImpression = null,
    string? PreventiveCounselingNotes = null,
    DateOnly? RecommendedFollowUpDate = null,
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
    bool SendToDoctor = false,
    bool ForceSeparateVisit = false) : IRequest<HealthScreeningDetailDto>;

public sealed class SaveHealthScreeningProgressCommandValidator : AbstractValidator<SaveHealthScreeningProgressCommand>
{
    public SaveHealthScreeningProgressCommandValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty().WithMessage("Patient ID is required.");
        RuleFor(x => x.ScreeningType).IsInEnum();
        RuleFor(x => x.WorkflowMode).IsInEnum();
        RuleFor(x => x.ServiceDeliveryMethod).IsInEnum();
        RuleFor(x => x.NurseScreeningNotes).MaximumLength(2000);
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
    }
}

public sealed class SaveHealthScreeningProgressCommandHandler
    : IRequestHandler<SaveHealthScreeningProgressCommand, HealthScreeningDetailDto>
{
    private readonly IRepository<HealthScreening> _screeningRepo;
    private readonly IRepository<Patient> _patientRepo;
    private readonly IRepository<QueueItem> _queueRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly ISender _sender;
    private readonly IRepository<FacilitySettings>? _settingsRepo;
    private readonly IRepository<ServiceItem>? _serviceItemRepo;
    private readonly IRepository<PatientVitals>? _vitalsRepo;
    private readonly IRepository<PatientPhysicalExam>? _physicalExamRepo;
    private readonly IRepository<NcdRiskAssessment>? _ncdRepo;
    private readonly IRepository<LabOrder>? _labOrderRepo;
    private readonly IRepository<PatientPhilHealthMembership>? _membershipRepo;
    private readonly IRepository<PatientYakapEnlistment>? _enlistmentRepo;
    private readonly IWorkspaceProfileProvider? _workspaceProfiles;
    private readonly IRepository<StaffMember>? _staffRepo;
    private readonly IRepository<PatientIdentityVerification>? _verificationRepo;
    private readonly IRepository<YakapSubmission>? _submissionRepo;

    public SaveHealthScreeningProgressCommandHandler(
        IRepository<HealthScreening> screeningRepo,
        IRepository<Patient> patientRepo,
        IRepository<QueueItem> queueRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        ISender sender,
        IRepository<FacilitySettings>? settingsRepo = null,
        IRepository<ServiceItem>? serviceItemRepo = null,
        IRepository<PatientVitals>? vitalsRepo = null,
        IRepository<PatientPhysicalExam>? physicalExamRepo = null,
        IRepository<NcdRiskAssessment>? ncdRepo = null,
        IRepository<LabOrder>? labOrderRepo = null,
        IRepository<PatientPhilHealthMembership>? membershipRepo = null,
        IRepository<PatientYakapEnlistment>? enlistmentRepo = null,
        IWorkspaceProfileProvider? workspaceProfiles = null,
        IRepository<StaffMember>? staffRepo = null,
        IRepository<PatientIdentityVerification>? verificationRepo = null,
        IRepository<YakapSubmission>? submissionRepo = null)
    {
        _screeningRepo = screeningRepo;
        _patientRepo = patientRepo;
        _queueRepo = queueRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _sender = sender;
        _settingsRepo = settingsRepo;
        _serviceItemRepo = serviceItemRepo;
        _vitalsRepo = vitalsRepo;
        _physicalExamRepo = physicalExamRepo;
        _ncdRepo = ncdRepo;
        _labOrderRepo = labOrderRepo;
        _membershipRepo = membershipRepo;
        _enlistmentRepo = enlistmentRepo;
        _workspaceProfiles = workspaceProfiles;
        _staffRepo = staffRepo;
        _verificationRepo = verificationRepo;
        _submissionRepo = submissionRepo;
    }

    public async Task<HealthScreeningDetailDto> Handle(
        SaveHealthScreeningProgressCommand request,
        CancellationToken cancellationToken)
    {
        StaffMember? callerStaff = null;
        if (_staffRepo != null && _clinicContext.StaffId.HasValue)
        {
            callerStaff = await _staffRepo
                .Query(s => s.Id == _clinicContext.StaffId.Value && s.ClinicId == _clinicContext.ClinicId)
                .Include(s => s.ClinicRole)
                .AsNoTracking()
                .FirstOrDefaultAsync(cancellationToken);
        }

        if (!HealthScreeningHelper.IsCallerPhysician(_clinicContext, callerStaff) &&
            !HealthScreeningHelper.IsCallerAuthorizedClinicalNurseOrMidwife(_clinicContext, callerStaff))
        {
            throw new ForbiddenException(
                "Only an attending Physician or authorized clinical Nurse/Midwife can record or update health screening progress.");
        }

        var patient = await _patientRepo
            .Query(p => p.Id == request.PatientId && p.ClinicId == _clinicContext.ClinicId)
            .AsNoTracking()
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found in this clinic.");

        var now = DateTime.UtcNow;
        var actor = _clinicContext.StaffId?.ToString() ?? _clinicContext.StaffName ?? "ClinicStaff";
        var screeningLabel = HealthScreeningHelper.ResolveScreeningTypeLabel(request.ScreeningType);

        HealthScreening? screening = null;
        if (request.Id.HasValue && request.Id.Value != Guid.Empty)
        {
            screening = await _screeningRepo
                .Query(hs => hs.Id == request.Id.Value && hs.ClinicId == _clinicContext.ClinicId && !hs.IsDeleted)
                .FirstOrDefaultAsync(cancellationToken)
                ?? throw new NotFoundException($"Health screening '{request.Id.Value}' was not found in this clinic.");

            if (screening.PatientId != request.PatientId)
            {
                throw new BadRequestException("Health screening does not belong to the specified patient.");
            }
        }

        Guid queueItemId;
        if (request.QueueItemId.HasValue && request.QueueItemId.Value != Guid.Empty)
        {
            queueItemId = request.QueueItemId.Value;
        }
        else if (screening != null)
        {
            queueItemId = screening.QueueItemId;
        }
        else
        {
            var patientFullName = $"{patient.FirstName} {patient.LastName}".Trim();
            var directVisit = await _sender.Send(new EnsureDirectVisitCommand(
                PatientId: patient.Id,
                PatientName: patientFullName,
                VisitType: VisitType.PreventiveHealthAssessment,
                VisitWorkflowMode: request.WorkflowMode,
                InitialStatus: QueueStatus.Triaged,
                ChiefComplaint: screeningLabel,
                AllowDuplicateActive: request.ForceSeparateVisit), cancellationToken);
            queueItemId = directVisit.Id;
        }

        var queueItem = await _queueRepo
            .Query(q => q.Id == queueItemId && q.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException($"Queue visit '{queueItemId}' was not found in this clinic.");

        if (queueItem.PatientId != patient.Id)
        {
            throw new BadRequestException($"Queue visit '{queueItem.Id}' does not belong to patient '{patient.Id}'.");
        }

        if (queueItem.Status is QueueStatus.Cancelled or QueueStatus.NoShow or QueueStatus.Diverted)
        {
            throw new BadRequestException($"Cannot save health screening on a {queueItem.Status} queue visit.");
        }

        bool queueModified = false;
        if (queueItem.VisitWorkflowMode != request.WorkflowMode &&
            (queueItem.VisitType == VisitType.PreventiveHealthAssessment || request.WorkflowMode == VisitWorkflowMode.YakapAvailment))
        {
            queueItem.VisitWorkflowMode = request.WorkflowMode;
            queueModified = true;
        }

        if (string.IsNullOrWhiteSpace(queueItem.ChiefComplaint))
        {
            queueItem.ChiefComplaint = screeningLabel;
            queueModified = true;
        }

        if (screening == null)
        {
            screening = await _screeningRepo
                .Query(hs => hs.QueueItemId == queueItem.Id &&
                             hs.ClinicId == _clinicContext.ClinicId &&
                             !hs.IsDeleted &&
                             hs.Status != HealthScreeningStatus.Cancelled)
                .OrderByDescending(hs => hs.CreatedAt)
                .FirstOrDefaultAsync(cancellationToken);

            if (screening != null && screening.PatientId != patient.Id)
            {
                throw new BadRequestException($"Health screening '{screening.Id}' does not belong to patient '{patient.Id}'.");
            }
        }

        if (screening != null && screening.Status is HealthScreeningStatus.Completed or HealthScreeningStatus.Cancelled or HealthScreeningStatus.EscalatedToConsultation)
        {
            throw new BadRequestException($"Health screening '{screening.Id}' is already {screening.Status} and cannot be edited.");
        }

        var settings = _settingsRepo != null
            ? await _settingsRepo.Query(s => s.ClinicId == _clinicContext.ClinicId).AsNoTracking().FirstOrDefaultAsync(cancellationToken)
            : null;

        if (request.ServiceItemId.HasValue && request.ServiceItemId.Value != Guid.Empty && _serviceItemRepo != null)
        {
            var explicitSvc = await HealthScreeningHelper.ResolveScreeningServiceItemAsync(
                request.ServiceItemId,
                request.WorkflowMode,
                settings,
                _serviceItemRepo,
                _clinicContext.ClinicId,
                cancellationToken);
            if (explicitSvc == null)
            {
                throw new BadRequestException($"Service item '{request.ServiceItemId.Value}' is invalid or inactive for this clinic.");
            }
        }

        Guid? resolvedServiceItemId = screening?.ServiceItemId;
        if (request.ServiceItemId.HasValue && request.ServiceItemId.Value != Guid.Empty)
        {
            resolvedServiceItemId = request.ServiceItemId.Value;
        }
        else if (request.WorkflowMode == VisitWorkflowMode.YakapAvailment)
        {
            resolvedServiceItemId = null;
        }
        else if (resolvedServiceItemId == null)
        {
            var defaultSvc = await HealthScreeningHelper.ResolveScreeningServiceItemAsync(
                null,
                request.WorkflowMode,
                settings,
                _serviceItemRepo,
                _clinicContext.ClinicId,
                cancellationToken);
            resolvedServiceItemId = defaultSvc?.Id;
        }

        // Validate explicit clinical record references and auto-link latest visit vitals if omitted
        Guid? resolvedVitalsId = screening?.PatientVitalsId;
        if (request.PatientVitalsId.HasValue)
        {
            if (request.PatientVitalsId.Value == Guid.Empty)
            {
                throw new BadRequestException("Patient vitals ID cannot be empty.");
            }

            if (_vitalsRepo != null)
            {
                bool vitalsExists = await _vitalsRepo
                    .Query(v => v.Id == request.PatientVitalsId.Value &&
                                v.ClinicId == _clinicContext.ClinicId &&
                                v.PatientId == patient.Id &&
                                !v.IsDeleted)
                    .AnyAsync(cancellationToken);
                if (!vitalsExists)
                {
                    throw new BadRequestException($"Patient vitals '{request.PatientVitalsId.Value}' was not found for this patient in this clinic.");
                }
            }

            resolvedVitalsId = request.PatientVitalsId.Value;
        }
        else if (!resolvedVitalsId.HasValue && _vitalsRepo != null)
        {
            var visitVitals = await _vitalsRepo
                .Query(v => v.QueueItemId == queueItem.Id &&
                            v.ClinicId == _clinicContext.ClinicId &&
                            v.PatientId == patient.Id &&
                            !v.IsDeleted)
                .OrderByDescending(v => v.RecordedAt)
                .Select(v => (Guid?)v.Id)
                .FirstOrDefaultAsync(cancellationToken);
            resolvedVitalsId = visitVitals;
        }

        Guid? resolvedPeId = screening?.PatientPhysicalExamId;
        if (request.PatientPhysicalExamId.HasValue)
        {
            if (request.PatientPhysicalExamId.Value == Guid.Empty)
            {
                throw new BadRequestException("Physical exam ID cannot be empty.");
            }

            if (_physicalExamRepo != null)
            {
                bool peExists = await _physicalExamRepo
                    .Query(pe => pe.Id == request.PatientPhysicalExamId.Value &&
                                 pe.ClinicId == _clinicContext.ClinicId &&
                                 pe.PatientId == patient.Id &&
                                 !pe.IsDeleted)
                    .AnyAsync(cancellationToken);
                if (!peExists)
                {
                    throw new BadRequestException($"Physical exam '{request.PatientPhysicalExamId.Value}' was not found for this patient in this clinic.");
                }
            }

            resolvedPeId = request.PatientPhysicalExamId.Value;
        }

        Guid? resolvedNcdId = screening?.NcdRiskAssessmentId;
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
                                n.PatientId == patient.Id &&
                                !n.IsDeleted)
                    .AnyAsync(cancellationToken);
                if (!ncdExists)
                {
                    throw new BadRequestException($"NCD risk assessment '{request.NcdRiskAssessmentId.Value}' was not found for this patient in this clinic.");
                }
            }

            resolvedNcdId = request.NcdRiskAssessmentId.Value;
        }

        bool isNew = screening == null;
        if (screening == null)
        {
            screening = new HealthScreening
            {
                Id = Guid.NewGuid(),
                TenantId = patient.TenantId ?? _clinicContext.TenantId,
                ClinicId = _clinicContext.ClinicId,
                PatientId = patient.Id,
                QueueItemId = queueItem.Id,
                ScreeningDateUtc = now,
                Status = HealthScreeningStatus.InProgress,
                IsWalkedIn = false,
                ServiceDeliveryMethod = YakapServiceDeliveryMethod.FacilityBased,
                CreatedAt = now,
                CreatedBy = actor
            };
        }

        screening.ScreeningType = request.ScreeningType;
        screening.WorkflowMode = request.WorkflowMode;
        screening.ServiceItemId = resolvedServiceItemId;
        screening.PatientVitalsId = resolvedVitalsId;
        screening.PatientPhysicalExamId = resolvedPeId;
        screening.NcdRiskAssessmentId = resolvedNcdId;

        if (request.NurseScreeningNotes != null) screening.NurseScreeningNotes = NullIfWhiteSpace(request.NurseScreeningNotes);
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

        if (request.PhilHealthAtc != null) screening.PhilHealthAtc = NullIfWhiteSpace(request.PhilHealthAtc);
        if (request.IsWalkedIn.HasValue) screening.IsWalkedIn = request.IsWalkedIn.Value;
        if (request.ServiceDeliveryMethod.HasValue) screening.ServiceDeliveryMethod = request.ServiceDeliveryMethod.Value;
        if (request.FpeClassificationType != null) screening.FpeClassificationType = NullIfWhiteSpace(request.FpeClassificationType);

        if (request.SendToDoctor)
        {
            if (screening.Status != HealthScreeningStatus.EscalatedToConsultation)
            {
                screening.Status = HealthScreeningStatus.AwaitingDoctor;
            }
            screening.ScreenedByNurseId ??= _clinicContext.StaffId;
            screening.ScreenedByNurseName ??= _clinicContext.StaffName;
            screening.NurseCompletedAtUtc ??= now;

            if (queueItem.Status == QueueStatus.Waiting)
            {
                queueItem.Status = QueueStatus.Triaged;
                queueModified = true;
            }
        }
        else if (_clinicContext.StaffId.HasValue && screening.ScreenedByNurseId == null)
        {
            screening.ScreenedByNurseId = _clinicContext.StaffId;
            screening.ScreenedByNurseName ??= _clinicContext.StaffName;
        }

        screening.UpdatedAt = now;
        screening.UpdatedBy = actor;

        if (isNew)
        {
            await _screeningRepo.AddAsync(screening, cancellationToken);
        }
        else
        {
            _screeningRepo.Update(screening);
        }

        if (queueModified)
        {
            queueItem.UpdatedAt = now;
            queueItem.UpdatedBy = actor;
            _queueRepo.Update(queueItem);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

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
