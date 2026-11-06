using ClinicEz.Patient.Application.Common.DTOs;

namespace ClinicEz.Patient.Application.Common.Interfaces;

public interface IPatientHomeService
{
    Task<PatientHomeDashboardDto> GetHomeDashboardAsync(Guid patientId, CancellationToken ct = default);
    Task<WelcomeChecklistDto> MarkWelcomeStepVisitedAsync(Guid patientId, string stepKey, CancellationToken ct = default);
    Task<VitalSignsEntryDto> LogPatientVitalsAsync(Guid patientId, LogPatientVitalsRequestDto request, CancellationToken ct = default);
    Task<TodayMedicationScheduleDto> GetTodayMedicationScheduleAsync(Guid patientId, CancellationToken ct = default);
    Task<TodayMedicationScheduleItemDto> LogMedicationIntakeAsync(Guid patientId, Guid medicationId, LogMedicationIntakeRequestDto request, CancellationToken ct = default);
    Task<AppointmentCheckInResponseDto> CheckInAppointmentAsync(Guid patientId, Guid appointmentId, CancellationToken ct = default);
}

public interface IPatientCatalogSearchService
{
    Task<PatientSearchResponseDto> SearchAsync(
        Guid patientId,
        string? query,
        string category = "all",
        bool availableTodayOnly = false,
        bool openNowOnly = false,
        int takePerCategory = 20,
        CancellationToken ct = default);
}
