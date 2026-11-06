using FluentValidation;
using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Common.Interfaces;

namespace ClinicEz.Patient.Application.Features.Home;

// ── 1. Home Dashboard Query ──────────────────────────────────────────────────

public sealed record GetPatientHomeDashboardQuery(Guid PatientId) : IRequest<PatientHomeDashboardDto>;

public sealed class GetPatientHomeDashboardQueryHandler(IPatientHomeService homeService)
    : IRequestHandler<GetPatientHomeDashboardQuery, PatientHomeDashboardDto>
{
    public Task<PatientHomeDashboardDto> Handle(GetPatientHomeDashboardQuery request, CancellationToken cancellationToken)
        => homeService.GetHomeDashboardAsync(request.PatientId, cancellationToken);
}

// ── 2. Mark Welcome Step Visited Command ─────────────────────────────────────

public static class WelcomeStepKeys
{
    public const string CompleteProfile = "complete_profile";
    public const string LinkInsurance = "link_insurance";
    public const string FindClinic = "find_clinic";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        CompleteProfile,
        LinkInsurance,
        FindClinic,
    };

    public static string Normalize(string raw) => raw.Trim().ToLowerInvariant();
}

public sealed record MarkWelcomeStepVisitedCommand(Guid PatientId, string StepKey) : IRequest<WelcomeChecklistDto>;

public sealed class MarkWelcomeStepVisitedCommandValidator : AbstractValidator<MarkWelcomeStepVisitedCommand>
{
    public MarkWelcomeStepVisitedCommandValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty();
        RuleFor(x => x.StepKey)
            .NotEmpty()
            .Must(k => WelcomeStepKeys.All.Contains(k.Trim()))
            .WithMessage("StepKey must be one of: complete_profile, link_insurance, find_clinic.");
    }
}

public sealed class MarkWelcomeStepVisitedCommandHandler(IPatientHomeService homeService)
    : IRequestHandler<MarkWelcomeStepVisitedCommand, WelcomeChecklistDto>
{
    public Task<WelcomeChecklistDto> Handle(MarkWelcomeStepVisitedCommand request, CancellationToken cancellationToken)
        => homeService.MarkWelcomeStepVisitedAsync(
            request.PatientId,
            WelcomeStepKeys.Normalize(request.StepKey),
            cancellationToken);
}

// ── 3. Log Patient Vitals Command ────────────────────────────────────────────

public sealed record LogPatientVitalsCommand(Guid PatientId, LogPatientVitalsRequestDto Payload) : IRequest<VitalSignsEntryDto>;

public sealed class LogPatientVitalsCommandValidator : AbstractValidator<LogPatientVitalsCommand>
{
    public LogPatientVitalsCommandValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty();
        RuleFor(x => x.Payload).NotNull();

        When(x => x.Payload is not null, () =>
        {
            RuleFor(x => x.Payload)
                .Must(p =>
                    p.HeartRateBpm.HasValue ||
                    p.SystolicBp.HasValue ||
                    p.DiastolicBp.HasValue ||
                    p.FastingBloodGlucoseMgDl.HasValue ||
                    p.SleepDurationMinutes.HasValue)
                .WithMessage("At least one vital sign measurement must be provided.");

            RuleFor(x => x.Payload.HeartRateBpm)
                .InclusiveBetween(20, 260)
                .When(x => x.Payload.HeartRateBpm.HasValue);

            RuleFor(x => x.Payload.SystolicBp)
                .InclusiveBetween(50, 300)
                .When(x => x.Payload.SystolicBp.HasValue);

            RuleFor(x => x.Payload.DiastolicBp)
                .InclusiveBetween(30, 200)
                .When(x => x.Payload.DiastolicBp.HasValue);

            RuleFor(x => x.Payload)
                .Must(p => p.SystolicBp.HasValue == p.DiastolicBp.HasValue)
                .WithMessage("Both systolic and diastolic blood pressure values must be provided together.");

            RuleFor(x => x.Payload.FastingBloodGlucoseMgDl)
                .InclusiveBetween(20m, 800m)
                .When(x => x.Payload.FastingBloodGlucoseMgDl.HasValue);

            RuleFor(x => x.Payload.SleepDurationMinutes)
                .InclusiveBetween(0, 1440)
                .When(x => x.Payload.SleepDurationMinutes.HasValue);

            RuleFor(x => x.Payload.DeepSleepMinutes)
                .InclusiveBetween(0, 1440)
                .When(x => x.Payload.DeepSleepMinutes.HasValue);
        });
    }
}

