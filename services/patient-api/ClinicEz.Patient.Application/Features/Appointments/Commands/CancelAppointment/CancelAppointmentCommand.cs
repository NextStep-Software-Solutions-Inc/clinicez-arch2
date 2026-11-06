using System.Text.Json;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interoperability;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Appointments.Commands.CancelAppointment;

public sealed record CancelAppointmentCommand(
    Guid PatientId,
    Guid AppointmentId,
    string? Reason) : IRequest<AppointmentDto>;

public sealed class CancelAppointmentCommandHandler
    : IRequestHandler<CancelAppointmentCommand, AppointmentDto>
{
    private readonly IAppointmentRepository _appointmentRepository;
    private readonly IBookingDraftRepository _bookingDraftRepository;
    private readonly IClinicRepository _clinicRepository;
    private readonly IPatientRepository _patientRepository;
    private readonly IUnitOfWork _unitOfWork;

    public CancelAppointmentCommandHandler(
        IAppointmentRepository appointmentRepository,
        IBookingDraftRepository bookingDraftRepository,
        IClinicRepository clinicRepository,
        IPatientRepository patientRepository,
        IUnitOfWork unitOfWork)
    {
        _appointmentRepository = appointmentRepository;
        _bookingDraftRepository = bookingDraftRepository;
        _clinicRepository = clinicRepository;
        _patientRepository = patientRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<AppointmentDto> Handle(
        CancelAppointmentCommand request,
        CancellationToken cancellationToken)
    {
        _ = await _patientRepository.GetByIdAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

        var cancelNote = !string.IsNullOrWhiteSpace(request.Reason)
            ? $"Cancellation reason: {request.Reason.Trim()}"
            : "Cancelled by patient";

        var appt = await _appointmentRepository.GetByIdAsync(request.AppointmentId, cancellationToken);
        if (appt is not null)
        {
            if (appt.PatientId != request.PatientId)
                throw new ForbiddenException("This appointment does not belong to the requesting patient.");

            var clinic = await _clinicRepository.GetByIdAsync(appt.ClinicId, cancellationToken);

            var updatedNotes = string.IsNullOrWhiteSpace(appt.Notes)
                ? cancelNote
                : $"{appt.Notes}\n\n{cancelNote}";

            ClinicAppointmentSnapshotDto? clinicDto = null;
            if (!string.IsNullOrWhiteSpace(appt.RawJson))
            {
                try
                {
                    clinicDto = JsonSerializer.Deserialize<ClinicAppointmentSnapshotDto>(
                        appt.RawJson,
                        new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                }
                catch
                {
                    // Ignore malformed rawJson
                }
            }

            appt.Status = AppointmentStatus.Cancelled;
            appt.Notes = updatedNotes;
            appt.CachedAt = DateTime.UtcNow;

            if (clinicDto is not null)
            {
                clinicDto = clinicDto with
                {
                    Status = AppointmentStatus.Cancelled.ToString(),
                    Notes = updatedNotes
                };
                appt.RawJson = JsonSerializer.Serialize(clinicDto);
            }

            _appointmentRepository.Update(appt);
            await _unitOfWork.SaveChangesAsync(cancellationToken);

            var provider = clinic?.HealthcareProviders.FirstOrDefault(p => p.Id == appt.ProviderId);
            return new AppointmentDto(
                appt.Id,
                appt.ClinicId,
                clinic?.Name ?? clinicDto?.ClinicName ?? "Clinic",
                new AppointmentProviderSnapshot(
                    appt.ProviderId,
                    provider?.Name ?? clinicDto?.Provider?.Name ?? "To be assigned",
                    provider?.Specialty ?? clinicDto?.Provider?.Specialty,
                    provider?.AvatarUrl ?? clinicDto?.Provider?.AvatarUrl),
                appt.ServiceType ?? clinicDto?.ServiceType,
                appt.ScheduledAt.ToString("O"),
                appt.DurationMinutes,
                appt.Status.ToString(),
                appt.Notes,
                appt.Subject ?? clinicDto?.Subject,
                appt.ChiefComplaint ?? clinicDto?.ChiefComplaint,
                clinicDto?.ClinicalAssessment,
                clinicDto?.DoctorPlan,
                clinicDto?.PrescriptionsSummary,
                clinicDto?.PrescriptionPublicVerificationUrl);
        }

        var draft = await _bookingDraftRepository.GetByIdAsync(request.AppointmentId, cancellationToken)
            ?? throw new NotFoundException($"Appointment '{request.AppointmentId}' was not found.");

        if (draft.PatientId != request.PatientId)
            throw new ForbiddenException("This booking draft does not belong to the requesting patient.");

        var draftClinic = await _clinicRepository.GetByIdAsync(draft.ClinicId, cancellationToken);
        var updatedDraftNotes = string.IsNullOrWhiteSpace(draft.Notes)
            ? cancelNote
            : $"{draft.Notes}\n\n{cancelNote}";

        _bookingDraftRepository.Delete(draft);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var prefDate = draft.PreferredDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var scheduledUtc = prefDate.ToDateTime(
            TimeOnly.TryParse(draft.PreferredTime, out var pt) ? pt : TimeOnly.MinValue,
            DateTimeKind.Utc);

        return new AppointmentDto(
            draft.Id,
            draft.ClinicId,
            draftClinic?.Name ?? "Clinic",
            new AppointmentProviderSnapshot(Guid.Empty, "To be assigned", null, null),
            draft.Reason ?? "Consultation",
            scheduledUtc.ToString("O"),
            30,
            AppointmentStatus.Cancelled.ToString(),
            updatedDraftNotes,
            draft.Reason,
            null);
    }
}
