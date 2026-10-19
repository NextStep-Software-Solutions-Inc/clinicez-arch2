using System.Text.Json;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Appointments.Commands.RescheduleAppointment;

public sealed record RescheduleAppointmentCommand(
    Guid PatientId,
    Guid AppointmentId,
    DateTime ScheduledAt,
    string? Reason) : IRequest<AppointmentDto>;

public sealed class RescheduleAppointmentCommandHandler
    : IRequestHandler<RescheduleAppointmentCommand, AppointmentDto>
{
    private readonly IAppointmentRepository _appointmentRepository;
    private readonly IBookingDraftRepository _bookingDraftRepository;
    private readonly IClinicRepository _clinicRepository;
    private readonly IPatientRepository _patientRepository;
    private readonly IInteropPublisher _publisher;
    private readonly IUnitOfWork _unitOfWork;

    public RescheduleAppointmentCommandHandler(
        IAppointmentRepository appointmentRepository,
        IBookingDraftRepository bookingDraftRepository,
        IClinicRepository clinicRepository,
        IPatientRepository patientRepository,
        IInteropPublisher publisher,
        IUnitOfWork unitOfWork)
    {
        _appointmentRepository = appointmentRepository;
        _bookingDraftRepository = bookingDraftRepository;
        _clinicRepository = clinicRepository;
        _patientRepository = patientRepository;
        _publisher = publisher;
        _unitOfWork = unitOfWork;
    }

    public async Task<AppointmentDto> Handle(
        RescheduleAppointmentCommand request,
        CancellationToken cancellationToken)
    {
        var patient = await _patientRepository.GetByIdAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

        var scheduledUtc = request.ScheduledAt.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(request.ScheduledAt, DateTimeKind.Utc)
            : request.ScheduledAt.ToUniversalTime();

        var rescheduleNote = !string.IsNullOrWhiteSpace(request.Reason)
            ? $"Reschedule request: {request.Reason.Trim()}"
            : "Reschedule requested by patient";

        var appt = await _appointmentRepository.GetByIdAsync(request.AppointmentId, cancellationToken);
        if (appt is not null)
        {
            if (appt.PatientId != request.PatientId)
                throw new ForbiddenException("This appointment does not belong to the requesting patient.");

            var clinic = await _clinicRepository.GetByIdAsync(appt.ClinicId, cancellationToken);

            var updatedNotes = string.IsNullOrWhiteSpace(appt.Notes)
                ? rescheduleNote
                : $"{appt.Notes}\n\n{rescheduleNote}";

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

            appt.ScheduledAt = scheduledUtc;
            appt.Status = AppointmentStatus.Pending;
            appt.Notes = updatedNotes;
            appt.CachedAt = DateTime.UtcNow;

            if (clinicDto is not null)
            {
                clinicDto = clinicDto with
                {
                    ScheduledAt = scheduledUtc.ToString("O"),
                    Status = AppointmentStatus.Pending.ToString(),
                    Notes = updatedNotes
                };
                appt.RawJson = JsonSerializer.Serialize(clinicDto);
            }

            _appointmentRepository.Update(appt);

            if (clinic is not null && !string.IsNullOrWhiteSpace(clinic.TenantId))
            {
                var draftId = clinicDto?.DraftId is { } d && d != Guid.Empty ? d : appt.Id;
                _publisher.Enqueue(
                    InteropTypes.PatientAppointmentBooked,
                    Party.ForPatient(request.PatientId.ToString()),
                    Party.ForFacility(clinic.TenantId, clinic.Id.ToString(), FacilityType.Clinic),
                    draftId,
                    new AppointmentBookedEvent
                    {
                        DraftId = draftId,
                        RescheduledAppointmentId = appt.Id,
                        PatientId = request.PatientId,
                        ClinicId = clinic.Id,
                        TenantId = clinic.TenantId,
                        PreferredDate = DateOnly.FromDateTime(scheduledUtc),
                        PreferredTime = scheduledUtc.ToString("HH:mm"),
                        Reason = appt.Subject ?? clinicDto?.Subject ?? "Consultation",
                        Notes = updatedNotes,
                        CreatedAt = DateTime.UtcNow,
                        PatientFirstName = patient.FirstName,
                        PatientMiddleName = patient.MiddleName,
                        PatientLastName = patient.LastName,
                        PatientSuffix = patient.Suffix,
                        ContactNumber = patient.Mobile
                    });
            }

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
            ? rescheduleNote
            : $"{draft.Notes}\n\n{rescheduleNote}";

        draft.PreferredDate = DateOnly.FromDateTime(scheduledUtc);
        draft.PreferredTime = scheduledUtc.ToString("HH:mm");
        draft.Notes = updatedDraftNotes;
        _bookingDraftRepository.Update(draft);

        if (draft.Status == BookingDraftStatus.Ready && draftClinic is not null && !string.IsNullOrWhiteSpace(draftClinic.TenantId))
        {
            _publisher.Enqueue(
                InteropTypes.PatientAppointmentBooked,
                Party.ForPatient(request.PatientId.ToString()),
                Party.ForFacility(draftClinic.TenantId, draftClinic.Id.ToString(), FacilityType.Clinic),
                draft.Id,
                new AppointmentBookedEvent
                {
                    DraftId = draft.Id,
                    RescheduledAppointmentId = draft.Id,
                    PatientId = request.PatientId,
                    ClinicId = draftClinic.Id,
                    TenantId = draftClinic.TenantId,
                    PreferredDate = draft.PreferredDate,
                    PreferredTime = draft.PreferredTime,
                    Reason = draft.Reason ?? "Consultation",
                    Notes = updatedDraftNotes,
                    ShareFieldsJson = draft.ShareFieldsJson,
                    AttachedFileIdsJson = draft.AttachedFileIdsJson,
                    CreatedAt = DateTime.UtcNow,
                    PatientFirstName = patient.FirstName,
                    PatientMiddleName = patient.MiddleName,
                    PatientLastName = patient.LastName,
                    PatientSuffix = patient.Suffix,
                    ContactNumber = patient.Mobile
                });
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new AppointmentDto(
            draft.Id,
            draft.ClinicId,
            draftClinic?.Name ?? "Clinic",
            new AppointmentProviderSnapshot(Guid.Empty, "To be assigned", null, null),
            draft.Reason ?? "Consultation",
            scheduledUtc.ToString("O"),
            30,
            AppointmentStatus.Pending.ToString(),
            updatedDraftNotes,
            draft.Reason,
            null);
    }
}
