using System;
using System.Collections.Generic;
using System.Linq;
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

public sealed record UpsertDoctorScheduleTemplateCommand(
    Guid DoctorId,
    string? DoctorName,
    DayOfWeek DayOfWeek,
    TimeOnly StartTime,
    TimeOnly EndTime,
    bool IsOvernightShift = false,
    int SlotDurationMinutes = 30,
    int MaxPatientsPerSlot = 1,
    bool IsActive = true,
    DateOnly? EffectiveStartDate = null,
    DateOnly? EffectiveEndDate = null,
    List<DoctorBreakTimeDto>? Breaks = null) : IRequest<DoctorScheduleTemplateDto>;

public sealed class UpsertDoctorScheduleTemplateValidator : AbstractValidator<UpsertDoctorScheduleTemplateCommand>
{
    private static readonly int[] AllowedIntervals = { 10, 15, 20, 30, 45, 60 };

    public UpsertDoctorScheduleTemplateValidator()
    {
        RuleFor(x => x.DoctorId)
            .NotEmpty().WithMessage("Doctor ID is required.");

        RuleFor(x => x.SlotDurationMinutes)
            .Must(interval => AllowedIntervals.Contains(interval))
            .WithMessage("SlotDurationMinutes must be one of: 10, 15, 20, 30, 45, 60.");

        RuleFor(x => x)
            .Must(x => x.StartTime != x.EndTime)
            .WithMessage("Shift start time and end time cannot be identical.");

        RuleFor(x => x)
            .Must(x => x.IsOvernightShift || x.EndTime > x.StartTime)
            .WithMessage("For non-overnight shifts, EndTime must be later than StartTime.");

        RuleFor(x => x)
            .Custom((command, context) =>
            {
                if (command.Breaks == null || command.Breaks.Count == 0) return;

                var interval = command.SlotDurationMinutes > 0 ? command.SlotDurationMinutes : 30;

                for (int i = 0; i < command.Breaks.Count; i++)
                {
                    var brk = command.Breaks[i];

                    if (brk.EndTime <= brk.StartTime)
                    {
                        context.AddFailure($"Breaks[{i}]", "Break EndTime must be later than StartTime.");
                    }

                    // Grid alignment validation
                    if (brk.StartTime.Minute % interval != 0 || brk.EndTime.Minute % interval != 0)
                    {
                        context.AddFailure($"Breaks[{i}]", $"Break times must align with the {interval}-minute slot grid multiples.");
                    }

                    // Containment validation for normal shifts
                    if (!command.IsOvernightShift)
                    {
                        if (brk.StartTime < command.StartTime || brk.EndTime > command.EndTime)
                        {
                            context.AddFailure($"Breaks[{i}]", "Break must be completely contained within shift hours.");
                        }
                    }

                    // Non-overlapping check
                    for (int j = i + 1; j < command.Breaks.Count; j++)
                    {
                        var other = command.Breaks[j];
                        if (brk.StartTime < other.EndTime && other.StartTime < brk.EndTime)
                        {
                            context.AddFailure($"Breaks[{j}]", $"Break '{other.Description}' overlaps with break '{brk.Description}'.");
                        }
                    }
                }
            });
    }
}