public sealed class LogPatientVitalsCommandHandler(IPatientHomeService homeService)
    : IRequestHandler<LogPatientVitalsCommand, VitalSignsEntryDto>
{
    public Task<VitalSignsEntryDto> Handle(LogPatientVitalsCommand request, CancellationToken cancellationToken)
        => homeService.LogPatientVitalsAsync(request.PatientId, request.Payload, cancellationToken);
}

// ── 4. Today's Medication Schedule & Intake Logging ──────────────────────────

public sealed record GetTodayMedicationScheduleQuery(Guid PatientId) : IRequest<TodayMedicationScheduleDto>;

public sealed class GetTodayMedicationScheduleQueryHandler(IPatientHomeService homeService)
    : IRequestHandler<GetTodayMedicationScheduleQuery, TodayMedicationScheduleDto>
{
    public Task<TodayMedicationScheduleDto> Handle(GetTodayMedicationScheduleQuery request, CancellationToken cancellationToken)
        => homeService.GetTodayMedicationScheduleAsync(request.PatientId, cancellationToken);
}

public sealed record LogMedicationIntakeCommand(
    Guid PatientId,
    Guid MedicationId,
    LogMedicationIntakeRequestDto Payload) : IRequest<TodayMedicationScheduleItemDto>;

public sealed class LogMedicationIntakeCommandValidator : AbstractValidator<LogMedicationIntakeCommand>
{
    public LogMedicationIntakeCommandValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty();
        RuleFor(x => x.MedicationId).NotEmpty();
    }
}

public sealed class LogMedicationIntakeCommandHandler(IPatientHomeService homeService)
    : IRequestHandler<LogMedicationIntakeCommand, TodayMedicationScheduleItemDto>
{
    public Task<TodayMedicationScheduleItemDto> Handle(LogMedicationIntakeCommand request, CancellationToken cancellationToken)
        => homeService.LogMedicationIntakeAsync(request.PatientId, request.MedicationId, request.Payload, cancellationToken);
}

// ── 5. Appointment Check-In Command ──────────────────────────────────────────

public sealed record CheckInAppointmentCommand(Guid PatientId, Guid AppointmentId) : IRequest<AppointmentCheckInResponseDto>;

public sealed class CheckInAppointmentCommandValidator : AbstractValidator<CheckInAppointmentCommand>
{
    public CheckInAppointmentCommandValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty();
        RuleFor(x => x.AppointmentId).NotEmpty();
    }
}

public sealed class CheckInAppointmentCommandHandler(IPatientHomeService homeService)
    : IRequestHandler<CheckInAppointmentCommand, AppointmentCheckInResponseDto>
{
    public Task<AppointmentCheckInResponseDto> Handle(CheckInAppointmentCommand request, CancellationToken cancellationToken)
        => homeService.CheckInAppointmentAsync(request.PatientId, request.AppointmentId, cancellationToken);
}

// ── 6. Patient Multi-Entity Catalog Search Query ─────────────────────────────

public sealed record SearchPatientCatalogQuery(
    Guid PatientId,
    string? Query,
    string Category = "all",
    bool AvailableTodayOnly = false,
    bool OpenNowOnly = false,
    int Take = 20) : IRequest<PatientSearchResponseDto>;

public sealed class SearchPatientCatalogQueryValidator : AbstractValidator<SearchPatientCatalogQuery>
{
    private static readonly HashSet<string> ValidCategories = new(StringComparer.OrdinalIgnoreCase)
    {
        "all", "doctors", "clinics", "services"
    };

    public SearchPatientCatalogQueryValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty();
        RuleFor(x => x.Category)
            .Must(c => string.IsNullOrWhiteSpace(c) || ValidCategories.Contains(c.Trim()))
            .WithMessage("Category must be one of: all, doctors, clinics, services.");
        RuleFor(x => x.Take).InclusiveBetween(1, 50);
    }
}

public sealed class SearchPatientCatalogQueryHandler(IPatientCatalogSearchService searchService)
    : IRequestHandler<SearchPatientCatalogQuery, PatientSearchResponseDto>
{
    public Task<PatientSearchResponseDto> Handle(SearchPatientCatalogQuery request, CancellationToken cancellationToken)
        => searchService.SearchAsync(
            request.PatientId,
            request.Query,
            string.IsNullOrWhiteSpace(request.Category) ? "all" : request.Category.Trim().ToLowerInvariant(),
            request.AvailableTodayOnly,
            request.OpenNowOnly,
            request.Take,
            cancellationToken);
}
