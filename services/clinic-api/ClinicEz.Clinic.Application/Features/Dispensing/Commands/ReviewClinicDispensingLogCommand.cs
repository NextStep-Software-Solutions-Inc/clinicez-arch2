using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Dispensing.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Dispensing.Commands;

public sealed record ReviewClinicDispensingLogCommand(
    Guid Id,
    Guid? DoctorId = null,
    string? DoctorName = null,
    string? ReviewNotes = null,
    bool InterventionFlagged = false) : IRequest<ClinicDispensingLogDto>;

public sealed class ReviewClinicDispensingLogCommandValidator : AbstractValidator<ReviewClinicDispensingLogCommand>
{
    public ReviewClinicDispensingLogCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.ReviewNotes).MaximumLength(1000);
    }
}

public sealed class ReviewClinicDispensingLogCommandHandler : IRequestHandler<ReviewClinicDispensingLogCommand, ClinicDispensingLogDto>
{
    private readonly IRepository<ClinicDispensingLog> _dispensingRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<StaffMember>? _staffRepository;
    private readonly IRepository<QueueItem>? _queueRepository;
    private readonly IRepository<PatientVitals>? _vitalsRepository;

    public ReviewClinicDispensingLogCommandHandler(
        IRepository<ClinicDispensingLog> dispensingRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IRepository<StaffMember>? staffRepository = null,
        IRepository<QueueItem>? queueRepository = null,
        IRepository<PatientVitals>? vitalsRepository = null)
    {
        _dispensingRepository = dispensingRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _staffRepository = staffRepository;
        _queueRepository = queueRepository;
        _vitalsRepository = vitalsRepository;
    }

    public async Task<ClinicDispensingLogDto> Handle(ReviewClinicDispensingLogCommand request, CancellationToken cancellationToken)
    {
        var log = await _dispensingRepository
            .Query(d => d.Id == request.Id && d.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (log == null)
        {
            throw new NotFoundException($"Clinic dispensing log '{request.Id}' was not found in this clinic.");
        }

        var reviewerId = request.DoctorId ?? _clinicContext.StaffId;
        var reviewerName = request.DoctorName?.Trim();

        if (_staffRepository != null && reviewerId.HasValue && reviewerId.Value != Guid.Empty)
        {
            var staff = await _staffRepository
                .Query(s => s.Id == reviewerId.Value && s.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(cancellationToken);

            if (staff != null)
            {
                if (staff.Role != StaffRole.Doctor && staff.Role != StaffRole.Admin)
                {
                    throw new ForbiddenException("Only a physician can review nurse-dispensed OTC items.");
                }

                if (string.IsNullOrWhiteSpace(reviewerName))
                {
                    reviewerName = $"{staff.Title} {staff.FirstName} {staff.LastName}".Trim();
                }
            }
        }

        log.ReviewedByDoctorId = reviewerId;
        log.ReviewedByDoctorName = !string.IsNullOrWhiteSpace(reviewerName) ? reviewerName : "Attending Physician";
        log.ReviewedAt = DateTime.UtcNow;
        log.DoctorReviewNotes = string.IsNullOrWhiteSpace(request.ReviewNotes) ? null : request.ReviewNotes.Trim();
        log.InterventionFlagged = request.InterventionFlagged;
        log.UpdatedAt = DateTime.UtcNow;
        log.UpdatedBy = reviewerId?.ToString() ?? "Doctor";

        _dispensingRepository.Update(log);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        QueueItem? queueItem = null;
        if (_queueRepository != null)
        {
            queueItem = await _queueRepository.GetByIdAsync(log.QueueItemId, cancellationToken);
        }

        PatientVitals? vitals = null;
        if (_vitalsRepository != null)
        {
            vitals = log.PatientVitalsId.HasValue
                ? await _vitalsRepository.GetByIdAsync(log.PatientVitalsId.Value, cancellationToken)
                : await _vitalsRepository.Query(v => v.QueueItemId == log.QueueItemId).FirstOrDefaultAsync(cancellationToken);
        }

        return ClinicDispensingLogMapper.ToDto(log, queueItem, vitals);
    }
}