public sealed class UpsertDoctorScheduleTemplateCommandHandler
    : IRequestHandler<UpsertDoctorScheduleTemplateCommand, DoctorScheduleTemplateDto>
{
    private readonly IRepository<DoctorScheduleTemplate> _templateRepo;
    private readonly IRepository<DoctorBreakTime> _breakRepo;
    private readonly IRepository<StaffMember> _staffRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public UpsertDoctorScheduleTemplateCommandHandler(
        IRepository<DoctorScheduleTemplate> templateRepo,
        IRepository<DoctorBreakTime> breakRepo,
        IRepository<StaffMember> staffRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _templateRepo = templateRepo;
        _breakRepo = breakRepo;
        _staffRepo = staffRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<DoctorScheduleTemplateDto> Handle(UpsertDoctorScheduleTemplateCommand request, CancellationToken ct)
    {
        var doctorName = request.DoctorName?.Trim();
        if (string.IsNullOrWhiteSpace(doctorName))
        {
            var staff = await _staffRepo.Query()
                .FirstOrDefaultAsync(s => s.ClinicId == _clinicContext.ClinicId && s.Id == request.DoctorId && !s.IsDeleted, ct);
            doctorName = staff != null ? $"{staff.FirstName} {staff.LastName}".Trim() : "Attending Physician";
        }

        var template = await _templateRepo.Query()
            .Include(t => t.BreakTimes)
            .FirstOrDefaultAsync(t =>
                t.ClinicId == _clinicContext.ClinicId &&
                t.DoctorId == request.DoctorId &&
                t.DayOfWeek == request.DayOfWeek &&
                !t.IsDeleted, ct);

        if (template == null)
        {
            template = new DoctorScheduleTemplate
            {
                Id = Guid.NewGuid(),
                TenantId = _clinicContext.TenantId,
                ClinicId = _clinicContext.ClinicId,
                DoctorId = request.DoctorId,
                DoctorName = doctorName,
                DayOfWeek = request.DayOfWeek,
                StartTime = request.StartTime,
                EndTime = request.EndTime,
                IsOvernightShift = request.IsOvernightShift,
                SlotDurationMinutes = request.SlotDurationMinutes,
                MaxPatientsPerSlot = request.MaxPatientsPerSlot > 0 ? request.MaxPatientsPerSlot : 1,
                IsActive = request.IsActive,
                EffectiveStartDate = request.EffectiveStartDate ?? DateOnly.FromDateTime(DateTime.UtcNow),
                EffectiveEndDate = request.EffectiveEndDate,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "ClinicStaff"
            };

            await _templateRepo.AddAsync(template, ct);
        }
        else
        {
            template.DoctorName = doctorName;
            template.StartTime = request.StartTime;
            template.EndTime = request.EndTime;
            template.IsOvernightShift = request.IsOvernightShift;
            template.SlotDurationMinutes = request.SlotDurationMinutes;
            template.MaxPatientsPerSlot = request.MaxPatientsPerSlot > 0 ? request.MaxPatientsPerSlot : 1;
            template.IsActive = request.IsActive;
            if (request.EffectiveStartDate.HasValue) template.EffectiveStartDate = request.EffectiveStartDate.Value;
            template.EffectiveEndDate = request.EffectiveEndDate;
            template.UpdatedAt = DateTime.UtcNow;
            template.UpdatedBy = "ClinicStaff";

            // Mark old breaks deleted
            foreach (var existingBreak in template.BreakTimes)
            {
                existingBreak.IsDeleted = true;
                existingBreak.DeletedAt = DateTime.UtcNow;
            }
        }

        // Add requested breaks
        if (request.Breaks != null && request.Breaks.Count > 0)
        {
            foreach (var b in request.Breaks)
            {
                var breakEntity = new DoctorBreakTime
                {
                    Id = Guid.NewGuid(),
                    TemplateId = template.Id,
                    Description = string.IsNullOrWhiteSpace(b.Description) ? "Break" : b.Description.Trim(),
                    StartTime = b.StartTime,
                    EndTime = b.EndTime,
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = "ClinicStaff"
                };
                template.BreakTimes.Add(breakEntity);
            }
        }

        await _unitOfWork.SaveChangesAsync(ct);

        var activeBreaks = template.BreakTimes
            .Where(b => !b.IsDeleted)
            .Select(b => new DoctorBreakTimeDto(b.Id, b.Description, b.StartTime, b.EndTime))
            .ToList();

        return new DoctorScheduleTemplateDto(
            template.Id,
            template.DoctorId,
            template.DoctorName,
            template.DayOfWeek,
            template.StartTime,
            template.EndTime,
            template.IsOvernightShift,
            template.SlotDurationMinutes,
            template.MaxPatientsPerSlot,
            template.IsActive,
            template.EffectiveStartDate,
            template.EffectiveEndDate,
            activeBreaks);
    }
}
