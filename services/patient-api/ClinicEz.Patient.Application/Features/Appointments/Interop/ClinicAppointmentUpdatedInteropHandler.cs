using System.Globalization;
using System.Text.Json;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Logging;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Application.Features.Appointments.Interop;

/// <summary>
/// Applies <c>clinic.appointment.updated</c> envelopes from a clinic to the patient's cached appointments.
/// This replaces the former clinic-push webhook: the sender is now the authenticated hub client, and the
/// message is only honoured when that client is the clinic named in the payload, the envelope is
/// addressed to the patient named in the payload, and every appointment it touches belongs to that
/// clinic and patient. Anything else is ignored (and acknowledged) rather than retried.
/// </summary>
public sealed class ClinicAppointmentUpdatedInteropHandler : IInteropHandler<ClinicAppointmentUpdatedEvent>
{
    private readonly IAppointmentRepository _appointmentRepository;
    private readonly IClinicRepository _clinicRepository;
    private readonly IPatientRepository _patientRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<ClinicAppointmentUpdatedInteropHandler> _logger;

    public ClinicAppointmentUpdatedInteropHandler(
        IAppointmentRepository appointmentRepository,
        IClinicRepository clinicRepository,
        IPatientRepository patientRepository,
        IUnitOfWork unitOfWork,
        ILogger<ClinicAppointmentUpdatedInteropHandler> logger)
    {
        _appointmentRepository = appointmentRepository;
        _clinicRepository = clinicRepository;
        _patientRepository = patientRepository;
        _unitOfWork = unitOfWork;
        _logger = logger;
    }

    public async Task HandleAsync(ClinicAppointmentUpdatedEvent payload, InteropMessageContext context, CancellationToken ct)
    {
        if (!IsSentByClinic(context.From, payload))
        {
            _logger.LogWarning(
                "Ignoring clinic.appointment.updated {MessageId}: sender {Sender} is not clinic {ClinicId} of tenant {TenantId}.",
                context.MessageId, context.From.Address, payload.ClinicId, payload.TenantId);
            return;
        }

        if (context.To.Kind != PartyKind.Patient || context.To.PatientId != payload.PatientId.ToString())
        {
            _logger.LogWarning(
                "Ignoring clinic.appointment.updated {MessageId}: addressed to {Recipient}, payload is for patient {PatientId}.",
                context.MessageId, context.To.Address, payload.PatientId);
            return;
        }

        var clinic = await _clinicRepository.GetByIdAsync(payload.ClinicId, ct);
        if (clinic is null || !string.Equals(clinic.TenantId, payload.TenantId, StringComparison.Ordinal))
        {
            _logger.LogWarning(
                "Ignoring clinic.appointment.updated {MessageId}: clinic {ClinicId} is not in the directory under tenant {TenantId}.",
                context.MessageId, payload.ClinicId, payload.TenantId);
            return;
        }

        if (await _patientRepository.GetByIdAsync(payload.PatientId, ct) is null)
        {
            _logger.LogWarning(
                "Ignoring clinic.appointment.updated {MessageId}: patient {PatientId} does not exist.",
                context.MessageId, payload.PatientId);
            return;
        }

        foreach (var dto in payload.Appointments)
        {
            if (!Guid.TryParse(dto.Id, out var id)) continue;

            if (!string.Equals(dto.ClinicId, payload.ClinicId.ToString(), StringComparison.OrdinalIgnoreCase)
                || !DateTime.TryParse(dto.ScheduledAt, CultureInfo.InvariantCulture,
                    DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var scheduledAt))
            {
                _logger.LogWarning(
                    "Skipping appointment {AppointmentId} in {MessageId}: foreign clinic id or unreadable schedule.",
                    dto.Id, context.MessageId);
                continue;
            }

            var providerId = Guid.TryParse(dto.Provider.Id, out var pid) ? pid : Guid.Empty;
            var appt = await _appointmentRepository.GetByIdAsync(id, ct);

            if (appt is null)
            {
                await _appointmentRepository.AddAsync(new Appointment
                {
                    Id = id,
                    PatientId = payload.PatientId,
                    ClinicId = payload.ClinicId,
                    ProviderId = providerId,
                    Subject = dto.Provider.Name,
                    ServiceType = dto.ServiceType,
                    ScheduledAt = scheduledAt,
                    DurationMinutes = dto.DurationMinutes,
                    Status = Enum.TryParse<AppointmentStatus>(dto.Status, true, out var created) ? created : AppointmentStatus.Pending,
                    Notes = dto.Notes,
                    AttachedFileIdsJson = "[]",
                    RawJson = JsonSerializer.Serialize(dto),
                    CachedAt = DateTime.UtcNow
                }, ct);
                continue;
            }

            if (appt.PatientId != payload.PatientId || appt.ClinicId != payload.ClinicId)
            {
                _logger.LogWarning(
                    "Skipping appointment {AppointmentId} in {MessageId}: it does not belong to clinic {ClinicId} and patient {PatientId}.",
                    id, context.MessageId, payload.ClinicId, payload.PatientId);
                continue;
            }

            appt.ProviderId = providerId;
            appt.Subject = dto.Provider.Name;
            appt.ServiceType = dto.ServiceType;
            appt.ScheduledAt = scheduledAt;
            appt.DurationMinutes = dto.DurationMinutes;

            if (Enum.TryParse<AppointmentStatus>(dto.Status, true, out var status))
            {
                appt.Status = status;
            }

            appt.Notes = dto.Notes;
            appt.RawJson = JsonSerializer.Serialize(dto);
            appt.CachedAt = DateTime.UtcNow;

            _appointmentRepository.Update(appt);
        }

        // Appointments the clinic did not mention are left as they are: a push may be partial.
        await _unitOfWork.SaveChangesAsync(ct);
    }

    private static bool IsSentByClinic(Party from, ClinicAppointmentUpdatedEvent payload) =>
        from.Kind == PartyKind.Facility
        && string.Equals(from.TenantId, payload.TenantId, StringComparison.Ordinal)
        && Guid.TryParse(from.FacilityId, out var facilityId)
        && facilityId == payload.ClinicId;
}
