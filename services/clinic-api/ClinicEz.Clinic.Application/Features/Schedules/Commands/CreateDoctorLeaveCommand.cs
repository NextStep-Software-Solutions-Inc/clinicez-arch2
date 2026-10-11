using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Schedules.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Schedules.Commands;

public sealed record CreateDoctorLeaveCommand(
    Guid? DoctorId,
    string? DoctorName,
    DateOnly StartDate,
    DateOnly EndDate,
    TimeOnly? PartialDayStartTime = null,
    TimeOnly? PartialDayEndTime = null,
    string? Reason = null,
    string? LeaveType = "Vacation") : IRequest<DoctorLeaveDto>;

public sealed class CreateDoctorLeaveValidator : AbstractValidator<CreateDoctorLeaveCommand>
{
    public CreateDoctorLeaveValidator()
    {
        RuleFor(x => x.EndDate)
            .GreaterThanOrEqualTo(x => x.StartDate)
            .WithMessage("Leave EndDate cannot precede StartDate.");

        RuleFor(x => x)
            .Custom((command, context) =>
            {
                if (command.PartialDayStartTime.HasValue || command.PartialDayEndTime.HasValue)
                {
                    if (!command.PartialDayStartTime.HasValue || !command.PartialDayEndTime.HasValue)
                    {
                        context.AddFailure("PartialDay", "Both PartialDayStartTime and PartialDayEndTime must be provided for partial-day leaves.");
                    }
                    else if (command.PartialDayEndTime.Value <= command.PartialDayStartTime.Value)
                    {
                        context.AddFailure("PartialDayEndTime", "PartialDayEndTime must be later than PartialDayStartTime.");
                    }

                    if (command.StartDate != command.EndDate)
                    {
                        context.AddFailure("StartDate", "Partial-day leaves can only span a single calendar day.");
                    }
                }
            });
    }
}

public sealed class CreateDoctorLeaveCommandHandler
    : IRequestHandler<CreateDoctorLeaveCommand, DoctorLeaveDto>
{
    private readonly IRepository<DoctorLeave> _leaveRepo;
    private readonly IRepository<StaffMember> _staffRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public CreateDoctorLeaveCommandHandler(
        IRepository<DoctorLeave> leaveRepo,
        IRepository<StaffMember> staffRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _leaveRepo = leaveRepo;
        _staffRepo = staffRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<DoctorLeaveDto> Handle(CreateDoctorLeaveCommand request, CancellationToken ct)
    {
        var doctorName = request.DoctorName?.Trim();
        if (string.IsNullOrWhiteSpace(doctorName) && request.DoctorId.HasValue)
        {
            var staff = await _staffRepo.Query()
                .FirstOrDefaultAsync(s => s.ClinicId == _clinicContext.ClinicId && s.Id == request.DoctorId.Value && !s.IsDeleted, ct);
            doctorName = staff != null ? $"{staff.FirstName} {staff.LastName}".Trim() : "Attending Physician";
        }
        else if (string.IsNullOrWhiteSpace(doctorName))
        {
            doctorName = "Clinic-wide Holiday";
        }

        var leave = new DoctorLeave
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            DoctorId = request.DoctorId,
            DoctorName = doctorName,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            PartialDayStartTime = request.PartialDayStartTime,
            PartialDayEndTime = request.PartialDayEndTime,
            Reason = request.Reason?.Trim(),
            Status = "Approved",
            LeaveType = string.IsNullOrWhiteSpace(request.LeaveType) ? "Vacation" : request.LeaveType.Trim(),
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "ClinicStaff"
        };

        await _leaveRepo.AddAsync(leave, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return new DoctorLeaveDto(
            leave.Id,
            leave.DoctorId,
            leave.DoctorName,
            leave.StartDate,
            leave.EndDate,
            leave.PartialDayStartTime,
            leave.PartialDayEndTime,
            leave.Reason,
            leave.Status,
            leave.LeaveType,
            leave.CreatedAt);
    }
}
