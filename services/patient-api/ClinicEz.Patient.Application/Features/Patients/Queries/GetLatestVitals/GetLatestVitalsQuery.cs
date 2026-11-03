using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Patients.Queries.GetLatestVitals;

public sealed record GetLatestVitalsQuery(Guid PatientId) : IRequest<LatestVitalsDto?>;

public sealed class GetLatestVitalsQueryHandler : IRequestHandler<GetLatestVitalsQuery, LatestVitalsDto?>
{
    private readonly IPatientRepository _patientRepository;

    public GetLatestVitalsQueryHandler(IPatientRepository patientRepository)
    {
        _patientRepository = patientRepository;
    }

    public async Task<LatestVitalsDto?> Handle(GetLatestVitalsQuery request, CancellationToken cancellationToken)
    {
        var patient = await _patientRepository.GetByIdAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

        var vitals = await _patientRepository.GetRecentVitalsAsync(request.PatientId, 2, cancellationToken);
        if (vitals.Count == 0)
        {
            return null;
        }

        var latest = vitals[0];
        var previous = vitals.Count > 1 ? vitals[1] : null;

        // Calculate heart rate trend
        string? heartRateTrend = null;
        if (latest.HeartRateBpm.HasValue)
        {
            if (previous?.HeartRateBpm.HasValue == true)
            {
                var diff = latest.HeartRateBpm.Value - previous.HeartRateBpm.Value;
                heartRateTrend = diff > 0 ? $"+{diff} bpm" : (diff < 0 ? $"{diff} bpm" : "0 bpm");
            }
            else
            {
                heartRateTrend = "+0 bpm";
            }
        }

        // Calculate blood pressure category
        string? bpCategory = null;
        if (latest.SystolicBp.HasValue && latest.DiastolicBp.HasValue)
        {
            var sys = latest.SystolicBp.Value;
            var dia = latest.DiastolicBp.Value;

            if (sys < 120 && dia < 80)
            {
                bpCategory = "Optimal";
            }
            else if (sys < 130 && dia < 85)
            {
                bpCategory = "Normal";
            }
            else if (sys < 140 && dia < 90)
            {
                bpCategory = "Normal High";
            }
            else
            {
                bpCategory = "Elevated";
            }
        }

        // Calculate blood glucose category
        string? glucoseCategory = null;
        if (latest.BloodGlucoseMgDl.HasValue)
        {
            var glucose = latest.BloodGlucoseMgDl.Value;
            if (glucose <= 100m)
            {
                glucoseCategory = "Fasting";
            }
            else if (glucose <= 140m)
            {
                glucoseCategory = "Normal";
            }
            else
            {
                glucoseCategory = "Elevated";
            }
        }

        // Format sleep duration and estimated deep sleep (~28% of total sleep)
        string? sleepFormatted = null;
        string? sleepDeepFormatted = null;
        if (latest.SleepHours.HasValue)
        {
            var totalMinutes = (int)Math.Round((double)(latest.SleepHours.Value * 60m));
            var hours = totalMinutes / 60;
            var mins = totalMinutes % 60;
            sleepFormatted = $"{hours}h {mins}m";

            var deepMinutes = (int)Math.Round((double)(latest.SleepHours.Value * 60m * 0.28m));
            var deepHours = deepMinutes / 60;
            var deepMins = deepMinutes % 60;
            sleepDeepFormatted = $"{deepHours}h {deepMins}m";
        }

        return new LatestVitalsDto(
            latest.HeartRateBpm,
            heartRateTrend,
            latest.SystolicBp,
            latest.DiastolicBp,
            bpCategory,
            latest.BloodGlucoseMgDl,
            glucoseCategory,
            latest.SleepHours,
            sleepFormatted,
            sleepDeepFormatted,
            latest.RecordedAt
        );
    }
}
