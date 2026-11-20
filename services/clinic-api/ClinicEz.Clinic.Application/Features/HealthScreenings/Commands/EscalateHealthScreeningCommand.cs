using System;
using System.Threading;
using System.Threading.Tasks;
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

public sealed record EscalateHealthScreeningCommand(
    Guid Id,
    string? Reason = null,
    bool IsUrgent = false,
    Guid? DoctorId = null,
    string? DoctorName = null,
    Guid? RoomId = null,
    string? RoomOrStation = null) : IRequest<HealthScreeningDetailDto>;

public sealed class EscalateHealthScreeningCommandValidator : AbstractValidator<EscalateHealthScreeningCommand>
{
    public EscalateHealthScreeningCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty().WithMessage("Health screening ID is required.");
        RuleFor(x => x.Reason).MaximumLength(1000);
        RuleFor(x => x.DoctorName).MaximumLength(150);
        RuleFor(x => x.RoomOrStation).MaximumLength(100);
    }
}

public sealed class EscalateHealthScreeningCommandHandler
    : IRequestHandler<EscalateHealthScreeningCommand, HealthScreeningDetailDto>
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
    private readonly IWorkspaceProfileProvider? _workspaceProfiles;
    private readonly IRepository<StaffMember>? _staffRepo;

    public EscalateHealthScreeningCommandHandler(
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
        IWorkspaceProfileProvider? workspaceProfiles = null,
        IRepository<StaffMember>? staffRepo = null)
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
        _workspaceProfiles = workspaceProfiles;
        _staffRepo = staffRepo;
    }

    public async Task<HealthScreeningDetailDto> Handle(
        EscalateHealthScreeningCommand request,
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
                "Only an attending Physician or authorized clinical Nurse/Midwife can escalate a health screening to consultation.");
        }

        var screening = await _screeningRepo
            .Query(hs => hs.Id == request.Id && hs.ClinicId == _clinicContext.ClinicId && !hs.IsDeleted)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException($"Health screening '{request.Id}' was not found in this clinic.");

        if (screening.Status is HealthScreeningStatus.Completed or HealthScreeningStatus.Cancelled)
        {
            throw new BadRequestException($"Health screening '{screening.Id}' cannot be escalated from status '{screening.Status}'.");
        }

        var queueItem = await _queueRepo
            .Query(q => q.Id == screening.QueueItemId && q.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException($"Queue visit '{screening.QueueItemId}' was not found in this clinic.");

        if (queueItem.PatientId != screening.PatientId)
        {
            throw new BadRequestException($"Queue visit '{queueItem.Id}' does not belong to patient '{screening.PatientId}'.");
        }

        var now = DateTime.UtcNow;
        var actor = _clinicContext.StaffId?.ToString() ?? _clinicContext.StaffName ?? "ClinicStaff";
        var reason = string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim();

        screening.Status = HealthScreeningStatus.EscalatedToConsultation;
        screening.Disposition = HealthScreeningDisposition.EscalatedToConsultation;
        screening.ScreenedByNurseId ??= _clinicContext.StaffId;
        screening.ScreenedByNurseName ??= _clinicContext.StaffName;
        screening.NurseCompletedAtUtc ??= now;

        if (!string.IsNullOrWhiteSpace(reason))
        {
            var combinedImpression = string.IsNullOrWhiteSpace(screening.ClinicalImpression)
                ? $"Escalated to MD Consultation: {reason}"
                : $"{screening.ClinicalImpression}\nEscalated to MD Consultation: {reason}";
            screening.ClinicalImpression = combinedImpression.Length <= 2000
                ? combinedImpression
                : combinedImpression[..2000];
        }

        screening.UpdatedAt = now;
        screening.UpdatedBy = actor;

        // Transition the SAME QueueItem to a physician consultation visit while preserving QueueItemId and all vitals/history.
        queueItem.VisitType = request.IsUrgent ? VisitType.UrgentCareVisit : VisitType.RoutineCheckup;
        queueItem.Status = QueueStatus.Triaged;
        if (request.IsUrgent)
        {
            queueItem.Priority = QueuePriority.Urgent;
        }
        if (!string.IsNullOrWhiteSpace(reason))
        {
            queueItem.ChiefComplaint = reason.Length <= 255 ? reason : reason[..255];
        }
        if (request.DoctorId.HasValue)
        {
            queueItem.DoctorId = request.DoctorId;
            if (!string.IsNullOrWhiteSpace(request.DoctorName))
                queueItem.DoctorName = request.DoctorName.Trim();
        }
        if (request.RoomId.HasValue)
        {
            queueItem.RoomId = request.RoomId;
            if (!string.IsNullOrWhiteSpace(request.RoomOrStation))
                queueItem.RoomOrStation = request.RoomOrStation.Trim();
        }
        queueItem.UpdatedAt = now;
        queueItem.UpdatedBy = actor;

        _screeningRepo.Update(screening);
        _queueRepo.Update(queueItem);
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
            _workspaceProfiles);

        return await detailQuery.BuildDetailAsync(screening, cancellationToken);
    }
}
