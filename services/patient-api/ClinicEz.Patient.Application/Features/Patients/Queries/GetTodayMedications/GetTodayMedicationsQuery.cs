using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Patients.Queries.GetTodayMedications;

public sealed record GetTodayMedicationsQuery(Guid PatientId, DateOnly? Date = null) : IRequest<IReadOnlyList<TodayMedicationDto>>;

public sealed class GetTodayMedicationsQueryHandler : IRequestHandler<GetTodayMedicationsQuery, IReadOnlyList<TodayMedicationDto>>
{
    private readonly IPatientRepository _patientRepository;

    public GetTodayMedicationsQueryHandler(IPatientRepository patientRepository)
    {
        _patientRepository = patientRepository;
    }

    public async Task<IReadOnlyList<TodayMedicationDto>> Handle(
        GetTodayMedicationsQuery request, CancellationToken cancellationToken)
    {
        var patient = await _patientRepository.GetByIdAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

        var allMedications = await _patientRepository.GetMedicationsAsync(request.PatientId, cancellationToken);
        var activeMedications = allMedications.Where(m => m.IsCurrentlyTaking).ToList();

        var targetDate = request.Date ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var adherences = await _patientRepository.GetMedicationAdherenceForDateAsync(request.PatientId, targetDate, cancellationToken);

        var result = new List<TodayMedicationDto>(activeMedications.Count);

        foreach (var med in activeMedications)
        {
            var adherence = adherences.FirstOrDefault(a => a.PatientMedicationId == med.Id && a.IsTaken);
            var isTaken = adherence != null;
            var takenAt = adherence?.TakenAt;

            // Compute instructions
            var instructions = !string.IsNullOrWhiteSpace(med.Notes)
                ? med.Notes
                : (!string.IsNullOrWhiteSpace(med.Frequency)
                    ? med.Frequency
                    : $"{med.Dosage} {med.Route}".Trim());

            // Deduce scheduled time
            var scheduledTime = DetermineScheduledTime(med.Frequency, med.Notes, adherence?.DoseSlot);

            result.Add(new TodayMedicationDto(
                med.Id,
                med.MedicationName,
                med.Dosage,
                instructions,
                scheduledTime,
                isTaken,
                takenAt
            ));
        }

        return result;
    }

    private static string DetermineScheduledTime(string? frequency, string? notes, string? doseSlot)
    {
        if (!string.IsNullOrWhiteSpace(doseSlot))
        {
            return doseSlot;
        }

        var combined = $"{frequency} {notes}".ToLowerInvariant();

        if (combined.Contains("dinner") || combined.Contains("evening"))
        {
            return "7:00 PM";
        }
        if (combined.Contains("lunch") || combined.Contains("noon") || combined.Contains("midday"))
        {
            return "12:00 PM";
        }
        if (combined.Contains("night") || combined.Contains("bedtime") || combined.Contains("before sleep"))
        {
            return "9:00 PM";
        }
        if (combined.Contains("afternoon"))
        {
            return "2:00 PM";
        }

        return "8:00 AM";
    }
}
